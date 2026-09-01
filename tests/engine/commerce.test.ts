import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/model/config';
import { newEstimate } from '../../src/model/estimate';
import {
  commerceBand,
  computeCommerce,
  selectCommerceTier,
} from '../../src/engine/commerce';
import { computeEstimate } from '../../src/engine';

// Expected values are hand-computed from the Dynamics 365 Licensing Guide
// (August 2026), "Number of monthly transactions per SKU" table, at list
// prices: Tier 1 $4,000 / Tier 2 $14,500 / Tier 3 $31,000, overage unit $500.
const config = defaultConfig();

describe('commerceBand', () => {
  it('maps AOV to bands with inclusive lower edges', () => {
    const cases: [number, number][] = [
      [0, 1],
      [49.99, 1],
      [50, 2],
      [149.99, 2],
      [150, 3],
      [499.99, 3],
      [500, 4],
      [2000, 5],
      [4999.99, 5],
      [5000, 6],
      [25000, 6],
    ];
    for (const [aov, band] of cases) {
      expect(commerceBand(aov, config.commerce), `AOV $${aov}`).toBe(band);
    }
  });
});

describe('selectCommerceTier', () => {
  it('adds overage units instead of jumping tiers while that is cheaper', () => {
    // Band 2: Tier 1 includes 2,400/mo; 600 over ÷ 365/unit → 2 units.
    const c = selectCommerceTier(3000, 50, config.commerce, config.pricing);
    expect(c.band).toBe(2);
    expect(c.tierId).toBe('tier1');
    expect(c.overageUnits).toBe(2);
    expect(c.total).toBe(4000 + 2 * 500);
    expect(c.candidates['e-Commerce Tier 2']).toBe(14500);
  });

  it('charges no overage at exactly the included quantity', () => {
    // Band 3 ($150 AOV): Tier 1 includes exactly 1,100/mo.
    const c = selectCommerceTier(1100, 150, config.commerce, config.pricing);
    expect(c.band).toBe(3);
    expect(c.tierId).toBe('tier1');
    expect(c.overageUnits).toBe(0);
    expect(c.total).toBe(4000);
  });

  it('keeps the lower tier on a cost tie, then crosses over', () => {
    // Band 1: Tier 1 covers 4,700 + 21 × 780 = 21,080 at $4,000 + 21 × $500
    // = $14,500 — exactly Tier 2's base price.
    const tie = selectCommerceTier(21080, 10, config.commerce, config.pricing);
    expect(tie.tierId).toBe('tier1');
    expect(tie.overageUnits).toBe(21);
    expect(tie.total).toBe(14500);
    // One more transaction needs a 22nd unit ($15,000) — Tier 2 wins with none.
    const over = selectCommerceTier(21081, 10, config.commerce, config.pricing);
    expect(over.tierId).toBe('tier2');
    expect(over.overageUnits).toBe(0);
    expect(over.total).toBe(14500);
  });

  it('reaches Tier 3 for high-AOV volume', () => {
    // Band 6: T1 = 4,000 + ceil(29,800/30)=994 × 500 = $501,000;
    // T2 = 14,500 + ceil(28,840/50)=577 × 500 = $303,000;
    // T3 = 31,000 + ceil(26,600/55)=484 × 500 = $273,000.
    const c = selectCommerceTier(30000, 5000, config.commerce, config.pricing);
    expect(c.band).toBe(6);
    expect(c.tierId).toBe('tier3');
    expect(c.overageUnits).toBe(484);
    expect(c.total).toBe(273000);
    expect(c.candidates['e-Commerce Tier 1']).toBe(501000);
    expect(c.candidates['e-Commerce Tier 2']).toBe(303000);
  });
});

