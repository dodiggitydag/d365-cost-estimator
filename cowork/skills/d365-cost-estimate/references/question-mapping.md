# Discovery question → estimate JSON mapping

Every rule below targets the estimate JSON documented in `estimate-schema.md`.
Months are 1-based integers from project start; `toMonth` is inclusive.
"Go-live" for a wave = the last month of that rollout's `prepare` phase (the tool
derives it; only set `goLiveMonthOverride` when the client names a month that disagrees).

## Timeline & team

### Project timeline / phased rollout / milestones
- `horizonMonths`: total months to model, integer 1–60. Default 36; use 60 if the
  client budgets 5 years.
- If the client gives a calendar start (e.g. "kickoff January 2027"), set the optional
  top-level `startYearMonth: "2027-01"` so the tool can label months with real dates.
- One `rollouts[]` entry per wave/rollout. Each has `phases[]` with `kind` from:
  `initiate`, `implement`, `prepare`, `operate`, `custom` (Microsoft Success by Design
  naming). `startMonth` is absolute (not relative to the rollout).
- Single rollout default shape: Initiate 2 mo → Implement 6 mo → Prepare 2 mo →
  Operate through horizon. Scale Implement to the client's stated build duration.
- Additional waves usually skip Initiate: Implement → Prepare → Operate. Start wave
  N's Implement around wave N−1's go-live unless told otherwise.
- Phase `id` convention: `r1-implement`, `r2-prepare`, etc. Ids must be unique; names
  are display text — use the client's milestone names when given ("Phase 1 – US",
  "Wave 2 – EMEA").
- Every rollout's Operate phase should extend to `horizonMonths` so post-go-live
  environments stay active.

### Dev hours in budget + duration → concurrent developers
- `team.concurrentDevs = ceil(devHours ÷ (durationMonths × 130))`
  (130 = productive hours per developer-month).
- Show the math to the user and confirm before finalizing — this drives the number
  of DEV environments (DEV01, DEV02, …) and their cost for the whole build.
- Example: 4,500 h over 7 months → 4,500 ÷ 910 = 4.95 → **5** concurrent devs.

### Microsoft-hosted ADO build agents → `team.hostedAgents`
Default 2 parallel jobs. Also update the `ado-agents` custom item to
`hostedAgents × $40/mo` — the row does not recalculate itself.

### Max Functional Consultants → `team.functionalConsultants`
### Max Solution Architects → `team.solutionArchitects`
Both integers ≥ 0. Together with devs they drive Azure DevOps seat counts.

## Licensing

### SKUs Microsoft is selling → `licenseSteps[].counts`
Valid license ids (use these keys exactly; unknown keys are ignored by the engine):

| id | Meaning |
|----|---------|
| `erpPremium` | ERP Premium (Finance / SCM Premium) |
| `erpFull` | ERP full user (Finance / SCM) |
| `commerce` | Commerce full user (HQ / merchandising) |
| `cePremium` | CE Premium (Sales / Customer Service / Contact Center) |
| `ceEnterprise` | CE Enterprise (Sales / Customer Service) |
| `csProfessional` | Professional (Sales or Customer Service) |
| `attach` | Attach license |
| `activity` | Operations – Activity |
| `teamMember` | Team Members |
| `device` | Operations – Device (also POS registers) |

