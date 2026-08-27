# Customizing the estimator

Two ways, depending on whether you rebuild:

## 1. In the app (no rebuild)

Open **Settings**. Each section (Prices, License types & entitlements, Environment plan,
Scheduling rules) shows the effective JSON. Edit → **Validate & apply**. Changes:

- apply immediately to the current estimate,
- persist in your browser (localStorage),
- can be **exported** as `config-overrides.json` and **imported** on another machine —
  this is how a team shares a house methodology without anyone rebuilding.

“Restore defaults” returns to the bundled catalog.

### Common edits

- **Add an environment type**: append to the Environment plan array — give it an `id`,
  `label`, methodology `description`, `componentPriceIds` (must exist in Prices), and
  `defaultStorageGB`. Then either add a scheduling rule for it or add an instance in the
  Environments panel and paint its months manually.
- **Change when DEV environments run**: edit the `dev-during-build` rule's `from`/`to`
  (it ships as Implement start → Implement end, i.e. design & development only)
  anchors. Anchors are either `{ "phaseKind": "implement", "edge": "start", "offsetMonths": 0 }`
  or `{ "event": "goLive" | "projectStart" | "horizonEnd", "offsetMonths": -2 }`.
  `offsetMonths` can also reference an estimate setting instead of a fixed number —
  `{ "setting": "prodLeadMonths", "negate": true }` is how the default `prod-lead` rule
  ties PROD's start to the "PROD lead time" input.
- **Price a Tier-4 performance environment**: set `env.perfTier`'s `value` in Prices —
  it ships as 0 because add-on environment pricing depends on your agreement.
- **ISVs / Fabric / anything monthly**: use custom cost items in the left panel — those
  live in the estimate, not the config, so they travel with the saved estimate JSON.

## 2. In the repo (rebuild)

Edit `src/catalog/*.json` and run `npm run build`. The single-file `estimator.html` then
ships your defaults to everyone who downloads it. Schemas in `src/model/schemas.ts` are
enforced by `npm run validate:catalog` and the test suite.

## Scheduling rule semantics

Every rule is evaluated once per rollout; an environment is active in the union of the
resulting windows, so:

- Per-rollout environments (MIG, TRAIN) naturally re-fire for each rollout.
- Long-lived environments (PROD from first go-live − lead time, Hotfix from first
  go-live, the lead DEV box) stay on because their window extends to the horizon.
- A rule whose phase anchor doesn't exist in a rollout is skipped for that rollout.
- `count: { "input": "concurrentDevs" }` spawns one instance per developer (DEV01…).
- `appliesTo: "firstInstance"` limits a rule's window to the first instance of a
  multi-instance type — how the default `dev-lead-forever` rule keeps only DEV01
  running past go-live for ISV upgrades, installs, and troubleshooting.

Grid overrides are sparse deltas on top of the rules: re-running rules (changing a phase,
adding a rollout) never destroys your manual cell edits, and every overridden cell is
flagged in the UI and the Excel export.
