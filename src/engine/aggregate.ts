import type { CostLine, ItemCategory } from './types';
import { cents } from './catalogUtil';

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  'licensing-ms': 'Licensing — Microsoft',
  'payg-ms': 'Pay-as-you-go — Microsoft',
  isv: 'ISV licensing',
  custom: 'Other',
};

export function byCategoryMonth(
  lines: CostLine[],
  months: number,
): Map<ItemCategory, number[]> {
  const out = new Map<ItemCategory, number[]>();
  for (const line of lines) {
    let arr = out.get(line.category);
    if (!arr) {
      arr = new Array(months).fill(0);
      out.set(line.category, arr);
    }
    arr[line.month - 1] = cents(arr[line.month - 1] + line.amount);
  }
  return out;
}

export function byEnvMonth(
  lines: CostLine[],
  months: number,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const line of lines) {
    const key = line.envInstanceId ?? 'Tenant / shared';
    let arr = out.get(key);
    if (!arr) {
      arr = new Array(months).fill(0);
      out.set(key, arr);
    }
    arr[line.month - 1] = cents(arr[line.month - 1] + line.amount);
  }
  return out;
}

export function monthlyTotals(lines: CostLine[], months: number): number[] {
  const arr = new Array(months).fill(0);
  for (const line of lines) {
    arr[line.month - 1] = cents(arr[line.month - 1] + line.amount);
  }
  return arr;
}

/** Year totals: [Year 1, Year 2, ...] over the horizon. */
export function yearTotals(monthly: number[]): number[] {
  const years: number[] = [];
  for (let y = 0; y * 12 < monthly.length; y++) {
    const slice = monthly.slice(y * 12, (y + 1) * 12);
    years.push(cents(slice.reduce((a, b) => a + b, 0)));
  }
  return years;
}

// ---------------------------------------------------------------------------
// Calendar-aware reporting (anticipated start date)
// ---------------------------------------------------------------------------

export interface YearBucket {
  label: string;
  from: number; // 1-based project month, inclusive
  to: number;
}

/** "YYYY-MM" → { y, m } (m is 1-based), or null when unset/invalid. */
export function parseYearMonth(s?: string): { y: number; m: number } | null {
  const match = s?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  return { y: Number(match[1]), m };
}

/**
 * Split the horizon into year buckets. With a start date the buckets follow
 * calendar years (the first and last may be partial); without one they are
 * elapsed years ("Year 1", "Year 2", …).
 */
export function yearBuckets(
  months: number,
  start: { y: number; m: number } | null,
): YearBucket[] {
  const buckets: YearBucket[] = [];
  if (!start) {
    for (let y = 0; y * 12 < months; y++) {
      buckets.push({
        label: `Year ${y + 1}`,
        from: y * 12 + 1,
        to: Math.min((y + 1) * 12, months),
      });
    }
    return buckets;
  }
  let from = 1;
  let year = start.y;
  while (from <= months) {
    // months remaining in this calendar year, counting from the current month
    const monthOfYear = from === 1 ? start.m : 1;
    const to = Math.min(from + (12 - monthOfYear), months);
    buckets.push({ label: String(year), from, to });
    from = to + 1;
    year++;
  }
  return buckets;
}

export function bucketTotals(monthly: number[], buckets: YearBucket[]): number[] {
  return buckets.map((b) =>
    cents(monthly.slice(b.from - 1, b.to).reduce((a, v) => a + v, 0)),
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "M5", or "Oct 2026" when a start date is set. */
export function monthLabel(
  month: number,
  start: { y: number; m: number } | null,
): string {
  if (!start) return `M${month}`;
  const idx = start.m - 1 + (month - 1);
  return `${MONTH_NAMES[idx % 12]} ${start.y + Math.floor(idx / 12)}`;
}

export function grandTotal(monthly: number[]): number {
  return cents(monthly.reduce((a, b) => a + b, 0));
}

/** Lines contributing to one displayed cell — for explanation drill-ins. */
export function linesFor(
  lines: CostLine[],
  filter: { month?: number; category?: ItemCategory; envInstanceId?: string | null },
): CostLine[] {
  return lines.filter((l) => {
    if (filter.month !== undefined && l.month !== filter.month) return false;
    if (filter.category !== undefined && l.category !== filter.category) return false;
    if (filter.envInstanceId !== undefined) {
      const key = l.envInstanceId ?? null;
      if (key !== filter.envInstanceId) return false;
    }
    return true;
  });
}
