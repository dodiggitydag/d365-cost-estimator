import type {
  CostLine,
  EnvInstance,
  Estimate,
  EstimatorConfig,
  ScheduleMatrix,
  StorageMonth,
  StoragePool,
} from './types';
import { STORAGE_POOLS, STORAGE_POOL_LABELS } from './types';
import { cents, money, priceEntry } from './catalogUtil';

/** License counts in effect for a given month (steps sorted by fromMonth). */
export function licenseCountsAt(
  estimate: Estimate,
  month: number,
): Record<string, number> {
  let counts: Record<string, number> = {};
  for (const step of [...estimate.licenseSteps].sort((a, b) => a.fromMonth - b.fromMonth)) {
    if (step.fromMonth <= month) counts = step.counts;
  }
  return counts;
}

export function tenantBaseAt(
  estimate: Estimate,
  config: EstimatorConfig,
  month: number,
): { gb: Partial<Record<StoragePool, number>>; baseId: string | undefined } {
  const counts = licenseCountsAt(estimate, month);
  for (const base of config.licenses.tenantBases) {
    if (base.ifAnyOf.some((id) => (counts[id] ?? 0) > 0)) {
      return { gb: base.gb, baseId: base.id };
    }
  }
  return { gb: {}, baseId: undefined };
}

/** Included (entitled) GB for a pool in a month: tenant base + per-license accrual + addons. */
export function includedGB(
  estimate: Estimate,
  config: EstimatorConfig,
  month: number,
  pool: StoragePool,
): { total: number; parts: Record<string, number> } {
  const counts = licenseCountsAt(estimate, month);
  const parts: Record<string, number> = {};
  const base = tenantBaseAt(estimate, config, month);
  const baseGB = base.gb[pool] ?? 0;
  if (baseGB) parts[`tenant base (${base.baseId})`] = baseGB;
  let total = baseGB;
  for (const lt of config.licenses.types) {
    const count = counts[lt.id] ?? 0;
    const per = lt.accrualGB[pool] ?? 0;
    if (count > 0 && per > 0) {
      const gb = count * per;
      parts[`${lt.label}: ${count} × ${per} GB`] = gb;
      total += gb;
    }
  }
  if (estimate.customerInsightsAddon) {
    const addon = config.licenses.addons.find((a) => a.id === 'customerInsights');
    const gb = addon?.gb[pool] ?? 0;
    if (gb) {
      parts['Customer Insights addon'] = gb;
      total += gb;
    }
  }
  return { total, parts };
}

function instanceStorageAt(
  inst: EnvInstance,
  config: EstimatorConfig,
  month: number,
  pool: StoragePool,
): number {
  if (inst.storageSteps && inst.storageSteps.length > 0) {
    let gb = 0;
    for (const step of [...inst.storageSteps].sort((a, b) => a.fromMonth - b.fromMonth)) {
      if (step.fromMonth <= month) gb = step.gb[pool] ?? 0;
    }
    return gb;
  }
  const envType = config.environments.find((e) => e.id === inst.typeId);
  return envType?.defaultStorageGB[pool] ?? 0;
}

/** Storage demand from all environments active in a month. */
export function neededGB(
  schedule: ScheduleMatrix,
  config: EstimatorConfig,
  month: number,
  pool: StoragePool,
): { total: number; parts: Record<string, number> } {
  let total = 0;
  const parts: Record<string, number> = {};
  for (const inst of schedule.instances) {
    if (!schedule.cells[inst.id][month - 1].active) continue;
    const gb = instanceStorageAt(inst, config, month, pool);
    if (gb > 0) {
      parts[inst.name] = gb;
      total += gb;
    }
  }
  return { total, parts };
}

export function computeStorage(
  estimate: Estimate,
  config: EstimatorConfig,
  schedule: ScheduleMatrix,
): { months: StorageMonth[]; lines: CostLine[] } {
  const months: StorageMonth[] = [];
  const lines: CostLine[] = [];

  for (let m = 1; m <= estimate.horizonMonths; m++) {
    for (const pool of STORAGE_POOLS) {
      const needed = neededGB(schedule, config, m, pool);
      const included = includedGB(estimate, config, m, pool);
      const overGB = Math.max(needed.total - included.total, 0);
      const priceId = config.licenses.overagePriceIds[pool];
      let cost = 0;
      if (priceId && overGB > 0) {
        const price = priceEntry(config.pricing, priceId);
        cost = cents(overGB * price.value);
        lines.push({
          id: `storage.${pool}.m${m}`,
          label: `${STORAGE_POOL_LABELS[pool]} storage overage`,
          category: 'licensing-ms',
          month: m,
          amount: cost,
          trace: {
            priceRefs: [priceId],
            formula: `MAX(${round1(needed.total)} GB needed − ${round1(included.total)} GB included, 0) × ${money(price.value)}/GB = ${money(cost)}`,
            inputs: {
              'needed GB': round1(needed.total),
              'included GB': round1(included.total),
              'overage GB': round1(overGB),
              ...prefixKeys('needed: ', needed.parts),
              ...prefixKeys('included: ', included.parts),
            },
          },
        });
      }
      if (needed.total > 0 || included.total > 0) {
        months.push({
          month: m,
          pool,
          neededGB: needed.total,
          includedGB: included.total,
          overageGB: overGB,
          overageCost: cost,
        });
      }
    }
  }
  return { months, lines };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function prefixKeys(
  prefix: string,
  obj: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj)) out[prefix + k] = round1(v);
  return out;
}