Include all ten keys in every step, zero where not sold (matches the tool's UI).
Customer Insights sold → `customerInsightsAddon: true` (adds Dataverse entitlement).

### User ramp per wave → multiple `licenseSteps`
Step function: for month *m*, the last step with `fromMonth <= m` wins. Example —
200 users at wave-1 go-live (month 10), 450 at wave-2 go-live (month 18):

```json
"licenseSteps": [
  { "fromMonth": 1,  "counts": { "erpFull": 200, ... } },
  { "fromMonth": 18, "counts": { "erpFull": 450, ... } }
]
```

The steps also decide when billing starts — the first step with any nonzero count.
Subscriptions are usually bought some months before go-live (UAT needs real
licenses), so default the first counted step to the start of the first `prepare`
phase unless the client says otherwise, with an all-zero step at month 1 ahead of
it; note the assumption. There is no `licenseStartMonth` field.

### Negotiated vs list pricing → `licenseCostMode`
- Negotiated monthly total known: `{ "kind": "lumpSum", "monthlyTotal": <USD/month> }`
- Otherwise: `{ "kind": "listPrices" }` (tool computes from its price catalog)

## Scope items

### Commerce in scope? → `commerceSteps` (+ `commerceScaleUnits`, `commerceRatingsReviews`)
Native fields — do **not** add the old `commerce-csu` $0 custom item any more. Ask for
expected e-commerce order volume and average order value; the tool derives the
e-Commerce tier, AOV band, and overage units itself (cheapest combination, re-evaluated
monthly), and each tier already includes one cloud Commerce Scale Unit that also covers
headless / Commerce API traffic.

```json
"commerceSteps": [
  { "fromMonth": <go-live>, "transactionsPerMonth": 3000, "averageOrderValue": 60 }
],
"commerceScaleUnits": [],
"commerceRatingsReviews": false
```

- `transactionsPerMonth` = completed e-commerce carts per month (item count is
  irrelevant). Given an annual figure, divide by 12 and say so.
- `averageOrderValue` = annual e-commerce GMV ÷ transactions, in USD. Drives the band —
  if it's unknown, ask; a wrong band changes the included transaction quantity.
- Volume ramps like licenses: add more steps (`fromMonth` of each wave's go-live).
- Volume completely unknown → leave `commerceSteps: []` (bills nothing) and list
  Commerce as an unpriced follow-up in the summary.
- Commerce HQ/merchandising users → `licenseSteps[].counts.commerce`; POS registers →
  `counts.device`.
- Extra Scale Units only when the client names them (extra geo, redundancy, device
  capacity beyond the included CSU):
  `{ "id": "csu-emea", "tier": "basic" | "standard" | "premium", "count": 1, "fromMonth": <go-live>, "toMonth": <horizon> }`
- Ratings & Reviews in scope → `commerceRatingsReviews: true` (billed only in months
  with e-commerce volume).
- E-commerce ISVs that come with Commerce still get their own `isv` rows.

### Interfaces in scope → the `azure-integration` custom item + optional extra rows
- Any interfaces at all → set the `azure-integration` row's `monthlyAmount`
  (~$50/mo covers light Logic Apps / Functions workloads; size it up for real volume).
- If the user can estimate monthly Azure integration spend (Logic Apps, Service Bus,
  Functions, VMs), put that amount on the `azure-integration` row, or add another
  `payg-ms` row alongside it for a separately-quoted piece.

### ISVs in scope → one `customItems` row each, category `isv`
```json
{ "id": "isv-avalara", "name": "Avalara AvaTax", "category": "isv",
  "monthlyAmount": 1200, "fromMonth": <go-live>, "toMonth": <horizon>,
  "sourceUrl": "https://...", "notes": "quote 2026-08" }
```
- `fromMonth`: go-live unless the ISV is needed during build (e.g. EDI testing) —
  then first implement month.
- Unknown price → `monthlyAmount: 0` + `notes: "pricing TBD"`.
- Annual price ÷ 12; one-time fees: spread over the remaining horizon and say so in notes.

### IP in scope → `customItems` row(s), category `custom`
Same shape as ISVs (e.g. a partner IP subscription). Unknown price → $0 + TBD.

### Copilot Studio agents in scope → `copilotAgents[]`
```json
{ "id": "agent-returns", "name": "Returns triage agent",
  "creditsPerMonth": 10000, "fromMonth": <go-live>, "toMonth": <horizon> }
```
- One entry per agent. Default `creditsPerMonth: 10000` when usage is unknown (state
  the assumption).
- Client already owns credit packs → `copilotPacksOwned: <n>` (25,000 credits/pack).

### M365 Copilot / Cowork with D365 → `copilotAgents[]` entry
If yes, model the credit consumption as one agent entry:
```json
{ "id": "m365-copilot-cowork", "name": "M365 Copilot Cowork usage (<N> users)",
  "creditsPerMonth": <10000 × N users>, "fromMonth": <go-live>, "toMonth": <horizon> }
```
**Assume 10,000 credits per user per month.** Always state this assumption in the
summary. If the user count is unknown, ask; don't guess. The template already carries
a `m365-copilot-cowork` row at 0 credits — size that row rather than adding a second
one, and leave it at 0 (it then costs nothing) if Cowork is out of scope.

### Fabric budgeted? (always ask) → `customItems` row, category `payg-ms`
```json
{ "id": "fabric-capacity", "name": "Microsoft Fabric capacity (F-SKU)",
  "category": "payg-ms", "monthlyAmount": <USD/month or 0>,
  "fromMonth": 1, "toMonth": <horizon>,
  "sourceUrl": "https://azure.microsoft.com/pricing/details/microsoft-fabric/",
  "notes": "<F64 reserved / capacity TBD>" }
```
The template already contains a $0 Fabric placeholder row (`example-fabric`) —
replace it: repurpose it if Fabric is budgeted, delete it if the answer is a firm no.

### Multiple production environments? → extra `environments[]` entries
If yes, add **both** an extra PROD **and** an extra TRAIN:
```json
{ "id": "PROD-x2",  "typeId": "PROD",  "name": "Production 2" },
{ "id": "TRAIN-x2", "typeId": "TRAIN", "name": "Training 2" }
```
- **Omit `fromRule`** on added instances.
- **Never** emit id `PROD` (or any rule-derived id) without `fromRule: true` — see
  the fromRule trap in `estimate-schema.md`.
- One extra pair per additional production environment (a third prod → `PROD-x3`, `TRAIN-x3`).

### "What other facts might pertain to making the IT budget?" (always ask, open-ended)
- Anything with a recurring cost → `customItems` row with the best-fit category:
  `licensing-ms` (Microsoft per-user/per-tenant licensing), `payg-ms` (Azure
  consumption), `isv` (third-party software), `custom` (everything else).
  $0 + TBD note when unpriced.
- Pure context (compliance regimes, data residency, M&A plans, budget cycles) →
  no JSON change; capture in the assumptions & unknowns summary.

## What does NOT map

Do not model these in the JSON — mention them in the summary if raised:
- HQ location / Azure region (no cost effect in this tool; don't ask)
- Implementation services effort/fees (different estimate entirely)
- Discounts or credits (`monthlyAmount` cannot be negative — fold discounts into the
  net amount instead)
