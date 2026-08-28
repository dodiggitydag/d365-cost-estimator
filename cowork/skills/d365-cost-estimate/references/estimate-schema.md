# The estimate JSON contract

The estimator validates the file with a strict zod schema on import
(`src/model/schemas.ts` in the estimator repo). Validation is **atomic**: any
violation rejects the whole file with an alert and nothing is applied. Unknown keys
are **silently stripped** — you cannot add your own fields for provenance. The only
free-text carriers that survive import are `meta.name`, `customItems[].name`,
`customItems[].notes`, `customItems[].sourceUrl`, and `copilotAgents[].name`.

## Top-level shape — all 13 required keys

```jsonc
{
  "schemaVersion": 1,              // literal NUMBER 1 — "1", 0, or 2 all fail
  "meta": {
    "name": "Contoso",             // string, required (drives the save filename)
    "createdAt": "2026-08-22T00:00:00.000Z",  // string, required (ISO convention)
    "catalogVersion": "2026-08"    // string, required; informational only
  },
  "horizonMonths": 36,             // int 1..60
  "startYearMonth": "2027-01",     // OPTIONAL, "YYYY-MM" — anchors month 1 to a calendar date
  "rollouts": [ ... ],             // min 1 — see below
  "team": {
    "concurrentDevs": 4,           // int >= 0 — drives DEV environment count (no cap)
    "functionalConsultants": 3,    // int >= 0
    "solutionArchitects": 1,       // int >= 0
    "hostedAgents": 2              // int >= 0 — Microsoft-hosted ADO parallel jobs
  },
  "licenseSteps": [ ... ],         // min 1 — see below
  "licenseCostMode": { "kind": "lumpSum", "monthlyTotal": 0 },
                                   // OR { "kind": "listPrices" } — exactly one shape
                                   // NOTE: no "licenseStartMonth" — subscription billing
                                   // starts at the first licenseSteps entry with users
  "copilotAgents": [ ... ],        // may be []
  "copilotPacksOwned": 0,          // number >= 0
  "customerInsightsAddon": false,  // boolean, required
  "environments": [ ... ],         // usually [] — see the fromRule trap
  "disabledEnvIds": [],            // array of strings (optional in schema; include as [])
  "customItems": [ ... ],          // may be []
  "gridOverrides": [],             // leave [] — manual schedule-cell paints only
                                   // NOTE: no "standardItems" — the built-in tenant
                                   // items are now ordinary customItems rows
  "settings": {
    "prodLeadMonths": 2,           // int >= 0 — PROD starts N months before first go-live
    "prodGrowthGBPerYear": {       // OPTIONAL (defaults to {}) — Production data growth
      "fscmData": 0, "fscmFile": 0, "dvData": 0, "dvFile": 0
    }
  }
}
```

## Rollouts and phases

```json
{
  "id": "rollout-1", "name": "Wave 1 - US",
  "phases": [
    { "id": "r1-initiate",  "kind": "initiate",  "name": "Initiate",  "startMonth": 1,  "lengthMonths": 2 },
    { "id": "r1-implement", "kind": "implement", "name": "Implement", "startMonth": 3,  "lengthMonths": 6 },
    { "id": "r1-prepare",   "kind": "prepare",   "name": "Prepare",   "startMonth": 9,  "lengthMonths": 2 },
    { "id": "r1-operate",   "kind": "operate",   "name": "Operate",   "startMonth": 11, "lengthMonths": 26 }
  ]
}
```

- `kind` enum: `initiate` | `implement` | `prepare` | `operate` | `custom`
- `startMonth` is **absolute** (1-based from project start), `lengthMonths` int ≥ 1
- Go-live = last month of the `prepare` phase (else last phase). Optional
  `goLiveMonthOverride` (int ≥ 1) only when the client's stated go-live disagrees.

## licenseSteps

```json
{ "fromMonth": 1, "counts": { "erpPremium": 0, "erpFull": 100, "cePremium": 0,
  "ceEnterprise": 0, "csProfessional": 0, "attach": 0, "activity": 0,
  "teamMember": 0, "device": 0 } }
```

- Step function: for month *m*, the **last** step with `fromMonth <= m` applies.
- Counts: number ≥ 0 per license id. Only the nine ids above are priced; anything
  else is ignored. Include all nine, zero-filled.
- **The steps also set when subscription billing starts** — the first step with any
  nonzero count. To model licenses bought later (e.g. at UAT), add an all-zero step
  at month 1 and the real counts at the buying month. There is no separate
  `licenseStartMonth`; a value left in an older file is ignored.

## copilotAgents

```json
{ "id": "agent-1", "name": "Returns triage agent", "creditsPerMonth": 10000,
  "fromMonth": 11, "toMonth": 36 }
```
All fields required. `toMonth` inclusive. Credits are pooled monthly and covered by
25,000-credit packs after `copilotPacksOwned` is applied.

## environments — and the fromRule trap

The tool **derives** the standard environment set (PROD, UAT, SIT, GOLD, MIG, DEMO,
SUP, TRAIN, DEV01..DEVnn — the lead DEV runs to the horizon) from the timeline and
team size. PERF is not in the default plan (add it manually if a dedicated
performance-test environment is required). `environments` is
for exceptions only. Two distinct cases:

1. **Override storage on a derived environment** — use the **exact derived id** and
   set `"fromRule": true`:
   ```json
   { "id": "PROD", "typeId": "PROD", "name": "Production", "fromRule": true,
     "storageSteps": [ { "fromMonth": 1,
       "gb": { "fscmData": 400, "fscmFile": 100, "dvData": 10, "dvFile": 20 } } ] }
   ```
