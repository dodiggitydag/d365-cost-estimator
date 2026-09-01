# Methodology

## Phases — Success by Design

The default timeline follows Microsoft's Success by Design implementation phases:

| Phase | Default | What happens |
|-------|---------|--------------|
| Initiate | 2 months | Discovery, solution blueprint, demo/CRP environment |
| Implement | 6 months | Build: development, configuration, data migration dry runs |
| Prepare | 2 months | UAT, performance testing, training, cutover rehearsal |
| Operate | to horizon | Live operation, hypercare, support |

**Go-live defaults to the end of Prepare.** Phased deployments add rollouts — each gets
its own Implement/Prepare/Operate and go-live, and per-rollout environments (UAT, MIG,
PERF, TRAIN) re-fire while long-lived ones (PROD, Hotfix, DEV) extend.

## Environments

The environment plan and the prose descriptions shipped in `src/catalog/environments.json`
describe a proven D365 F&SCM delivery approach: dedicated environments for development
(one per concurrent developer, mandated by version control — the lead developer's
environment is kept for the life of the system to support ISV upgrades, installs, and
troubleshooting), SIT for promotion testing, a GOLD seed environment that becomes
Production, a dedicated data-migration environment starting a month before build so
corrupted test runs can't hurt the wider project, a demo environment retained until the
last go-live for out-of-the-box comparisons, and a hotfix environment after go-live.
A production-sized performance environment is available as an add-on instance when a
project needs one (not in the default plan).

Every default is editable — see [customize.md](customize.md).

## Cost model

- **User subscriptions**: negotiated monthly total (recommended — real deals mix license
  types and discounts) or computed from cataloged list prices.
- **Storage**: per month, per **billed pool**. Entitled capacity is the tenant base
  (which depends on whether any Premium/full ERP license exists) plus per-license
  accruals; demand is the sum of active environments' storage; overage =
  MAX(demand − entitlement, 0) × add-on price.

  Microsoft's merged capacity model bills F&SCM and Dataverse out of **one data pool and
  one file pool**, so demand and entitlement are summed across both systems *before* the
  overage is taken — spare Dataverse capacity absorbs an F&SCM shortfall and vice versa.
  Demand is still tracked per pool, so the explanation shows each half. Dataverse log is
  tracked separately and not billed. The grouping lives in `licenses.json`
  (`billingPools`), so if Microsoft splits the pools again it is a catalog edit, not a
  code change.

  Two refinements track how storage actually behaves over a project:
  - **Production growth**: the estimate's `prodGrowthGBPerYear` accrues on
    environment types flagged `prodGrowthApplies` (PROD), prorated monthly from the
    environment's first active month.
  - **Post-go-live sandbox refresh**: environments that are refreshed from Production
    after go-live carry production-sized data from then on. From the month after the
    first go-live, a mirroring environment's demand becomes PROD's demand (base +
    growth) instead of its own figures. UAT mirrors by default
    (`mirrorsProdByDefault` on the environment type); any instance can opt in or out
    with `mirrorProdStorage` — there is a checkbox per environment in the UI.
- **Copilot Studio**: agent credit demand → packs (rounded up) − entitled credits
  (Premium/attach users × 1000) − owned packs, priced per pack.
- **Commerce (e-commerce & APIs)**: monthly volume steps carry e-commerce
  transactions (a transaction = one completed cart, item count irrelevant) and
  average order value. The AOV picks the licensing band; for each e-Commerce tier
  the cost is `tier price + ROUNDUP(MAX(transactions − included, 0) ÷ band's
  overage-unit size) × overage price`, and the cheapest tier wins (a tie keeps the
  lower tier). Each tier includes one cloud Commerce Scale Unit, which also serves
  headless / Commerce API traffic — Microsoft has no per-API-call meter, so "API
  cost" *is* the tier. Standalone Scale Unit add-ons (extra geo, redundancy, device
  capacity) and Ratings & Reviews are flat monthly lines. Two things to know when
  defending the number: Microsoft licenses tiers monthly but enforces transactions
  **annually** (12 × the monthly quantity) — this tool evaluates each month's
  average, so a seasonal spike is smoothed rather than trued-up against the annual
  pool; and additional e-commerce *environments* are bought as additional e-Commerce
  tier units, not Scale Units. Tier/band quantities live in
  `src/catalog/commerce.json`; prices stay in the pricing catalog.
- **Environment components**: AppInsights, dev VM allotments, add-on environment fees —
  billed for active months only.
- **Tenant items**: every non-environment monthly cost is a plain editable row —
  Azure DevOps seats, Microsoft-hosted build agents, artifacts, Azure Integration
  Services, ISVs, Fabric capacity. A new estimate seeds the usual ones from the price
  catalog and the team/agent inputs; the amounts are flat from then on.

Every computed line carries provenance: the scheduling rule (with its rationale), the
formula in words, and the price citation. The point of the tool is not just the number —
it's being able to defend the number.
