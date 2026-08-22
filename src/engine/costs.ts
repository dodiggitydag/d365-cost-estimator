import type {
  CostLine,
  Estimate,
  EstimatorConfig,
  ScheduleMatrix,
} from './types';
import { cents, money, priceEntry } from './catalogUtil';
import { goLiveMonth } from './schedule';

/** Per-environment monthly components (AppInsights, dev VM, add-on env fee...). */
export function computeEnvironmentCosts(
  _estimate: Estimate,
  config: EstimatorConfig,
  schedule: ScheduleMatrix,
): CostLine[] {
  const lines: CostLine[] = [];
  for (const inst of schedule.instances) {
    const envType = config.environments.find((e) => e.id === inst.typeId);
    if (!envType) continue;
    const row = schedule.cells[inst.id];
    for (let m = 1; m <= schedule.months; m++) {
      const cell = row[m - 1];
      if (!cell.active) continue;
      for (const priceId of envType.componentPriceIds) {
        const price = priceEntry(config.pricing, priceId);
        if (price.value === 0) continue;
        lines.push({
          id: `env.${inst.id}.${priceId}.m${m}`,
          label: `${inst.name} — ${price.label}`,
          category: 'payg-ms',
          envInstanceId: inst.id,
          month: m,
          amount: cents(price.value),
          trace: {
            priceRefs: [priceId],
            ruleIds: cell.ruleIds,
            overridden: cell.overridden,
            formula: `${price.label} while ${inst.name} is active = ${money(price.value)}/mo`,
            inputs: { environment: inst.name, month: m },
          },
        });
      }
    }
  }
  return lines;
}

interface StandardItemDef {
  id: string;
  label: string;
  category: 'payg-ms';
  enabledByDefault: boolean;
  /** Monthly amount + formula + inputs, computed from the estimate. */
  compute: (
    estimate: Estimate,
    config: EstimatorConfig,
  ) => { amount: number; priceRefs: string[]; formula: string; inputs: Record<string, number | string> };
  /** Active window; defaults to the whole horizon. */
  defaultWindow?: (estimate: Estimate) => { from: number; to: number };
}

function firstGoLive(estimate: Estimate): number {
  return Math.min(...estimate.rollouts.map(goLiveMonth));
}

/** A tenant item that is just a flat catalog price per month. */
function flatFee(id: string, label: string, priceId: string, enabledByDefault: boolean): StandardItemDef {
  return {
    id,
    label,
    category: 'payg-ms',
    enabledByDefault,
    compute: (_est, cfg) => {
      const price = priceEntry(cfg.pricing, priceId);
      return {
        amount: cents(price.value),
        priceRefs: [priceId],
        formula: `${price.label} = ${money(price.value)}/mo`,
        inputs: {},
      };
    },
  };
}

export const STANDARD_ITEMS: StandardItemDef[] = [
  {
    id: 'azdoBasic',
    label: 'Azure DevOps Basic licenses (consulting team)',
    category: 'payg-ms',
    enabledByDefault: true,
    compute: (est, cfg) => {
      const seats = est.team.functionalConsultants + est.team.solutionArchitects;
      const price = priceEntry(cfg.pricing, 'ado.basic');
      return {
        amount: cents(seats * price.value),
        priceRefs: ['ado.basic'],
        formula: `${seats} consulting seats × ${money(price.value)}/user/mo (first 5 free seats assumed used by the client team)`,
        inputs: { 'functional consultants': est.team.functionalConsultants, 'solution architects': est.team.solutionArchitects },
      };
    },
  },
  {
    id: 'azdoTestPlans',
    label: 'Azure DevOps Test Plans licenses',
    category: 'payg-ms',
    enabledByDefault: false,
    compute: (est, cfg) => {
      const seats = est.team.functionalConsultants + est.team.solutionArchitects;
      const price = priceEntry(cfg.pricing, 'ado.testPlans');
      return {
        amount: cents(seats * price.value),
        priceRefs: ['ado.testPlans'],
        formula: `${seats} consulting seats × ${money(price.value)}/user/mo`,
        inputs: { seats },
      };
    },
    defaultWindow: (est) => ({ from: 1, to: firstGoLive(est) }),
  },
  flatFee('azdoPipelines', 'Microsoft-hosted pipelines', 'ado.pipelines', true),
  flatFee('azdoArtifacts', 'Azure DevOps artifact storage', 'ado.artifacts', true),
  flatFee('azureIntegration', 'Azure Integration Services', 'azure.integration', false),
];

export function computeStandardItems(
  estimate: Estimate,
  config: EstimatorConfig,
): CostLine[] {
  const lines: CostLine[] = [];
  for (const def of STANDARD_ITEMS) {
    const settings = estimate.standardItems[def.id];
    if (!settings || !settings.enabled) continue;
    const win = def.defaultWindow?.(estimate) ?? { from: 1, to: estimate.horizonMonths };
    const from = settings.fromMonth ?? win.from;
    const to = settings.toMonth ?? win.to;
    const { amount, priceRefs, formula, inputs } = def.compute(estimate, config);
    if (amount === 0) continue;
    for (let m = Math.max(1, from); m <= Math.min(estimate.horizonMonths, to); m++) {
      lines.push({
        id: `std.${def.id}.m${m}`,
        label: def.label,
        category: def.category,
        month: m,
        amount,
        trace: { priceRefs, formula, inputs },
      });
    }
  }
  return lines;
}

export function computeCustomItems(estimate: Estimate): CostLine[] {
  const lines: CostLine[] = [];
  for (const item of estimate.customItems) {
    const amount = cents(item.monthlyAmount);
    if (amount === 0) continue;
    for (
      let m = Math.max(1, item.fromMonth);
      m <= Math.min(estimate.horizonMonths, item.toMonth);
      m++
    ) {
      lines.push({
        id: `custom.${item.id}.m${m}`,
        label: item.name,
        category: item.category,
        month: m,
        amount,
        trace: {
          priceRefs: [],
          formula: `${item.name}: ${money(amount)}/mo (months ${item.fromMonth}–${item.toMonth})${item.notes ? ` — ${item.notes}` : ''}`,
          inputs: item.sourceUrl ? { source: item.sourceUrl } : {},
        },
      });
    }
  }
  return lines;
}
