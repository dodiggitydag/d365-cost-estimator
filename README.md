# D365 F&SCM Cost Estimator

> **Budgetary estimate only.** This tool uses USD list prices, cited to the Microsoft
> Licensing Guides as of a stated date. Actual pricing varies by agreement (EA/CSP,
> discounts, region). It is not a quote, and this project is not affiliated with Microsoft.

Estimate the Microsoft cloud and licensing run-rate of a Dynamics 365 Finance & Supply
Chain implementation project — environments, storage entitlements and overage, Copilot
Studio credits, Azure DevOps, and your own custom cost items — over up to 60 months,
**with an explanation for every dollar**: the methodology rule that scheduled it, the
formula in words, and a citation to the licensing-guide price it came from.

## Use it

**Download [`estimator.html`](./estimator.html) and open it in a browser (Ctrl+O).**
That's the whole install: one self-contained file, no server, no build, no telemetry.
Your work autosaves in the browser and can be saved/opened as a JSON file.
Saved estimate files are forward-compatible by policy: every `.estimate.json` ever
exported will open in every future version (enforced by `tests/compat.test.ts`).

## What it does

1. **Timeline** — phases follow Microsoft's Success by Design (Initiate → Implement →
   Prepare → Operate). Supports **multiple rollouts**, each with its own go-live.
2. **Rules + grid** — methodology rules derive when each environment (PROD, UAT, SIT,
   GOLD, MIG, DEMO, Hotfix, Training, one DEV per developer for design & development —
   the lead DEV box stands up in month 2 and runs for the life of the system) runs.
   Override any cell in the environment × month grid;
   overrides are visually flagged and reversible.
3. **Storage math** — tenant base + per-license entitlement accrual vs. the demand of
   active environments, overage billed monthly at add-on prices. F&SCM and Dataverse
   share one data pool and one file pool (Microsoft's merged capacity model), so demand
   and entitlement are summed across both before the overage is taken; each half still
   shows in the explanation.
4. **Copilot Studio** — agents consume credits; packs required are netted against
   entitled credits and owned packs.
5. **Explanations** — click any figure for the cost lines behind it, each with its
   formula, scheduling rationale, and price citation (source URL + guide section + as-of
   date).
6. **Exports** — a multi-sheet .xlsx (Inputs, Schedule, Worksheet, Report, By
   Environment, Assumptions with citations) and estimate JSON.

## Customize without rebuilding

Everything opinionated is data, editable in **Settings** inside the app:

- **Prices** — every number carries `sourceUrl`, `guideSection`, and `asOf`.
- **License types & entitlements** — per-user storage accrual, tenant bases, Copilot credits.
- **Environment plan** — types, methodology descriptions, cost components, default storage demand.
- **Scheduling rules** — when environments turn on/off relative to phases and go-live.

Settings changes validate against a schema, apply live, persist in your browser, and can
be exported/imported as `config-overrides.json` to share with a team. If you prefer to
change the shipped defaults, edit `src/catalog/*.json` and rebuild.

See [docs/customize.md](docs/customize.md) and [docs/methodology.md](docs/methodology.md).

## Updating prices when Microsoft publishes a new licensing guide

Follow [docs/update-prices.md](docs/update-prices.md) — it is written as a repeatable
procedure you can hand to an AI assistant along with the new guide: extract the values
named by each entry's `guideSection`, produce an old→new diff for review, bump the
catalog version and `asOf` dates, run `npm run validate:catalog` and the tests, rebuild.

## Develop

```
npm install
npm run dev        # local dev server
npm test           # unit + parity tests
npm run build      # typecheck + single-file build → estimator.html
```

Stack: Vite, React 18, TypeScript (strict), Zustand, zod, Recharts, exceljs,
vite-plugin-singlefile. The calculation engine (`src/engine/`) is pure TypeScript with no
UI dependencies — every cost line it emits carries a `Trace` (price refs, rule ids,
formula in words), which is what the explanation UI renders. Tests in `tests/` include
schema validation of all catalog data and parity tests for the storage-entitlement and
Copilot-pack math.

## License

MIT — see [LICENSE](LICENSE).