describe('computeCommerce', () => {
  it('emits nothing for a fresh estimate', () => {
    const est = newEstimate(config);
    const { months, lines } = computeCommerce(est, config);
    expect(months).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('emits nothing while the step in effect has zero transactions', () => {
    const est = newEstimate(config);
    est.commerceSteps = [{ fromMonth: 1, transactionsPerMonth: 0, averageOrderValue: 100 }];
    const { months, lines } = computeCommerce(est, config);
    expect(months).toEqual([]);
    expect(lines).toEqual([]);
  });

  it('re-derives tier and band per month as stepped volume grows', () => {
    const est = newEstimate(config);
    est.horizonMonths = 12;
    est.commerceSteps = [
      { fromMonth: 1, transactionsPerMonth: 3000, averageOrderValue: 60 },
      { fromMonth: 7, transactionsPerMonth: 40000, averageOrderValue: 60 },
    ];
    const { months, lines } = computeCommerce(est, config);
    expect(months.length).toBe(12);

    const m1 = months[0];
    expect(m1.tierId).toBe('tier1');
    expect(m1.band).toBe(2);
    expect(m1.overageUnits).toBe(2);
    expect(m1.totalCost).toBe(5000);

    // Month 7: T1 = 4,000 + ceil(37,600/365)=104 × 500 = $56,000;
    // T2 = 14,500 + ceil(28,000/540)=52 × 500 = $40,500;
    // T3 = 31,000 + ceil(1,250/625)=2 × 500 = $32,000 → Tier 3.
    const m7 = months[6];
    expect(m7.tierId).toBe('tier3');
    expect(m7.overageUnits).toBe(2);
    expect(m7.totalCost).toBe(32000);

    const tierLines = lines.filter((l) => l.id.startsWith('commerce.ecom.m'));
    expect(tierLines.length).toBe(12);
    expect(tierLines[0].amount).toBe(4000);
    expect(tierLines[6].amount).toBe(31000);
    const overageLines = lines.filter((l) => l.id.startsWith('commerce.ecom.overage.'));
    expect(overageLines.length).toBe(12); // 2 units in every month of both steps
    expect(overageLines[0].amount).toBe(1000);
  });

  it('bills Ratings & Reviews only in months with e-commerce volume', () => {
    const est = newEstimate(config);
    est.horizonMonths = 12;
    est.commerceRatingsReviews = true;
    est.commerceSteps = [{ fromMonth: 7, transactionsPerMonth: 1000, averageOrderValue: 200 }];
    const { lines } = computeCommerce(est, config);
    const rnr = lines.filter((l) => l.id.startsWith('commerce.rnr.'));
    expect(rnr.length).toBe(6); // months 7–12 only
    expect(rnr[0].month).toBe(7);
    expect(rnr[0].amount).toBe(750);
  });

  it('bills standalone Scale Units on their own window, independent of volume', () => {
    const est = newEstimate(config);
    est.horizonMonths = 12;
    est.commerceScaleUnits = [
      { id: 'csu-1', tier: 'standard', count: 2, fromMonth: 10, toMonth: 12 },
    ];
    const { months, lines } = computeCommerce(est, config);
    expect(months).toEqual([]); // no e-commerce volume
    expect(lines.length).toBe(3);
    for (const l of lines) {
      expect(l.amount).toBe(2 * 17000);
      expect(l.trace.priceRefs).toEqual(['commerce.csuStandard']);
    }
    expect(lines.map((l) => l.month)).toEqual([10, 11, 12]);
  });

  it('flows into computeEstimate with resolvable, explained lines', () => {
    const est = newEstimate(config);
    est.commerceSteps = [{ fromMonth: 3, transactionsPerMonth: 3000, averageOrderValue: 50 }];
    est.commerceScaleUnits = [
      { id: 'csu-1', tier: 'basic', count: 1, fromMonth: 3, toMonth: est.horizonMonths },
    ];
    est.commerceRatingsReviews = true;
    const result = computeEstimate(est, config);
    expect(result.commerce.length).toBe(est.horizonMonths - 2);
    const commerceLines = result.lines.filter((l) => l.id.startsWith('commerce.'));
    expect(commerceLines.length).toBeGreaterThan(0);
    const priceIds = new Set(config.pricing.entries.map((e) => e.id));
    for (const line of commerceLines) {
      expect(line.category).toBe('licensing-ms');
      expect(line.trace.formula.length, line.id).toBeGreaterThan(0);
      for (const ref of line.trace.priceRefs) {
        expect(priceIds.has(ref), `${line.id} → ${ref}`).toBe(true);
      }
    }
  });
});
