import timelineJson from '../catalog/timeline.default.json';
import type {
  CustomCostItem,
  Estimate,
  EstimatorConfig,
  PricingCatalog,
  Rollout,
} from '../engine/types';
import { goLiveMonth } from '../engine/schedule';

const ADO_PRICING_URL =
  'https://azure.microsoft.com/pricing/details/devops/azure-devops-services/';

/**
 * Catalog price, or 0 when a config override has dropped the entry. Seeding must
 * never throw: a missing price would otherwise lock the user out of starting a
 * fresh estimate.
 */
function priceOrZero(pricing: PricingCatalog, id: string): number {
  return pricing.entries.find((e) => e.id === id)?.value ?? 0;
}

/**
 * Tenant tooling rows every project needs, seeded into `customItems` so a fresh
 * estimate carries them. Amounts are computed once here from the catalog and the
 * default team/agent counts, then belong to the user — they are ordinary editable
 * rows and do NOT track the inputs afterwards. Rows that used to be off by
 * default are seeded at $0, which bills nothing until sized.
 */
function seededItems(config: EstimatorConfig, estimate: Estimate): CustomCostItem[] {
  const { pricing } = config;
  const horizon = estimate.horizonMonths;
  const firstGoLive = Math.min(...estimate.rollouts.map(goLiveMonth));
  const seats = estimate.team.functionalConsultants + estimate.team.solutionArchitects;
  const basic = priceOrZero(pricing, 'ado.basic');
  const testPlans = priceOrZero(pricing, 'ado.testPlans');
  const agent = priceOrZero(pricing, 'ado.pipelines');
  return [
    {
      id: 'ado-basic',
      name: 'Azure DevOps Basic licenses (consulting team)',
      category: 'payg-ms',
      monthlyAmount: seats * basic,
      fromMonth: 1,
      toMonth: horizon,
      sourceUrl: ADO_PRICING_URL,
      notes: `${seats} consulting seats × $${basic}/user/mo. First 5 users are free — assumed used by the client's own team.`,
    },
    {
      id: 'ado-agents',
      name: 'Microsoft-hosted Azure DevOps agents',
      category: 'payg-ms',
      monthlyAmount: estimate.team.hostedAgents * agent,
      fromMonth: 1,
      toMonth: horizon,
      sourceUrl: ADO_PRICING_URL,
      notes: `${estimate.team.hostedAgents} parallel jobs × $${agent}/mo. One Microsoft-hosted parallel job is free for private projects — deduct it if that applies.`,
    },
    {
      id: 'ado-artifacts',
      name: 'Azure DevOps artifact storage',
      category: 'payg-ms',
      monthlyAmount: priceOrZero(pricing, 'ado.artifacts'),
      fromMonth: 1,
      toMonth: horizon,
      sourceUrl: ADO_PRICING_URL,
    },
    {
      id: 'ado-test-plans',
      name: 'Azure DevOps Test Plans licenses',
      category: 'payg-ms',
      monthlyAmount: 0,
      fromMonth: 1,
      toMonth: firstGoLive,
      sourceUrl: ADO_PRICING_URL,
      notes: `Off by default. ${seats} consulting seats × $${testPlans}/user/mo = $${seats * testPlans}/mo if the project uses Test Plans.`,
    },
    {
      id: 'azure-integration',
      name: 'Azure Integration Services (Logic Apps / Functions)',
      category: 'payg-ms',
      monthlyAmount: 0,
      fromMonth: 1,
      toMonth: horizon,
      sourceUrl: 'https://azure.microsoft.com/pricing/details/logic-apps/',
      notes: `Off by default. About $${priceOrZero(pricing, 'azure.integration')}/mo for light workloads — size it for the interfaces in scope.`,
    },
    {
      id: 'example-fabric',
      name: 'Fabric capacity (example — replace with your sizing)',
      category: 'payg-ms',
      monthlyAmount: 0,
      fromMonth: 1,
      toMonth: horizon,
      sourceUrl: 'https://azure.microsoft.com/pricing/details/microsoft-fabric/',
      notes: 'Reserved capacity example. Set the monthly amount for your F-SKU.',
    },
  ];
}

