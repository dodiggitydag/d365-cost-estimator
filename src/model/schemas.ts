import { z } from 'zod';

const storageGB = z.object({
  fscmData: z.number().nonnegative().optional(),
  fscmFile: z.number().nonnegative().optional(),
  dvData: z.number().nonnegative().optional(),
  dvFile: z.number().nonnegative().optional(),
  dvLog: z.number().nonnegative().optional(),
});

export const priceEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number().nonnegative(),
  currency: z.literal('USD'),
  unit: z.enum(['user/mo', 'env/mo', 'GB/mo', 'pack', 'mo', 'device/mo']),
  sourceUrl: z.string().url(),
  guideSection: z.string().optional(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

export const pricingCatalogSchema = z.object({
  version: z.string().min(1),
  asOf: z.string(),
  sourceUrl: z.string().url(),
  entries: z.array(priceEntrySchema).superRefine((entries, ctx) => {
    const seen = new Set<string>();
    for (const e of entries) {
      if (seen.has(e.id)) ctx.addIssue({ code: 'custom', message: `Duplicate price id: ${e.id}` });
      seen.add(e.id);
    }
  }),
});

export const licenseCatalogSchema = z.object({
  types: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      priceId: z.string().optional(),
      accrualGB: storageGB,
      copilotCreditsPerUser: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    }),
  ),
  tenantBases: z.array(
    z.object({
      id: z.string(),
      ifAnyOf: z.array(z.string()),
      gb: storageGB,
      notes: z.string().optional(),
    }),
  ),
  addons: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      gb: storageGB,
      notes: z.string().optional(),
    }),
  ),
  overagePriceIds: z.record(z.string(), z.string()),
  copilot: z.object({
    creditsPerPack: z.number().positive(),
    packPriceId: z.string(),
  }),
});

export const environmentTypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  componentPriceIds: z.array(z.string()),
  defaultStorageGB: storageGB,
  allowMultiple: z.boolean().optional(),
  optional: z.boolean().optional(),
});

const anchorOffsetSchema = z.union([
  z.number().int(),
  z.object({
    setting: z.literal('prodLeadMonths'),
    negate: z.boolean().optional(),
  }),
]);

const anchorSchema = z.union([
  z.object({
    phaseKind: z.enum(['initiate', 'implement', 'prepare', 'operate', 'custom']),
    edge: z.enum(['start', 'end']),
    offsetMonths: anchorOffsetSchema.optional(),
  }),
  z.object({
    event: z.enum(['goLive', 'projectStart', 'horizonEnd']),
    offsetMonths: anchorOffsetSchema.optional(),
  }),
]);

export const scheduleRuleSchema = z.object({
  id: z.string().min(1),
  envTypeId: z.string().min(1),
  from: anchorSchema,
  to: anchorSchema,
  count: z
    .union([z.number().int().positive(), z.object({ input: z.literal('concurrentDevs') })])
    .optional(),
  appliesTo: z.enum(['all', 'firstInstance']).optional(),
  rationale: z.string().min(1),
});

export const configOverridesSchema = z.object({
  pricing: pricingCatalogSchema.optional(),
  licenses: licenseCatalogSchema.optional(),
  environments: z.array(environmentTypeSchema).optional(),
  rules: z.array(scheduleRuleSchema).optional(),
});

export const estimateSchema = z.object({
  schemaVersion: z.literal(1),
  meta: z.object({
    name: z.string(),
    createdAt: z.string(),
    catalogVersion: z.string(),
  }),
  horizonMonths: z.number().int().min(1).max(60),
  startYearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  rollouts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phases: z.array(
        z.object({
          id: z.string(),
          kind: z.enum(['initiate', 'implement', 'prepare', 'operate', 'custom']),
          name: z.string(),
          startMonth: z.number().int().min(1),
          lengthMonths: z.number().int().min(1),
        }),
      ),
      goLiveMonthOverride: z.number().int().min(1).optional(),
    }),
  ).min(1),
  team: z.object({
    concurrentDevs: z.number().int().nonnegative(),
    functionalConsultants: z.number().int().nonnegative(),
    solutionArchitects: z.number().int().nonnegative(),
  }),
  licenseSteps: z.array(
    z.object({
      fromMonth: z.number().int().min(1),
      counts: z.record(z.string(), z.number().nonnegative()),
    }),
  ).min(1),
  licenseCostMode: z.union([
    z.object({ kind: z.literal('listPrices') }),
    z.object({ kind: z.literal('lumpSum'), monthlyTotal: z.number().nonnegative() }),
  ]),
  licenseStartMonth: z.number().int().min(1),
  copilotAgents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      creditsPerMonth: z.number().nonnegative(),
      fromMonth: z.number().int().min(1),
      toMonth: z.number().int().min(1),
    }),
  ),
  copilotPacksOwned: z.number().nonnegative(),
  customerInsightsAddon: z.boolean(),
  environments: z.array(
    z.object({
      id: z.string(),
      typeId: z.string(),
      name: z.string(),
      storageSteps: z
        .array(z.object({ fromMonth: z.number().int().min(1), gb: storageGB }))
        .optional(),
      fromRule: z.boolean().optional(),
    }),
  ),
  // default([]) keeps estimates saved before this field existed loadable
  disabledEnvIds: z.array(z.string()).default([]),
  customItems: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.enum(['licensing-ms', 'payg-ms', 'isv', 'custom']),
      monthlyAmount: z.number().nonnegative(),
      fromMonth: z.number().int().min(1),
      toMonth: z.number().int().min(1),
      sourceUrl: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  gridOverrides: z.array(
    z.object({
      envInstanceId: z.string(),
      month: z.number().int().min(1),
      active: z.boolean(),
    }),
  ),
  standardItems: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      fromMonth: z.number().int().min(1).optional(),
      toMonth: z.number().int().min(1).optional(),
    }),
  ),
  settings: z.object({
    prodLeadMonths: z.number().int().nonnegative(),
  }),
});
