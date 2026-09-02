import pricingJson from '../catalog/pricing.v2026-09.json';
import licensesJson from '../catalog/licenses.json';
import environmentsJson from '../catalog/environments.json';
import rulesJson from '../catalog/rules.default.json';
import commerceJson from '../catalog/commerce.json';
import type {
  CommerceCatalog,
  EnvironmentType,
  EstimatorConfig,
  LicenseCatalog,
  PricingCatalog,
  ScheduleRule,
} from '../engine/types';

/** Bundled defaults (inlined into the single-file build — no runtime fetch). */
export function defaultConfig(): EstimatorConfig {
  return {
    pricing: structuredClone(pricingJson) as PricingCatalog,
    licenses: structuredClone(licensesJson) as LicenseCatalog,
    environments: structuredClone(environmentsJson) as EnvironmentType[],
    rules: structuredClone(rulesJson) as ScheduleRule[],
    commerce: structuredClone(commerceJson) as CommerceCatalog,
  };
}

/**
 * Partial config overrides a downloader can apply without rebuilding:
 * edited in the Settings UI or imported from a config-overrides.json file.
 * Each present section replaces the default section wholesale (simple and
 * predictable; exports always contain complete sections).
 */
export interface ConfigOverrides {
  pricing?: PricingCatalog;
  licenses?: LicenseCatalog;
  environments?: EnvironmentType[];
  rules?: ScheduleRule[];
  commerce?: CommerceCatalog;
}

export function effectiveConfig(overrides: ConfigOverrides | null): EstimatorConfig {
  const base = defaultConfig();
  if (!overrides) return base;
  return {
    pricing: overrides.pricing ?? base.pricing,
    licenses: overrides.licenses ?? base.licenses,
    environments: overrides.environments ?? base.environments,
    rules: overrides.rules ?? base.rules,
    // Overrides saved before Commerce support existed lack this section; fall back.
    commerce: overrides.commerce ?? base.commerce,
  };
}
