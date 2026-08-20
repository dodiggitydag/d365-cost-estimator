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
(one per concurrent developer, mandated by version control), SIT for promotion testing,
a GOLD seed environment that becomes Production, a dedicated data-migration environment
so corrupted test runs can't hurt the wider project, a production-sized performance
environment before go-live, and a hotfix environment after it.

Every default is editable — see [customize.md](customize.md).

## Cost model

- **User subscriptions**: negotiated monthly total (recommended — real deals mix license
  types and discounts) or computed from cataloged list prices.
- **Storage**: per month, per pool — entitled capacity is the tenant base (which depends
  on whether any Premium/full ERP license exists) plus per-license accruals; demand is
  the sum of active environments' storage; overage = MAX(demand − entitlement, 0) ×
  add-on price.
- **Copilot Studio**: agent credit demand → packs (rounded up) − entitled credits
  (Premium/attach users × 1000) − owned packs, priced per pack.
- **Environment components**: AppInsights, dev VM allotments, add-on environment fees —
  billed for active months only.
- **Tenant items**: Azure DevOps seats (driven by team size), pipelines, artifacts,
  integration services — plus fully user-defined custom items (ISVs, Fabric capacity…).

Every computed line carries provenance: the scheduling rule (with its rationale), the
formula in words, and the price citation. The point of the tool is not just the number —
it's being able to defend the number.
