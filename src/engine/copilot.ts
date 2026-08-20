import type { CopilotMonth, CostLine, Estimate, EstimatorConfig } from './types';
import { cents, money, priceEntry } from './catalogUtil';
import { licenseCountsAt } from './storage';

/**
 * Copilot Studio credit math, mirroring the source workbook:
 *   packsRequired  = ROUNDUP(total agent credits / creditsPerPack)
 *   entitledPacks  = (Σ qualifying users × creditsPerUser) / creditsPerPack   (fractional, not floored)
 *   additional     = MAX(packsRequired − entitledPacks − ownedPacks, 0) × packPrice
 */
export function computeCopilot(
  estimate: Estimate,
  config: EstimatorConfig,
): { months: CopilotMonth[]; lines: CostLine[] } {
  const months: CopilotMonth[] = [];
  const lines: CostLine[] = [];
  const { creditsPerPack, packPriceId } = config.licenses.copilot;
  const packPrice = priceEntry(config.pricing, packPriceId);

  for (let m = 1; m <= estimate.horizonMonths; m++) {
    const agents = estimate.copilotAgents.filter(
      (a) => a.fromMonth <= m && m <= a.toMonth,
    );
    const credits = agents.reduce((s, a) => s + a.creditsPerMonth, 0);
    if (credits === 0) continue;

    const counts = licenseCountsAt(estimate, m);
    let entitledCredits = 0;
    const entitledParts: Record<string, number> = {};
    for (const lt of config.licenses.types) {
      const per = lt.copilotCreditsPerUser ?? 0;
      const count = counts[lt.id] ?? 0;
      if (per > 0 && count > 0) {
        entitledCredits += per * count;
        entitledParts[`${lt.label}: ${count} × ${per}`] = per * count;
      }
    }

    const packsRequired = Math.ceil(credits / creditsPerPack);
    const entitledPacks = entitledCredits / creditsPerPack;
    const additionalPacks = Math.max(
      packsRequired - entitledPacks - estimate.copilotPacksOwned,
      0,
    );
    const cost = cents(additionalPacks * packPrice.value);

    months.push({
      month: m,
      creditsNeeded: credits,
      packsRequired,
      entitledPacks,
      packsOwned: estimate.copilotPacksOwned,
      additionalPacks,
      cost,
    });

    if (cost > 0) {
      lines.push({
        id: `copilot.m${m}`,
        label: 'Copilot Studio message packs (additional)',
        category: 'licensing-ms',
        month: m,
        amount: cost,
        trace: {
          priceRefs: [packPriceId],
          formula:
            `MAX(ROUNDUP(${credits.toLocaleString()} credits ÷ ${creditsPerPack.toLocaleString()}) = ${packsRequired}` +
            ` − ${round2(entitledPacks)} entitled − ${estimate.copilotPacksOwned} owned, 0)` +
            ` × ${money(packPrice.value)} = ${money(cost)}`,
          inputs: {
            'agent credits/mo': credits,
            'packs required': packsRequired,
            'entitled packs': round2(entitledPacks),
            'packs owned': estimate.copilotPacksOwned,
            ...Object.fromEntries(
              agents.map((a) => [`agent: ${a.name}`, a.creditsPerMonth]),
            ),
            ...entitledParts,
          },
        },
      });
    }
  }
  return { months, lines };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