2. **Add an extra environment** — use a **new id** and **omit `fromRule`**:
   ```json
   { "id": "PROD-x2", "typeId": "PROD", "name": "Production 2" }
   ```

Getting this backwards duplicates an environment or makes it un-removable in the UI.
Derived ids: `PROD`, `UAT`, `SIT`, `GOLD`, `MIG`, `DEMO`, `SUP`, `TRAIN`,
and zero-padded `DEV01`, `DEV02`, … Valid `typeId` values: `PROD`, `UAT`, `SIT`,
`GOLD`, `MIG`, `PERF`, `DEMO`, `SUP`, `TRAIN`, `DEV`, `BUILD` (`PERF` is a valid
type to add manually but is not rule-derived).

`storageSteps` is optional (defaults to the environment type's standard demand:
PROD 150/16/3/3, UAT · GOLD · MIG 61/1/5/10, DEV 80/3/5/15, DEMO 9/1/6/5 GB for
fscmData/fscmFile/dvData/dvFile). Storage pool keys (each optional, number ≥ 0):
`fscmData`, `fscmFile`, `dvData`, `dvFile` (`dvLog` exists but is never billed).

Storage is **billed in two merged pools**, matching Microsoft's merged capacity model:
`fscmData + dvData` are charged as one data pool and `fscmFile + dvFile` as one file
pool. Demand and entitlement are summed across both systems before the overage is taken,
so spare Dataverse capacity absorbs an F&SCM shortfall. Size each environment's four
figures honestly rather than padding one to cover the other.

`settings.prodGrowthGBPerYear` adds annual data growth on top of the Production
starting demand, prorated monthly from the month PROD starts (120 GB/yr = +10 GB
after one month). It applies to Production environments only. Leave the pools at 0
unless the client gave a growth figure — state the assumption either way.

**Post-go-live sandbox refresh**: from the month after the first go-live, UAT's
storage demand mirrors Production's (base + growth) instead of its own figures,
because UAT is refreshed from PROD after go-live. This is on by default for UAT
(`mirrorsProdByDefault` on the environment type). Any environment instance can opt
in or out with an optional `"mirrorProdStorage": true|false` field on its
`environments` entry — omit it to take the type default. Do NOT hand-model
post-go-live UAT growth with `storageSteps`; the mirror does it.

## customItems

```json
{ "id": "isv-avalara", "name": "Avalara AvaTax", "category": "isv",
  "monthlyAmount": 1200, "fromMonth": 11, "toMonth": 36,
  "sourceUrl": "https://...", "notes": "quote 2026-08" }
```

- `category` enum: `licensing-ms` | `payg-ms` | `isv` | `custom`
- `monthlyAmount` ≥ 0 — **negatives are rejected**; no discount/credit rows
- `sourceUrl` and `notes` optional
- `id` must be unique within the array; use kebab-case slugs

## Tenant tooling rows (formerly `standardItems`)

There is no `standardItems` field any more — Azure DevOps and Azure Integration are
plain `customItems` rows. The template already carries all six; edit their
`monthlyAmount` rather than adding duplicates:

| id | seeded amount | window | derivation |
| --- | --- | --- | --- |
| `ado-basic` | $24 | 1 → horizon | consulting seats × $6/user/mo |
| `ado-agents` | $80 | 1 → horizon | `team.hostedAgents` × $40/mo |
| `ado-artifacts` | $10 | 1 → horizon | flat |
| `ado-test-plans` | $0 (off) | 1 → first go-live | seats × $52/user/mo if used |
| `azure-integration` | $0 (off) | 1 → horizon | ~$50/mo light workloads |
| `example-fabric` | $0 | 1 → horizon | F-SKU sizing |

These amounts are **flat** — nothing recalculates them. If the interview gives a
different team size or agent count, set `team` AND update `ado-basic` /
`ado-agents` by hand, and state the arithmetic in the summary. Interfaces in scope →
price `azure-integration`. Test Plans in scope → price `ado-test-plans`.

Older estimate files that still carry a `standardItems` map import fine: the tool
converts the enabled entries into these same rows on open.

## Validation checklist — run before delivering the file

Schema-enforced (import fails):
- [ ] `schemaVersion` is the number `1`
- [ ] All 13 required top-level keys present (empty arrays where nothing applies)
- [ ] `rollouts` and `licenseSteps` each have ≥ 1 entry
- [ ] All month fields are integers ≥ 1; `horizonMonths` 1–60
- [ ] `team` values are non-negative integers
- [ ] No negative `monthlyAmount`, `monthlyTotal`, `creditsPerMonth`, or count
- [ ] `licenseCostMode` is exactly one of its two shapes (`lumpSum` includes `monthlyTotal`; `listPrices` has no other props)
- [ ] Every enum value is from its allowed list (phase `kind`, item `category`, env `typeId`)
- [ ] `startYearMonth`, if present, matches `YYYY-MM`

Schema-silent (import succeeds but numbers are wrong):
- [ ] `fromMonth <= toMonth` on every custom item and agent (inverted ranges emit nothing, silently)
- [ ] No `fromMonth`/`toMonth`/`startMonth` beyond `horizonMonths`
- [ ] Phases within a rollout are in chronological order and there is at most one phase
      of each `kind` — the estimator now shows a warning banner for both mistakes, so
      open the file and check the Timeline panel and Schedule grid are warning-free
- [ ] Phases within a rollout don't unintentionally overlap or leave gaps
- [ ] Every added `environments[]` entry has a unique id ≠ any derived id, and no `fromRule`
- [ ] Every storage-override entry uses the exact derived id and `fromRule: true`
- [ ] Each rollout's Operate phase extends to the horizon
- [ ] The first `licenseSteps` entry with users is at or before the first go-live —
      that month is when subscription billing starts
