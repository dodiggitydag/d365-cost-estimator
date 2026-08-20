import type { PriceEntry, PricingCatalog } from './types';

export function priceEntry(pricing: PricingCatalog, id: string): PriceEntry {
  const entry = pricing.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Unknown price id: ${id}`);
  return entry;
}

export function money(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

/** Round to cents to keep floating-point noise out of totals. */
export function cents(n: number): number {
  return Math.round(n * 100) / 100;
}
