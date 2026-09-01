import type {
  CommerceCatalog,
  CommerceMonth,
  CostLine,
  Estimate,
  EstimatorConfig,
  PriceEntry,
  PricingCatalog,
} from './types';
import { cents, money, priceEntry, stepAt } from './catalogUtil';

/**
 * Dynamics 365 Commerce e-commerce math (Dynamics 365 Licensing Guide,
 * "Additional Dynamics 365 Commerce applications, add-ons and capacities"):
 *
 *   band   = the AOV band containing averageOrderValue (lower edge inclusive)
 *   per tier: units = ROUNDUP(MAX(tx − included[band], 0) / perUnit[band])
 *             total = tier price + units × overage price
 *   choose the cheapest tier; a tie keeps the lower tier.
 *
 * Every e-Commerce tier includes one Commerce Scale Unit – Cloud, so API and
 * headless order volume is covered by the tier line. Standalone CSU rows and
 * Ratings & Reviews are flat monthly add-ons. Microsoft licenses tiers per
 * month but enforces transactions annually; this tool evaluates the monthly
 * average, so seasonal spikes are smoothed rather than trued-up.
 */

/** 1-based AOV band. Lower edges are inclusive: with bounds [50, ...], $50 → Band 2. */
export function commerceBand(aov: number, catalog: CommerceCatalog): number {
  let band = 1;
  for (const bound of catalog.bandUpperBoundsAOV) {
    if (aov >= bound) band++;
  }
  return band;
}

export interface CommerceTierChoice {
  tierId: string;
  tierLabel: string;
  band: number;
  bandLabel: string;
  includedTransactions: number;
  overageUnits: number;
  /** Transactions one overage unit adds in this band. */
  unitTransactions: number;
  tierPrice: PriceEntry;
  overagePrice: PriceEntry;
  total: number;
  /** Every tier's evaluated monthly total, for the explain drawer / UI badge. */
  candidates: Record<string, number>;
}

/** Cheapest tier + overage combination for a monthly volume. Throws on unknown price ids. */
export function selectCommerceTier(
  transactionsPerMonth: number,
  averageOrderValue: number,
  commerce: CommerceCatalog,
  pricing: PricingCatalog,
): CommerceTierChoice {
  const band = commerceBand(averageOrderValue, commerce);
  const idx = band - 1;
  const candidates: Record<string, number> = {};
  let best: CommerceTierChoice | undefined;
  for (const tier of commerce.tiers) {
    const included = tier.includedTransactionsPerMonth[idx];
    const perUnit = tier.overageUnitTransactions[idx];
    const tierPrice = priceEntry(pricing, tier.priceId);
    const overagePrice = priceEntry(pricing, tier.overagePriceId);
    const units =
      transactionsPerMonth > included
        ? Math.ceil((transactionsPerMonth - included) / perUnit)
        : 0;
    const total = cents(tierPrice.value + units * overagePrice.value);
    candidates[tier.label] = total;
    // Strict < keeps the earlier (lower) tier on a tie.
    if (!best || total < best.total) {
      best = {
        tierId: tier.id,
        tierLabel: tier.label,
        band,
        bandLabel: commerce.bandLabels[idx] ?? `Band ${band}`,
        includedTransactions: included,
        overageUnits: units,
        unitTransactions: perUnit,
        tierPrice,
        overagePrice,
        total,
        candidates,
      };
    }
  }
  if (!best) throw new Error('Commerce catalog has no e-Commerce tiers');
  best.candidates = candidates;
  return best;
}

