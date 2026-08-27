import type {
  CostLine,
  Estimate,
  EstimatorConfig,
  ScheduleMatrix,
} from './types';
import { cents, money, priceEntry } from './catalogUtil';

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
