import type {
  CostLine,
  EnvInstance,
  Estimate,
  EstimatorConfig,
  ScheduleMatrix,
  StorageBillingPool,
  StorageMonth,
  StoragePool,
} from './types';
import { STORAGE_POOLS, STORAGE_POOL_LABELS } from './types';
import { cents, money, priceEntry, stepAt } from './catalogUtil';

/** License counts in effect for a given month (steps sorted by fromMonth). */
export function licenseCountsAt(
  estimate: Estimate,
  month: number,
): Record<string, number> {
  return stepAt(estimate.licenseSteps, month)?.counts ?? {};
}

function tenantBaseAt(
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

/** Storage demand of one environment instance in a month, per pool.
 *  User-set steps win; otherwise the environment type's default. */
export function instanceStorageAt(
  inst: EnvInstance,
  config: EstimatorConfig,
  month: number,
  pool: StoragePool,
): number {
  if (inst.storageSteps && inst.storageSteps.length > 0) {
    return stepAt(inst.storageSteps, month)?.gb[pool] ?? 0;
  }
  const envType = config.environments.find((e) => e.id === inst.typeId);
  return envType?.defaultStorageGB[pool] ?? 0;
}

/** First month an instance is scheduled on — where its growth clock starts. */
export function firstActiveMonth(
  schedule: ScheduleMatrix,
  instanceId: string,
): number {
  const idx = (schedule.cells[instanceId] ?? []).findIndex((c) => c.active);
  return idx < 0 ? 1 : idx + 1;
}

/**
 * Extra GB a production-like environment has accrued from data growth by `month`.
 * Prorated monthly from `startMonth` (the environment's first active month), so
 * 24 GB/year shows as +2 GB after one month and +24 GB after a year. Only
 * environment types flagged `prodGrowthApplies` grow.
 */
export function growthGB(
  estimate: Estimate,
  inst: EnvInstance,
  config: EstimatorConfig,
  month: number,
  pool: StoragePool,
  startMonth: number,
): number {
  const envType = config.environments.find((e) => e.id === inst.typeId);
  if (!envType?.prodGrowthApplies) return 0;
  const perYear = estimate.settings.prodGrowthGBPerYear?.[pool] ?? 0;
  if (perYear <= 0) return 0;
  return (Math.max(0, month - startMonth) / 12) * perYear;
}

/** Storage demand from all environments active in a month. */
export function neededGB(
  estimate: Estimate,
  schedule: ScheduleMatrix,
  config: EstimatorConfig,
  month: number,
  pool: StoragePool,
): { total: number; parts: Record<string, number> } {
  let total = 0;
  const parts: Record<string, number> = {};
  for (const inst of schedule.instances) {
    if (!schedule.cells[inst.id][month - 1].active) continue;
    const base = instanceStorageAt(inst, config, month, pool);
    const growth = growthGB(
      estimate,
      inst,
      config,
      month,
      pool,
      firstActiveMonth(schedule, inst.id),
    );
    const gb = base + growth;
    if (gb > 0) {
      // Growth is called out in the key so the explain drawer shows where it came from.
      const key =
        growth > 0 ? `${inst.name} (${round1(base)} + ${round1(growth)} growth)` : inst.name;
      parts[key] = gb;
      total += gb;
    }
  }
  return { total, parts };
}

/**
 * The buckets storage is charged in. Falls back to one bucket per pool for
 * catalogs (and saved config overrides) written before the pools merged.
 */
export function billingGroups(config: EstimatorConfig): StorageBillingPool[] {
  const declared = config.licenses.billingPools;
  if (declared && declared.length > 0) return declared;
  return STORAGE_POOLS.map((pool) => ({
    id: pool,
    label: STORAGE_POOL_LABELS[pool],
    pools: [pool],
    priceId: config.licenses.overagePriceIds[pool],
  }));
}

export function computeStorage(
  estimate: Estimate,
  config: EstimatorConfig,
  schedule: ScheduleMatrix,
): { months: StorageMonth[]; lines: CostLine[] } {
  const months: StorageMonth[] = [];
  const lines: CostLine[] = [];
  const groups = billingGroups(config);

  for (let m = 1; m <= estimate.horizonMonths; m++) {
    for (const group of groups) {
      // Demand and entitlement are summed across the group BEFORE the overage is
      // taken, so spare capacity in one pool absorbs a shortfall in another.
      let neededTotal = 0;
      let includedTotal = 0;
      const parts: Record<string, number> = {};
      const subtotals: string[] = [];
      const merged = group.pools.length > 1;

      for (const pool of group.pools) {
        const needed = neededGB(estimate, schedule, config, m, pool);
        const included = includedGB(estimate, config, m, pool);
        neededTotal += needed.total;
        includedTotal += included.total;
        const short = STORAGE_POOL_LABELS[pool];
        if (merged) subtotals.push(`${round1(needed.total)} ${short}`);
        const nPrefix = merged ? `needed ${short}: ` : 'needed: ';
        const iPrefix = merged ? `included ${short}: ` : 'included: ';
        Object.assign(parts, prefixKeys(nPrefix, needed.parts));
        Object.assign(parts, prefixKeys(iPrefix, included.parts));
      }

      const overGB = Math.max(neededTotal - includedTotal, 0);
      let cost = 0;
      if (group.priceId && overGB > 0) {
        const price = priceEntry(config.pricing, group.priceId);
        cost = cents(overGB * price.value);
        const demand = merged
          ? `${round1(neededTotal)} GB needed (${subtotals.join(' + ')})`
          : `${round1(neededTotal)} GB needed`;
        lines.push({
          id: `storage.${group.id}.m${m}`,
          label: `${group.label} storage overage`,
          category: 'licensing-ms',
          month: m,
          amount: cost,
          trace: {
            priceRefs: [group.priceId],
            formula: `MAX(${demand} − ${round1(includedTotal)} GB included, 0) × ${money(price.value)}/GB = ${money(cost)}`,
            inputs: {
              'needed GB': round1(neededTotal),
              'included GB': round1(includedTotal),
              'overage GB': round1(overGB),
              ...parts,
            },
          },
        });
      }
      if (neededTotal > 0 || includedTotal > 0) {
        months.push({
          month: m,
          groupId: group.id,
          label: group.label,
          pools: group.pools,
          neededGB: neededTotal,
          includedGB: includedTotal,
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