export function computeCommerce(
  estimate: Estimate,
  config: EstimatorConfig,
): { months: CommerceMonth[]; lines: CostLine[] } {
  const months: CommerceMonth[] = [];
  const lines: CostLine[] = [];
  const commerce = config.commerce;

  for (let m = 1; m <= estimate.horizonMonths; m++) {
    const step = stepAt(estimate.commerceSteps, m);
    const tx = step?.transactionsPerMonth ?? 0;
    const aov = step?.averageOrderValue ?? 0;

    // Standalone CSU add-ons bill on their own windows, independent of volume.
    let csuCost = 0;
    const csuLines: CostLine[] = [];
    for (const row of estimate.commerceScaleUnits) {
      if (row.count <= 0 || m < row.fromMonth || m > row.toMonth) continue;
      const def = commerce.scaleUnits.find((s) => s.id === row.tier);
      if (!def) continue; // unknown tier id (edited catalog) — skip rather than crash
      const price = priceEntry(config.pricing, def.priceId);
      if (price.value === 0) continue;
      const amount = cents(row.count * price.value);
      csuCost += amount;
      csuLines.push({
        id: `commerce.csu.${row.id}.m${m}`,
        label: `Commerce Scale Unit – Cloud (${def.label}, additional)`,
        category: 'licensing-ms',
        month: m,
        amount,
        trace: {
          priceRefs: [def.priceId],
          formula:
            `${row.count} × CSU ${def.label} at ${money(price.value)}/mo = ${money(amount)}` +
            ` (each entitles ${def.devices} Operations – Device; every e-Commerce tier already includes one cloud CSU)`,
          inputs: {
            'CSU count': row.count,
            'devices entitled per unit': def.devices,
          },
        },
      });
    }

    if (tx > 0) {
      const choice = selectCommerceTier(tx, aov, commerce, config.pricing);
      const tierCost = cents(choice.tierPrice.value);
      const overageCost = cents(choice.overageUnits * choice.overagePrice.value);

      lines.push({
        id: `commerce.ecom.m${m}`,
        label: `${choice.tierLabel} (e-commerce / Commerce APIs)`,
        category: 'licensing-ms',
        month: m,
        amount: tierCost,
        trace: {
          priceRefs: [choice.tierPrice.id],
          formula:
            `${tx.toLocaleString()} transactions/mo at ${money(aov)} AOV → ${choice.bandLabel}` +
            ` → cheapest tier = ${choice.tierLabel} at ${money(choice.tierPrice.value)}/mo` +
            ` (includes ${choice.includedTransactions.toLocaleString()} transactions/mo and 1 Commerce Scale Unit – Cloud, which also serves headless/API traffic)`,
          inputs: {
            'transactions/mo': tx,
            'average order value': money(aov),
            band: choice.bandLabel,
            'included transactions/mo': choice.includedTransactions,
            ...Object.fromEntries(
              Object.entries(choice.candidates).map(([label, total]) => [
                `candidate: ${label}`,
                money(total),
              ]),
            ),
          },
        },
      });

      if (choice.overageUnits > 0) {
        lines.push({
          id: `commerce.ecom.overage.m${m}`,
          label: `${choice.tierLabel} overage units`,
          category: 'licensing-ms',
          month: m,
          amount: overageCost,
          trace: {
            priceRefs: [choice.overagePrice.id],
            formula:
              `ROUNDUP((${tx.toLocaleString()} − ${choice.includedTransactions.toLocaleString()} included)` +
              ` ÷ ${choice.unitTransactions.toLocaleString()} transactions/unit) = ${choice.overageUnits} units` +
              ` × ${money(choice.overagePrice.value)} = ${money(overageCost)}`,
            inputs: {
              'transactions/mo': tx,
              'included transactions/mo': choice.includedTransactions,
              'transactions per overage unit': choice.unitTransactions,
              'overage units': choice.overageUnits,
            },
          },
        });
      }

      let rnrCost = 0;
      if (estimate.commerceRatingsReviews) {
        const rnr = priceEntry(config.pricing, commerce.ratingsReviewsPriceId);
        if (rnr.value > 0) {
          rnrCost = cents(rnr.value);
          lines.push({
            id: `commerce.rnr.m${m}`,
            label: 'Commerce Ratings and Reviews add-on',
            category: 'licensing-ms',
            month: m,
            amount: rnrCost,
            trace: {
              priceRefs: [rnr.id],
              formula: `Ratings and Reviews add-on (requires e-commerce) = ${money(rnr.value)}/mo`,
              inputs: { 'e-commerce transactions/mo': tx },
            },
          });
        }
      }

      months.push({
        month: m,
        transactions: tx,
        aov,
        band: choice.band,
        tierId: choice.tierId,
        tierLabel: choice.tierLabel,
        includedTransactions: choice.includedTransactions,
        overageUnits: choice.overageUnits,
        tierCost,
        overageCost,
        csuCost,
        rnrCost,
        totalCost: cents(tierCost + overageCost + csuCost + rnrCost),
      });
    }

    lines.push(...csuLines);
  }
  return { months, lines };
}
