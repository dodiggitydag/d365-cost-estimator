# The estimate JSON contract

The estimator validates the file with a strict zod schema on import
(`src/model/schemas.ts` in the estimator repo). Validation is **atomic**: any
violation rejects the whole file with an alert and nothing is applied. Unknown keys
are **silently stripped** — you cannot add your own fields for provenance. The only
free-text carriers that survive import are `meta.name`, `customItems[].name`,
`customItems[].notes`, `customItems[].sourceUrl`, and `copilotAgents[].name`.

## Top-level shape — all 15 required keys

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
    "concurrentDevs": 4,           // int >= 0 — drives DEV environment count
    "functionalConsultants": 6,    // int >= 0
    "solutionArchitects": 2        // int >= 0
  },
  "licenseSteps": [ ... ],         // min 1 — see below
  "licenseCostMode": { "kind": "lumpSum", "monthlyTotal": 0 },
                                   // OR { "kind": "listPrices" } — exactly one shape
  "licenseStartMonth": 1,          // int >= 1
  "copilotAgents": [ ... ],        // may be []
  "copilotPacksOwned": 0,          // number >= 0
  "customerInsightsAddon": false,  // boolean, required
  "environments": [ ... ],         // usually [] — see the fromRule trap
  "disabledEnvIds": [],            // array of strings (optional in schema; include as [])
  "customItems": [ ... ],          // may be []
  "gridOverrides": [],             // leave [] — manual schedule-cell paints only
  "standardItems": { ... },        // see the 5 known ids
  "settings": { "prodLeadMonths": 2 }  // int >= 0 — PROD starts N months before first go-live
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

`storageSteps` is optional (defaults to the environment type's standard demand).
Storage pool keys (each optional, number ≥ 0): `fscmData`, `fscmFile`, `dvData`,
`dvFile` (`dvLog` exists but is never billed).

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

## standardItems — the only 5 recognized ids

```json
"standardItems": {
  "azdoBasic":        { "enabled": true },
  "azdoTestPlans":    { "enabled": false },
  "azdoPipelines":    { "enabled": true },
  "azdoArtifacts":    { "enabled": true },
  "azureIntegration": { "enabled": false }
}
```

Defaults shown. Optional `fromMonth`/`toMonth` per item override each item's natural
window (azdoTestPlans naturally runs month 1 → first go-live; the others run the
whole horizon). Enable `azureIntegration` when interfaces are in scope.

## Validation checklist — run before delivering the file

Schema-enforced (import fails):
- [ ] `schemaVersion` is the number `1`
- [ ] All 15 required top-level keys present (empty arrays where nothing applies)
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
- [ ] Phases within a rollout don't unintentionally overlap or leave gaps
- [ ] Every added `environments[]` entry has a unique id ≠ any derived id, and no `fromRule`
- [ ] Every storage-override entry uses the exact derived id and `fromRule: true`
- [ ] Each rollout's Operate phase extends to the horizon
- [ ] `licenseStartMonth` is at or before the first go-live
