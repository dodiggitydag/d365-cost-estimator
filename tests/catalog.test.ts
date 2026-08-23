import { describe, expect, it } from 'vitest';
import pricing from '../src/catalog/pricing.v2026-08.json';
import licenses from '../src/catalog/licenses.json';
import environments from '../src/catalog/environments.json';
import rules from '../src/catalog/rules.default.json';
import {
  environmentTypeSchema,
  licenseCatalogSchema,
  pricingCatalogSchema,
  scheduleRuleSchema,
} from '../src/model/schemas';
import { z } from 'zod';

describe('catalog validation', () => {
  it('pricing catalog is valid and every entry is cited', () => {
    const parsed = pricingCatalogSchema.parse(pricing);
    for (const e of parsed.entries) {
      expect(e.sourceUrl, `${e.id} needs sourceUrl`).toMatch(/^https:/);
      expect(e.asOf, `${e.id} needs asOf`).toBeTruthy();
    }
  });

  it('license catalog is valid and price refs resolve', () => {
    const parsed = licenseCatalogSchema.parse(licenses);
    const priceIds = new Set(pricing.entries.map((e) => e.id));
    for (const t of parsed.types) {
      if (t.priceId) expect(priceIds.has(t.priceId), `price ${t.priceId}`).toBe(true);
    }
    for (const id of Object.values(parsed.overagePriceIds)) {
      expect(priceIds.has(id), `overage price ${id}`).toBe(true);
    }
    expect(priceIds.has(parsed.copilot.packPriceId)).toBe(true);
  });

  it('environment catalog is valid and component price refs resolve', () => {
    const parsed = z.array(environmentTypeSchema).parse(environments);
    const priceIds = new Set(pricing.entries.map((e) => e.id));
    for (const env of parsed) {
      for (const pid of env.componentPriceIds) {
        expect(priceIds.has(pid), `${env.id} component ${pid}`).toBe(true);
      }
    }
  });

  it('default rules are valid and reference known environments', () => {
    const parsed = z.array(scheduleRuleSchema).parse(rules);
    const envIds = new Set(environments.map((e) => e.id));
    for (const r of parsed) {
      expect(envIds.has(r.envTypeId), `rule ${r.id} env ${r.envTypeId}`).toBe(true);
    }
  });
});
