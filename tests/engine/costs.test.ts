import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/model/config';
import { newEstimate } from '../../src/model/estimate';
import {
  byCategoryMonth,
  computeEstimate,
  grandTotal,
  monthlyTotals,
  subscriptionStartMonth,
  yearTotals,
} from '../../src/engine';

describe('cost lines & aggregation', () => {
  const config = defaultConfig();

  it('environment components bill only for active months', () => {
    const est = newEstimate(config);
    const result = computeEstimate(est, config);
    // PROD AppInsights: active months 8–36 → 29 lines of $400
    const prodAI = result.lines.filter(
      (l) => l.envInstanceId === 'PROD' && l.trace.priceRefs.includes('env.appInsights'),
    );
    expect(prodAI).toHaveLength(29);
    expect(prodAI[0].amount).toBe(400);
    // DEV VMs: lead DEV01 months 2–36 (35) + DEV02–04 months 3–8 (3 × 6) → 53 lines of $180
    const devVm = result.lines.filter(
      (l) =>
        l.trace.priceRefs.includes('env.devVm') &&
        l.envInstanceId !== 'DEMO' &&
        l.envInstanceId?.startsWith('DEV'),
    );
    expect(devVm).toHaveLength(53);
    expect(devVm[0].amount).toBe(180);
  });

  it('a fresh estimate seeds the tenant tooling rows from the catalog', () => {
    const est = newEstimate(config);
    const byId = new Map(est.customItems.map((i) => [i.id, i]));
    // 4 consulting seats (3 FC + 1 SA) × $6/user/mo
    expect(byId.get('ado-basic')?.monthlyAmount).toBe((3 + 1) * 6);
    // 2 Microsoft-hosted agents × $40/mo
    expect(byId.get('ado-agents')?.monthlyAmount).toBe(2 * 40);
    expect(byId.get('ado-artifacts')?.monthlyAmount).toBe(10);
    // These were off by default, so they seed at $0 and bill nothing.
    expect(byId.get('ado-test-plans')?.monthlyAmount).toBe(0);
    expect(byId.get('azure-integration')?.monthlyAmount).toBe(0);
    expect(byId.get('ado-test-plans')?.toMonth).toBe(10); // month 1 → first go-live
    // Every row is an ordinary custom item — no built-in items remain.
    expect(est.standardItems).toBeUndefined();
    const result = computeEstimate(est, config);
    expect(result.lines.some((l) => l.id.startsWith('std.'))).toBe(false);
    const basic = result.lines.filter((l) => l.id.startsWith('custom.ado-basic.'));
    expect(basic).toHaveLength(36);
    expect(basic[0].amount).toBe(24);
  });

  it('the agent count seeds the agents row but does not track it afterwards', () => {
    const est = newEstimate(config);
    const seeded = est.customItems.find((i) => i.id === 'ado-agents')!.monthlyAmount;
    est.team.hostedAgents = 5;
    const result = computeEstimate(est, config);
    const agents = result.lines.filter((l) => l.id.startsWith('custom.ado-agents.'));
    expect(agents[0].amount).toBe(seeded); // flat row: still 2 × $40
  });

  it('lump-sum licensing starts at the first license step with users', () => {
    const est = newEstimate(config);
    est.licenseCostMode = { kind: 'lumpSum', monthlyTotal: 12345 };
    // Licenses bought at UAT, not at project start: zero users until month 8.
    est.licenseSteps = [
      { fromMonth: 1, counts: { erpFull: 0 } },
      { fromMonth: 8, counts: { erpFull: 100 } },
    ];
    expect(subscriptionStartMonth(est)).toBe(8);
    const result = computeEstimate(est, config);
    const cals = result.lines.filter((l) => l.id.startsWith('cals.'));
    expect(cals).toHaveLength(36 - 8 + 1);
    expect(cals.every((l) => l.amount === 12345)).toBe(true);
  });

  it('a licenseStartMonth left over from an older saved file is ignored', () => {
    const est = newEstimate(config);
    est.licenseCostMode = { kind: 'lumpSum', monthlyTotal: 1000 };
    est.licenseStartMonth = 12; // the retired input
    const result = computeEstimate(est, config);
    // Default step has users at month 1, so billing runs the whole horizon.
    expect(result.lines.filter((l) => l.id.startsWith('cals.'))).toHaveLength(36);
  });

  it('subscriptions fall back to the earliest step when no counts are entered', () => {
    const est = newEstimate(config);
    est.licenseSteps = [{ fromMonth: 3, counts: {} }];
    expect(subscriptionStartMonth(est)).toBe(3);
  });

  it('list-price licensing prices each license type from the catalog', () => {
    const est = newEstimate(config);
    est.licenseCostMode = { kind: 'listPrices' };
    est.licenseSteps = [{ fromMonth: 1, counts: { erpFull: 100, teamMember: 50 } }];
    const result = computeEstimate(est, config);
    const m1 = result.lines.filter((l) => l.id.startsWith('cals.') && l.month === 1);
    expect(m1.find((l) => l.id.includes('erpFull'))?.amount).toBe(100 * 210);
    expect(m1.find((l) => l.id.includes('teamMember'))?.amount).toBe(50 * 8);
  });

  it('custom items land in their category and window', () => {
    const est = newEstimate(config);
    est.customItems = [
      {
        id: 'isv1',
        name: 'Example ISV',
        category: 'isv',
        monthlyAmount: 500,
        fromMonth: 5,
        toMonth: 7,
      },
    ];
    const result = computeEstimate(est, config);
    const byCat = byCategoryMonth(result.lines, est.horizonMonths);
    const isv = byCat.get('isv')!;
    expect(isv[3]).toBe(0);
    expect(isv[4]).toBe(500);
    expect(isv[6]).toBe(500);
    expect(isv[7]).toBe(0);
  });

  it('year totals split the monthly stream into 12-month buckets', () => {
    const monthly = new Array(36).fill(100);
    expect(yearTotals(monthly)).toEqual([1200, 1200, 1200]);
    expect(grandTotal(monthly)).toBe(3600);
  });

  it('every line carries a formula and resolvable price refs', () => {
    const est = newEstimate(config);
    est.licenseCostMode = { kind: 'lumpSum', monthlyTotal: 1000 };
    const result = computeEstimate(est, config);
    const priceIds = new Set(config.pricing.entries.map((e) => e.id));
    for (const line of result.lines) {
      expect(line.trace.formula.length, line.id).toBeGreaterThan(0);
      for (const ref of line.trace.priceRefs) {
        expect(priceIds.has(ref), `${line.id} → ${ref}`).toBe(true);
      }
    }
    const totals = monthlyTotals(result.lines, est.horizonMonths);
    expect(grandTotal(totals)).toBeGreaterThan(0);
  });
});
