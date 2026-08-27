import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/model/config';
import { newEstimate } from '../../src/model/estimate';
import { computeCopilot } from '../../src/engine/copilot';

// Mirrors workbook rows 197–208:
//   packs required = ROUNDUP(credits / 25000)
//   entitled packs = ((attach + cePremium + erpPremium) × 1000) / 25000  (fractional)
//   additional $  = MAX(required − entitled − owned, 0) × $200

describe('Copilot Studio packs (workbook parity)', () => {
  const config = defaultConfig();

  it('rounds packs up and nets out entitlement and owned packs', () => {
    const est = newEstimate(config);
    est.licenseSteps = [{ fromMonth: 1, counts: { erpPremium: 10 } }]; // 10,000 credits = 0.4 packs
    est.copilotAgents = [
      { id: 'a1', name: 'Agent 1', creditsPerMonth: 30000, fromMonth: 1, toMonth: 12 },
    ];
    est.copilotPacksOwned = 0;
    const { months, lines } = computeCopilot(est, config);
    const m1 = months.find((m) => m.month === 1)!;
    expect(m1.packsRequired).toBe(2); // ceil(30000/25000)
    expect(m1.entitledPacks).toBeCloseTo(0.4, 6);
    expect(m1.additionalPacks).toBeCloseTo(1.6, 6);
    expect(m1.cost).toBeCloseTo(320, 2); // 1.6 × $200
    expect(lines.find((l) => l.month === 1)?.amount).toBeCloseTo(320, 2);
  });

  it('attach licenses count toward entitlement (workbook H206)', () => {
    const est = newEstimate(config);
    est.licenseSteps = [
      { fromMonth: 1, counts: { attach: 25, cePremium: 15, erpPremium: 10 } },
    ]; // 50 × 1000 credits = 2 packs entitled
    est.copilotAgents = [
      { id: 'a1', name: 'Agent 1', creditsPerMonth: 50000, fromMonth: 1, toMonth: 1 },
    ];
    const { months } = computeCopilot(est, config);
    expect(months[0].packsRequired).toBe(2);
    expect(months[0].entitledPacks).toBe(2);
    expect(months[0].cost).toBe(0);
  });

  it('agents outside their window cost nothing', () => {
    const est = newEstimate(config);
    est.copilotAgents = [
      { id: 'a1', name: 'Agent 1', creditsPerMonth: 30000, fromMonth: 5, toMonth: 6 },
    ];
    const { months } = computeCopilot(est, config);
    expect(months.map((m) => m.month)).toEqual([5, 6]);
  });
});
