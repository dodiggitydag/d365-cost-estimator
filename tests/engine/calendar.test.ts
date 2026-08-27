import { describe, expect, it } from 'vitest';
import {
  bucketTotals,
  monthLabel,
  parseYearMonth,
  yearBuckets,
} from '../../src/engine';
import { defaultConfig } from '../../src/model/config';
import { newEstimate } from '../../src/model/estimate';
import { buildSchedule } from '../../src/engine';

describe('calendar-year buckets', () => {
  it('parses YYYY-MM and rejects junk', () => {
    expect(parseYearMonth('2026-10')).toEqual({ y: 2026, m: 10 });
    expect(parseYearMonth('2026-13')).toBeNull();
    expect(parseYearMonth('junk')).toBeNull();
    expect(parseYearMonth(undefined)).toBeNull();
  });

  it('elapsed buckets are 12-month slices', () => {
    expect(yearBuckets(30, null)).toEqual([
      { label: 'Year 1', from: 1, to: 12 },
      { label: 'Year 2', from: 13, to: 24 },
      { label: 'Year 3', from: 25, to: 30 },
    ]);
  });

  it('calendar buckets split at January (Oct 2026 start, 36 months)', () => {
    const buckets = yearBuckets(36, { y: 2026, m: 10 });
    expect(buckets).toEqual([
      { label: '2026', from: 1, to: 3 }, // Oct–Dec
      { label: '2027', from: 4, to: 15 },
      { label: '2028', from: 16, to: 27 },
      { label: '2029', from: 28, to: 36 }, // Jan–Sep
    ]);
  });

  it('bucket totals sum the right slices', () => {
    const monthly = new Array(36).fill(100);
    const totals = bucketTotals(monthly, yearBuckets(36, { y: 2026, m: 10 }));
    expect(totals).toEqual([300, 1200, 1200, 900]);
    expect(totals.reduce((a, b) => a + b, 0)).toBe(3600);
  });

  it('month labels are calendar-aware', () => {
    expect(monthLabel(1, null)).toBe('M1');
    expect(monthLabel(1, { y: 2026, m: 10 })).toBe('Oct 2026');
    expect(monthLabel(4, { y: 2026, m: 10 })).toBe('Jan 2027');
    expect(monthLabel(16, { y: 2026, m: 10 })).toBe('Jan 2028');
  });
});

describe('environment removal (disabledEnvIds)', () => {
  it('removes rule-derived instances and survives regeneration', () => {
    const config = defaultConfig();
    const est = newEstimate(config);
    est.disabledEnvIds = ['TRAIN', 'GOLD', 'DEV03'];
    const s = buildSchedule(est, config);
    const ids = s.instances.map((i) => i.id);
    expect(ids).not.toContain('TRAIN');
    expect(ids).not.toContain('GOLD');
    expect(ids).not.toContain('DEV03');
    expect(ids).toContain('DEV01');
    expect(ids).toContain('DEV04'); // other DEVs unaffected
    expect(ids).toContain('PROD');
  });
});
