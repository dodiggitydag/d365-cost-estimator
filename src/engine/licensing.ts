import type { CostLine, Estimate, EstimatorConfig } from './types';
import { cents, money, priceEntry } from './catalogUtil';
import { licenseCountsAt } from './storage';

/**
 * User subscription (CAL) cost per month, from licenseStartMonth to horizon.
 * Two modes:
 *  - lumpSum: one negotiated monthly number ("just give me the number").
 *  - listPrices: Σ count × list price per license type, priced from the catalog.
 */
export function computeLicensing(
  estimate: Estimate,
  config: EstimatorConfig,
): CostLine[] {
  const lines: CostLine[] = [];
  const start = estimate.licenseStartMonth;

  for (let m = start; m <= estimate.horizonMonths; m++) {
    if (estimate.licenseCostMode.kind === 'lumpSum') {
      const amount = cents(estimate.licenseCostMode.monthlyTotal);
      if (amount === 0) continue;
      lines.push({
        id: `cals.m${m}`,
        label: 'D365 user subscriptions (negotiated total)',
        category: 'licensing-ms',
        month: m,
        amount,
        trace: {
          priceRefs: [],
          formula: `Negotiated monthly total for all user subscriptions = ${money(amount)}`,
          inputs: { 'monthly total': amount },
        },
      });
    } else {
      const counts = licenseCountsAt(estimate, m);
      for (const lt of config.licenses.types) {
        const count = counts[lt.id] ?? 0;
        if (count === 0 || !lt.priceId) continue;
        const price = priceEntry(config.pricing, lt.priceId);
        const amount = cents(count * price.value);
        lines.push({
          id: `cals.${lt.id}.m${m}`,
          label: `${lt.label} subscriptions`,
          category: 'licensing-ms',
          month: m,
          amount,
          trace: {
            priceRefs: [lt.priceId],
            formula: `${count} users × ${money(price.value)}/user/mo = ${money(amount)}`,
            inputs: { users: count, 'list price': price.value },
          },
        });
      }
    }
  }
  return lines;
}
