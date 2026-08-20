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
