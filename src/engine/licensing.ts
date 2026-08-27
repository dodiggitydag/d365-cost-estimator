import type { CostLine, Estimate, EstimatorConfig } from './types';
import { cents, money, priceEntry } from './catalogUtil';
import { licenseCountsAt } from './storage';

/**
 * First month user subscriptions are paid: the earliest license step that has
 * users in it. The steps are the single source of truth — there is no separate
 * "subscriptions start" input, so a client who buys licenses at UAT is modelled
 * with a zero-count step at month 1 and the real counts at the buying month.
 * Falls back to the earliest step when every count is zero (e.g. a negotiated
 * lump sum entered before the user mix is known).
 */
export function subscriptionStartMonth(estimate: Estimate): number {
  const steps = [...estimate.licenseSteps].sort((a, b) => a.fromMonth - b.fromMonth);
  const withUsers = steps.find((s) =>
    Object.values(s.counts).some((n) => n > 0),
  );
  return Math.max(1, (withUsers ?? steps[0])?.fromMonth ?? 1);
}

/**
 * User subscription (CAL) cost per month, from the first month licenses exist
 * (see subscriptionStartMonth) to the horizon.
 * Two modes:
 *  - lumpSum: one negotiated monthly number ("just give me the number").
 *  - listPrices: Σ count × list price per license type, priced from the catalog.
 */
export function computeLicensing(
  estimate: Estimate,
  config: EstimatorConfig,
): CostLine[] {
  const lines: CostLine[] = [];
  const start = subscriptionStartMonth(estimate);

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
