// Shared type system for the estimator. The engine is pure TypeScript with no
// UI dependencies; everything here is serializable.

// ---------------------------------------------------------------------------
// Pricing catalog
// ---------------------------------------------------------------------------

export type PriceUnit =
  | 'user/mo'
  | 'env/mo'
  | 'GB/mo'
  | 'pack'
  | 'mo'
  | 'device/mo'
  | 'agent/mo';

export interface PriceEntry {
  id: string;
  label: string;
  value: number;
  currency: 'USD';
  unit: PriceUnit;
  /** Where the number comes from — licensing guide or pricing page. */
  sourceUrl: string;
  /** Section/table name inside the source, so AI-assisted updates know where to look. */
  guideSection?: string;
  /** ISO date the price was checked. */
  asOf: string;
  notes?: string;
}

export interface PricingCatalog {
  version: string;
  asOf: string;
  sourceUrl: string;
  entries: PriceEntry[];
}

// ---------------------------------------------------------------------------
// Licenses & storage entitlements
// ---------------------------------------------------------------------------

export type StoragePool = 'fscmData' | 'fscmFile' | 'dvData' | 'dvFile' | 'dvLog';

export const STORAGE_POOLS: StoragePool[] = [
  'fscmData',
  'fscmFile',
  'dvData',
  'dvFile',
  'dvLog',
];

export const STORAGE_POOL_LABELS: Record<StoragePool, string> = {
  fscmData: 'F&SCM data',
  fscmFile: 'F&SCM file',
  dvData: 'Dataverse data',
  dvFile: 'Dataverse file',
  dvLog: 'Dataverse log',
};

export interface LicenseType {
  id: string; // erpPremium, erpFull, cePremium, ...
  label: string;
  /** Optional list-price reference (pricing catalog id). */
  priceId?: string;
  /** Per-user storage entitlement accrual in GB per pool. */
  accrualGB: Partial<Record<StoragePool, number>>;
  /** Copilot Studio credits granted per user per month (e.g. 1000 for Premium). */
  copilotCreditsPerUser?: number;
  notes?: string;
}

/**
 * Tenant-level base entitlement. Evaluated in order; the first entry whose
 * `ifAnyOf` license types have a nonzero count wins.
 */
export interface TenantBaseEntitlement {
  id: string;
  ifAnyOf: string[]; // license type ids
  gb: Partial<Record<StoragePool, number>>;
  notes?: string;
}

/** A set of storage pools charged as one bucket. */
export interface StorageBillingPool {
  id: string;
  label: string;
  pools: StoragePool[];
  /** Overage price ref; omit for a pool that is tracked but never billed. */
  priceId?: string;
  notes?: string;
}

export interface LicenseCatalog {
  types: LicenseType[];
  tenantBases: TenantBaseEntitlement[];
  /** Optional entitlement add-ons, e.g. Customer Insights. */
  addons: {
    id: string;
    label: string;
    gb: Partial<Record<StoragePool, number>>;
    notes?: string;
  }[];
  /** Storage overage price refs per pool (pricing catalog ids). */
  overagePriceIds: Partial<Record<StoragePool, string>>;
  /**
   * How pools are charged. Microsoft's merged capacity model bills F&SCM and
   * Dataverse out of ONE data pool and ONE file pool, so demand and entitlement
   * are summed across `pools` before the overage is taken — netting a surplus in
   * one system against a shortfall in the other. Omit to bill each pool alone
   * (the pre-merge behaviour, kept for older config overrides).
   */
  billingPools?: StorageBillingPool[];
  copilot: {
    creditsPerPack: number;
    packPriceId: string;
  };
}

// ---------------------------------------------------------------------------
// Commerce catalog (e-Commerce tiers, Scale Units, add-ons)
// ---------------------------------------------------------------------------

/**
 * One e-Commerce tier SKU family. Arrays are indexed by AOV band (index 0 =
 * Band 1). Quantities come from the Dynamics 365 Licensing Guide's "Number of
 * monthly transactions per SKU" table; dollars stay in the pricing catalog.
 */
export interface CommerceTier {
  id: string; // tier1, tier2, tier3
  label: string;
  priceId: string;
  overagePriceId: string;
  /** e-commerce transactions included per month, by band. */
  includedTransactionsPerMonth: number[];
  /** Transactions added by one overage unit, by band. */
  overageUnitTransactions: number[];
}

/** A standalone Commerce Scale Unit – Cloud add-on size. */
export interface CommerceCsuTier {
  id: string; // basic, standard, premium
  label: string;
  priceId: string;
  /** Operations – Device entitlement included per unit. */
  devices: number;
}

