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
- **Copilot Studio**: agent credit demand → packs (rounded up) − entitled credits
  (Premium/attach users × 1000) − owned packs, priced per pack.
- **Environment components**: AppInsights, dev VM allotments, add-on environment fees —
  billed for active months only.
- **Tenant items**: every non-environment monthly cost is a plain editable row —
  Azure DevOps seats, Microsoft-hosted build agents, artifacts, Azure Integration
  Services, ISVs, Fabric capacity. A new estimate seeds the usual ones from the price
  catalog and the team/agent inputs; the amounts are flat from then on.

Every computed line carries provenance: the scheduling rule (with its rationale), the
formula in words, and the price citation. The point of the tool is not just the number —
it's being able to defend the number.
