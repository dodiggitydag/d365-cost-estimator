import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/model/config';
import { newEstimate } from '../../src/model/estimate';
import {
  byCategoryMonth,
  computeEstimate,
  grandTotal,
  monthlyTotals,
  yearTotals,
} from '../../src/engine';

describe('cost lines & aggregation', () => {
  const config = defaultConfig();

  it('environment components bill only for active months', () => {
    const est = newEstimate('test');
    const result = computeEstimate(est, config);
    // PROD AppInsights: active months 8–36 → 29 lines of $400
    const prodAI = result.lines.filter(
      (l) => l.envInstanceId === 'PROD' && l.trace.priceRefs.includes('env.appInsights'),
    );
    expect(prodAI).toHaveLength(29);
    expect(prodAI[0].amount).toBe(400);
    // DEV VMs: 4 devs × months 3–10 → 32 lines of $180
    const devVm = result.lines.filter((l) => l.trace.priceRefs.includes('env.devVm') && l.envInstanceId?.startsWith('DEV'));
    expect(devVm).toHaveLength(32);
    expect(devVm[0].amount).toBe(180);
  });

  it('standard items compute from team inputs', () => {
    const est = newEstimate('test');
    const result = computeEstimate(est, config);
    const azdo = result.lines.filter((l) => l.id.startsWith('std.azdoBasic'));
    expect(azdo).toHaveLength(36);
    expect(azdo[0].amount).toBe((6 + 2) * 6); // 8 seats × $6
    expect(azdo[0].trace.formula).toContain('8 consulting seats');
  });

  it('lump-sum licensing produces one line per month from licenseStartMonth', () => {
    const est = newEstimate('test');
    est.licenseCostMode = { kind: 'lumpSum', monthlyTotal: 12345 };
    est.licenseStartMonth = 8;
    const result = computeEstimate(est, config);
    const cals = result.lines.filter((l) => l.id.startsWith('cals.'));
    expect(cals).toHaveLength(36 - 8 + 1);
    expect(cals.every((l) => l.amount === 12345)).toBe(true);
  });

  it('list-price licensing prices each license type from the catalog', () => {
    const est = newEstimate('test');
    est.licenseCostMode = { kind: 'listPrices' };
    est.licenseSteps = [{ fromMonth: 1, counts: { erpFull: 100, teamMember: 50 } }];
    const result = computeEstimate(est, config);
    const m1 = result.lines.filter((l) => l.id.startsWith('cals.') && l.month === 1);
    expect(m1.find((l) => l.id.includes('erpFull'))?.amount).toBe(100 * 210);
    expect(m1.find((l) => l.id.includes('teamMember'))?.amount).toBe(50 * 8);
  });

  it('custom items land in their category and window', () => {
    const est = newEstimate('test');
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
    const est = newEstimate('test');
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