/** Immutable single-item update for id-keyed lists — shared by the input panels. */
export function patchById<T extends { id: string }>(
  arr: T[],
  id: string,
  patch: Partial<T>,
): T[] {
  return arr.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

export function newEstimate(config: EstimatorConfig): Estimate {
  const timeline = structuredClone(timelineJson) as {
    horizonMonths: number;
    rollouts: Rollout[];
  };
  const estimate: Estimate = {
    schemaVersion: 1,
    meta: {
      name: '',
      createdAt: new Date().toISOString(),
      catalogVersion: config.pricing.version,
    },
    horizonMonths: timeline.horizonMonths,
    rollouts: timeline.rollouts,
    team: {
      concurrentDevs: 4,
      functionalConsultants: 3,
      solutionArchitects: 1,
      hostedAgents: 2,
    },
    licenseSteps: [
      {
        fromMonth: 1,
        counts: {
          erpPremium: 0,
          erpFull: 100,
          commerce: 0,
          cePremium: 0,
          ceEnterprise: 0,
          csProfessional: 0,
          attach: 0,
          activity: 0,
          teamMember: 0,
          device: 0,
        },
      },
    ],
    licenseCostMode: { kind: 'lumpSum', monthlyTotal: 0 },
    // Cowork is on nearly every deal now, so the line is pre-seeded at zero
    // credits (costs nothing until sized) the way the Fabric item below is.
    copilotAgents: [
      {
        id: 'm365-copilot-cowork',
        name: 'M365 Copilot Cowork (assume 10,000 credits/user/mo — set your usage)',
        creditsPerMonth: 0,
        fromMonth: goLiveMonth(timeline.rollouts[0]),
        toMonth: timeline.horizonMonths,
      },
    ],
    copilotPacksOwned: 0,
    customerInsightsAddon: false,
    // Commerce is off until a volume step is added; empty inputs cost nothing.
    commerceSteps: [],
    commerceScaleUnits: [],
    commerceRatingsReviews: false,
    environments: [],
    disabledEnvIds: [],
    // Filled in below, once the estimate object exists to derive amounts from.
    customItems: [],
    gridOverrides: [],
    settings: {
      prodLeadMonths: 2,
      // Zero by default: growth is client-specific and should never inflate an
      // estimate silently. Set it per pool in the Environments panel.
      prodGrowthGBPerYear: { fscmData: 0, fscmFile: 0, dvData: 0, dvFile: 0 },
    },
  };
  return { ...estimate, customItems: seededItems(config, estimate) };
}

/**
 * Estimates saved while "other cost items" were built-in toggles carry a
 * `standardItems` map. Convert the enabled ones into custom items at the amount
 * they used to compute to, so an old estimate opens with the same total instead of
 * silently losing those lines. Dropping the map makes this a one-time conversion.
 */
export function migrateStandardItems(
  estimate: Estimate,
  config: EstimatorConfig,
): Estimate {
  const legacy = estimate.standardItems;
  if (!legacy || Object.keys(legacy).length === 0) return estimate;

  const { pricing } = config;
  const seats = estimate.team.functionalConsultants + estimate.team.solutionArchitects;
  const horizon = estimate.horizonMonths;
  const firstGoLive = Math.min(...estimate.rollouts.map(goLiveMonth));
  // The retired amounts, verbatim. ado.pipelines used to be one $120 line covering
  // three parallel jobs; it is now priced per agent, hence the × 3.
  const retired: Record<string, { id: string; name: string; amount: number; to: number }> = {
    azdoBasic: {
      id: 'ado-basic',
      name: 'Azure DevOps Basic licenses (consulting team)',
      amount: seats * priceOrZero(pricing, 'ado.basic'),
      to: horizon,
    },
    azdoTestPlans: {
      id: 'ado-test-plans',
      name: 'Azure DevOps Test Plans licenses',
      amount: seats * priceOrZero(pricing, 'ado.testPlans'),
      to: firstGoLive,
    },
    azdoPipelines: {
      id: 'ado-agents',
      name: 'Microsoft-hosted Azure DevOps agents',
      amount: 3 * priceOrZero(pricing, 'ado.pipelines'),
      to: horizon,
    },
    azdoArtifacts: {
      id: 'ado-artifacts',
      name: 'Azure DevOps artifact storage',
      amount: priceOrZero(pricing, 'ado.artifacts'),
      to: horizon,
    },
    azureIntegration: {
      id: 'azure-integration',
      name: 'Azure Integration Services (Logic Apps / Functions)',
      amount: priceOrZero(pricing, 'azure.integration'),
      to: horizon,
    },
  };

  const taken = new Set(estimate.customItems.map((i) => i.id));
  const converted: CustomCostItem[] = [];
  for (const [key, settings] of Object.entries(legacy)) {
    const def = retired[key];
    if (!def || !settings.enabled || taken.has(def.id)) continue;
    converted.push({
      id: def.id,
      name: def.name,
      category: 'payg-ms',
      monthlyAmount: def.amount,
      fromMonth: settings.fromMonth ?? 1,
      toMonth: settings.toMonth ?? def.to,
      sourceUrl: ADO_PRICING_URL,
      notes: 'Converted from a built-in item when these became editable rows.',
    });
  }

  const { standardItems: _dropped, ...rest } = estimate;
  return { ...rest, customItems: [...estimate.customItems, ...converted] };
}

/** Append a rollout cloned from the SbD template, starting after the last one. */
export function addRollout(estimate: Estimate): Estimate {
  const last = estimate.rollouts[estimate.rollouts.length - 1];
  const lastPrepare =
    last.phases.find((p) => p.kind === 'prepare') ?? last.phases[last.phases.length - 1];
  const start = lastPrepare.startMonth + lastPrepare.lengthMonths;
  const n = estimate.rollouts.length + 1;
  const id = `rollout-${n}`;
  const rollout: Rollout = {
    id,
    name: `Rollout ${n}`,
    phases: [
      { id: `${id}-implement`, kind: 'implement', name: 'Implement', startMonth: start, lengthMonths: 4 },
      { id: `${id}-prepare`, kind: 'prepare', name: 'Prepare', startMonth: start + 4, lengthMonths: 2 },
      { id: `${id}-operate`, kind: 'operate', name: 'Operate', startMonth: start + 6, lengthMonths: Math.max(1, estimate.horizonMonths - (start + 6) + 1) },
    ],
  };
  return { ...estimate, rollouts: [...estimate.rollouts, rollout] };
}
