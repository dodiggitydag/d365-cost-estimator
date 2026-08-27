# CLAUDE.md

D365 F&SCM cloud cost estimator. Single-file deliverable: `estimator.html` (committed
build artifact — rebuild with `npm run build` after any src change and re-commit it).
Pure data catalogs in `src/catalog/`; pure engine in `src/engine/`; React UI in `src/ui/`.

## HARD REQUIREMENT: estimate JSON backward compatibility

**Every `.estimate.json` a user has ever exported must open in every future version of
the tool.** Saved estimates are the durable format (users keep them for years; the
Cowork skill in `cowork/` generates them; browser autosave is silently discarded if it
fails the schema — a breaking change destroys users' work without an error).

Any change to `estimateSchema` (`src/model/schemas.ts`) must be one of:

1. **Additive** — new fields are `.optional()` or `.default(...)` so files written
   before the field existed still parse (precedent: `disabledEnvIds`, schemas.ts:182).
2. **Versioned with migration** — bump `schemaVersion` AND extend
   `parseEstimateJson`/`loadSavedEstimate` (`src/model/persistence.ts`) with a
   migration chain so every historical version still parses and upgrades. Never make
   `schemaVersion` reject an older number.

Never: rename/remove a field, tighten a type, or narrow an enum in a way that rejects
previously valid files.

**Enforcement:** `tests/compat.test.ts` parses frozen era fixtures from
`tests/compat/fixtures/` through the real import path. Fixtures are **append-only** —
never edit or delete one to make the suite pass; if a fixture fails, the schema change
is wrong. When the shape gains a field, freeze an additional feature-complete fixture
for the new era.

## Other invariants

- Prices live only in `src/catalog/pricing.v<YYYY-MM>.json` with per-entry
  `sourceUrl`/`guideSection`/`asOf`. Refresh procedure: `docs/update-prices.md`
  (needs the D365, Power Platform, AND Copilot Studio licensing guide PDFs).
- Golden parity fixtures (`tests/golden/fixtures/local/`) come from a private client
  workbook — gitignored, never commit; the suite skips when absent.
- `cowork/` is the M365 Copilot Cowork skill that generates estimate JSONs from
  discovery answers. Its `references/` mirror `schemas.ts` and the catalogs — update
  them (and rebuild `cowork/dist/` via `cowork/build-skill-zip.ps1`) whenever the
  schema or catalog changes. See `cowork/README.md` for the sync table.
- Public repo: before publishing, scan for employer or client names, internal
  paths, and partner pricing (cost/margin/discount columns). Match case-sensitively
  and check whole words — a short acronym otherwise hits inside ordinary
  identifiers and buries the real result.

## Commands

- `npm test` — full suite (catalog validation, engine, compat gate, golden if present)
- `npm run build` — Vite single-file build; postbuild copies `dist/index.html` to `./estimator.html`