export interface CommerceCatalog {
  /**
   * Ascending AOV band boundaries; lower edges are inclusive, so with
   * [50, 150, 500, 2000, 5000] an AOV of $50 lands in Band 2. Band count is
   * bounds + 1.
   */
  bandUpperBoundsAOV: number[];
  /** One label per band (bounds + 1 entries). */
  bandLabels: string[];
  /** Evaluated in order; a cost tie keeps the earlier (lower) tier. */
  tiers: CommerceTier[];
  scaleUnits: CommerceCsuTier[];
  ratingsReviewsPriceId: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Environments
// ---------------------------------------------------------------------------

export interface EnvironmentType {
  id: string; // PROD, UAT, DEV, ...
  label: string;
  /** Methodology prose shown in explanations. */
  description: string;
  /** Monthly cost components applied for every active month (pricing ids). */
  componentPriceIds: string[];
  /** Default storage demand in GB while active. */
  defaultStorageGB: Partial<Record<StoragePool, number>>;
  /** Production-like: the estimate's per-year storage growth accrues here. */
  prodGrowthApplies?: boolean;
  /** Sandbox-style: instances of this type mirror Production's storage demand
   *  after go-live unless the instance sets `mirrorProdStorage` explicitly. */
  mirrorsProdByDefault?: boolean;
  /** DEV-style: one instance per concurrent developer. */
  allowMultiple?: boolean;
  /** Not part of the default plan; user can add it. */
  optional?: boolean;
}

// ---------------------------------------------------------------------------
// Timeline: rollouts & phases (Success by Design)
// ---------------------------------------------------------------------------

export type PhaseKind = 'initiate' | 'implement' | 'prepare' | 'operate' | 'custom';

export interface Phase {
  id: string;
  kind: PhaseKind;
  name: string;
  startMonth: number; // 1-based, absolute
  lengthMonths: number;
}

export interface Rollout {
  id: string;
  name: string;
  phases: Phase[];
  /** Defaults to the end of the Prepare phase. */
  goLiveMonthOverride?: number;
}

// ---------------------------------------------------------------------------
// Scheduling rules
// ---------------------------------------------------------------------------

/** A fixed month offset, or one driven by an estimate setting (e.g. PROD lead time). */
export type AnchorOffset =
  | number
  | { setting: 'prodLeadMonths'; negate?: boolean };

export type Anchor =
  | { phaseKind: PhaseKind; edge: 'start' | 'end'; offsetMonths?: AnchorOffset }
  | { event: 'goLive' | 'projectStart' | 'horizonEnd'; offsetMonths?: AnchorOffset };

export interface ScheduleRule {
  id: string;
  envTypeId: string;
  from: Anchor;
  to: Anchor;
  /** Number of instances (DEV): fixed or driven by an input. */
  count?: number | { input: 'concurrentDevs' };
  /** For allowMultiple environments: which instances this window applies to
   *  (default 'all'). 'firstInstance' targets only e.g. DEV01 — the lead box. */
  appliesTo?: 'all' | 'firstInstance';
  /** Why — shown verbatim in explanations. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Estimate document (what the user edits; serializable, versioned)
// ---------------------------------------------------------------------------

export interface StorageStep {
  fromMonth: number;
  gb: Partial<Record<StoragePool, number>>;
}

export interface EnvInstance {
  id: string; // unique instance id, e.g. "DEV01"
  typeId: string; // EnvironmentType id
  name: string;
  /** Storage demand while active; steps allow ramping (e.g. PROD data growth). */
  storageSteps?: StorageStep[];
  /** Instance created by a rule (regenerated) vs. added by the user. */
  fromRule?: boolean;
  /** Mirror Production's storage demand after go-live (refreshed-from-PROD
   *  sandbox). Absent = the environment type's `mirrorsProdByDefault`. */
  mirrorProdStorage?: boolean;
}

export interface LicenseStep {
  fromMonth: number;
  counts: Record<string, number>; // license type id -> user count
}

export type LicenseCostMode =
  | { kind: 'listPrices' }
  | { kind: 'lumpSum'; monthlyTotal: number };

export interface CopilotAgent {
  id: string;
  name: string;
  creditsPerMonth: number;
  fromMonth: number;
  toMonth: number; // inclusive
}

/** Commerce e-commerce volume in effect from a month onward (stepAt semantics). */
export interface CommerceStep {
  fromMonth: number;
  /** e-commerce transactions per month — a transaction is one completed cart. */
  transactionsPerMonth: number;
  /** Average order value in USD (annual GMV ÷ transactions); selects the band. */
  averageOrderValue: number;
}

/** Standalone Commerce Scale Unit – Cloud add-ons bought for a window. */
export interface CommerceScaleUnit {
  id: string;
  /** CommerceCsuTier id: basic, standard, premium. */
  tier: string;
  count: number;
  fromMonth: number;
  toMonth: number; // inclusive
}

export type ItemCategory = 'licensing-ms' | 'payg-ms' | 'isv' | 'custom';

export interface CustomCostItem {
  id: string;
  name: string;
  category: ItemCategory;
  monthlyAmount: number;
  fromMonth: number;
  toMonth: number; // inclusive
  sourceUrl?: string;
  notes?: string;
}

export interface GridOverride {
  envInstanceId: string;
  month: number;
  active: boolean;
}

export interface StandardItemSettings {
  enabled: boolean;
  fromMonth?: number; // defaults per item
  toMonth?: number;
}

export interface Estimate {
  schemaVersion: 1;
  meta: {
    name: string;
    createdAt: string;
    catalogVersion: string;
  };
  horizonMonths: number; // <= 60
  /** Anticipated project start, "YYYY-MM". Enables calendar-year reporting. */
  startYearMonth?: string;
  rollouts: Rollout[];
  team: {
    concurrentDevs: number;
    functionalConsultants: number;
    solutionArchitects: number;
    /** Microsoft-hosted Azure DevOps parallel jobs (build agents). */
    hostedAgents: number;
  };
  licenseSteps: LicenseStep[];
  licenseCostMode: LicenseCostMode;
  /**
   * @deprecated Superseded by the license steps: subscriptions now start at the
   * first step that has users. Still accepted on import so older saved estimates
   * keep loading; never written by the app and ignored by the engine.
   */
  licenseStartMonth?: number;
  copilotAgents: CopilotAgent[];
  copilotPacksOwned: number;
  customerInsightsAddon: boolean;
  /**
   * D365 Commerce e-commerce volume over time. Empty = Commerce not in scope
   * (the engine emits nothing). The tier/band is derived per month from the
   * step in effect.
   */
  commerceSteps: CommerceStep[];
  /** Standalone Commerce Scale Unit – Cloud add-ons (each e-Commerce tier already includes one). */
  commerceScaleUnits: CommerceScaleUnit[];
  /** Ratings & Reviews add-on; billed only in months with e-commerce volume. */
  commerceRatingsReviews: boolean;
  environments: EnvInstance[];
  /** Rule-derived instances the user removed (e.g. TRAIN, GOLD, DEV03). */
  disabledEnvIds: string[];
  customItems: CustomCostItem[];
  gridOverrides: GridOverride[];
  /**
   * @deprecated Built-in tenant-level toggles (AzDO, integrations...). Retired in
   * favour of plain custom items, which are editable. Still accepted on import so
   * older saved estimates keep loading — `migrateStandardItems` converts the
   * enabled ones into `customItems`; never written by the app.
   */
  standardItems?: Record<string, StandardItemSettings>;
  settings: {
    prodLeadMonths: number; // PROD starts N months before first go-live
    /** Annual data growth of production environments, GB per year per pool. */
    prodGrowthGBPerYear: Partial<Record<StoragePool, number>>;
  };
}

// ---------------------------------------------------------------------------
// Effective config (defaults ⊕ user overrides)
// ---------------------------------------------------------------------------

export interface EstimatorConfig {
  pricing: PricingCatalog;
  licenses: LicenseCatalog;
  environments: EnvironmentType[];
  rules: ScheduleRule[];
  commerce: CommerceCatalog;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface ScheduleCell {
  active: boolean;
  /** Rules that made this cell active (empty if only an override did). */
  ruleIds: string[];
  rolloutIds: string[];
  overridden: boolean;
}

export interface ScheduleMatrix {
  months: number;
  instances: EnvInstance[];
  /** instanceId -> array indexed by month-1 */
  cells: Record<string, ScheduleCell[]>;
}

export interface Trace {
  priceRefs: string[];
  ruleIds?: string[];
  overridden?: boolean;
  /** Human-readable formula, e.g. "MAX(210 GB needed − 187 GB included, 0) × $40/GB". */
  formula: string;
  inputs: Record<string, number | string>;
}

export interface CostLine {
  id: string;
  label: string;
  category: ItemCategory;
  envInstanceId?: string;
  month: number; // 1-based
  amount: number;
  trace: Trace;
}

export interface StorageMonth {
  month: number;
  /** Billing bucket id — one or more pools charged together. */
  groupId: string;
  label: string;
  /** The pools summed into this bucket. */
  pools: StoragePool[];
  neededGB: number;
  includedGB: number;
  overageGB: number;
  overageCost: number;
}

export interface CopilotMonth {
  month: number;
  creditsNeeded: number;
  packsRequired: number;
  entitledPacks: number; // may be fractional (mirrors the source workbook)
  packsOwned: number;
  additionalPacks: number;
  cost: number;
}

/** One month of Commerce e-commerce activity (emitted only when transactions > 0). */
export interface CommerceMonth {
  month: number;
  transactions: number;
  aov: number;
  band: number; // 1-based
  tierId: string;
  tierLabel: string;
  includedTransactions: number;
  overageUnits: number;
  tierCost: number;
  overageCost: number;
  /** Standalone CSU add-ons billed this month (independent of volume). */
  csuCost: number;
  rnrCost: number;
  totalCost: number;
}

export interface ScheduleWarning {
  kind: 'inverted-window' | 'duplicate-phase-kind' | 'empty-environment';
  message: string;
  rolloutId?: string;
  ruleId?: string;
  envTypeId?: string;
  envInstanceId?: string;
}

export interface EstimateResult {
  schedule: ScheduleMatrix;
  lines: CostLine[];
  storage: StorageMonth[];
  copilot: CopilotMonth[];
  commerce: CommerceMonth[];
  goLiveMonths: { rolloutId: string; month: number }[];
  /** Schedule problems that would otherwise fail silently. */
  warnings: ScheduleWarning[];
}
