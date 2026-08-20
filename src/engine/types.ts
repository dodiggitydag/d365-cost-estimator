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
  | 'device/mo';

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
  copilot: {
    creditsPerPack: number;
    packPriceId: string;
  };
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

export type Anchor =
  | { phaseKind: PhaseKind; edge: 'start' | 'end'; offsetMonths?: number }
  | { event: 'goLive' | 'projectStart' | 'horizonEnd'; offsetMonths?: number };

export interface ScheduleRule {
  id: string;
  envTypeId: string;
  /** global: one window per estimate (union over rollouts for phase anchors);
   *  perRollout: the rule fires once per rollout. */
  scope: 'global' | 'perRollout';
  from: Anchor;
  to: Anchor;
  /** Number of instances (DEV): fixed or driven by an input. */
  count?: number | { input: 'concurrentDevs' };
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
  rollouts: Rollout[];
  team: {
    concurrentDevs: number;
    functionalConsultants: number;
    solutionArchitects: number;
    devHoursBudget?: number;
  };
  licenseSteps: LicenseStep[];
  licenseCostMode: LicenseCostMode;
  /** Month user subscriptions start being paid (default: project start). */
  licenseStartMonth: number;
  copilotAgents: CopilotAgent[];
  copilotPacksOwned: number;
  customerInsightsAddon: boolean;
  environments: EnvInstance[];
  customItems: CustomCostItem[];
  gridOverrides: GridOverride[];
  /** Built-in tenant-level items (AzDO, integrations...) the user can toggle. */
  standardItems: Record<string, StandardItemSettings>;
  settings: {
    prodLeadMonths: number; // PROD starts N months before first go-live
  };
  /** Rule set replacing the defaults, if the user edited rules. */
  ruleOverrides?: ScheduleRule[];
}

// ---------------------------------------------------------------------------
// Effective config (defaults ⊕ user overrides)
// ---------------------------------------------------------------------------

export interface EstimatorConfig {
  pricing: PricingCatalog;
  licenses: LicenseCatalog;
  environments: EnvironmentType[];
  rules: ScheduleRule[];
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
  pool: StoragePool;
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

export interface EstimateResult {
  schedule: ScheduleMatrix;
  lines: CostLine[];
  storage: StorageMonth[];
  copilot: CopilotMonth[];
  goLiveMonths: { rolloutId: string; month: number }[];
}
