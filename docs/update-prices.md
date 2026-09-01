# Updating prices from a new Microsoft licensing guide

Microsoft revises the Dynamics 365, Power Platform, and Copilot Studio licensing guides
regularly (https://www.microsoft.com/licensing/docs/view/Licensing-Guides). This procedure
keeps the pricing catalog current. It is deliberately written so you can hand it, plus the
new guide PDFs, to an AI assistant (Claude, Copilot, etc.) and review the diff it produces.

## Procedure

1. **Get the latest guides** (all three PDFs):
   - **Dynamics 365 Licensing Guide** — per-user license prices and entitlement tables
   - **Power Platform Licensing Guide** — Power Platform entitlements
   - **Microsoft Copilot Studio Licensing Guide** — the Copilot Studio capacity pack
     (credits per pack, pack price, pay-as-you-go rate) **and the Dataverse capacity
     add-on prices**, which moved here from the Power Platform guide (as of the
     August 2026 edition)

   Plus the Azure DevOps pricing page for the AzDO entries.

   Note: some prices are **no longer printed in any guide** (observed August 2026:
   attach, Team Members, Operations Activity/Device, and the Operations database/file
   storage add-ons). For those, check the product pricing pages
   (microsoft.com/en-us/dynamics-365/products/*/pricing), then fall back to the CSP price
   sheet as described below. Watch out for subscription add-on vs pay-as-you-go meter
   prices for the same capacity (e.g. Dataverse File is $2/GB as an add-on but $2.40/GB on
   the meter) — this catalog uses the subscription add-on prices.

### Fallback: the NCE (CSP) price sheet

Microsoft reissues a commercial NCE price list to partners monthly. It carries every SKU
whose price the guides have stopped printing, so it is the authority of last resort. Use
the **`ERP Price`** column (Estimated Retail Price) — never `UnitPrice`, which is partner
cost, and never any margin or discount column: those are not list prices and must not
enter this catalog.

Term normalization matters, because the sheet has three rows per SKU and this catalog
stores the **annual-term list price per month**:

| Sheet row | What it is | Convert with |
|---|---|---|
| `TermDuration P1M` | monthly commitment, carries a **20% uplift** | `ERP Price / 1.2` |
| `TermDuration P1Y`, `BillingPlan Annual` | annual term paid up front — the true list | `ERP Price / 12` |
| `TermDuration P1Y`, `BillingPlan Monthly` | annual term paid monthly, **5% uplift** | `ERP Price / 12 / 1.05` |

Derive from the P1M row and confirm against the P1Y/Annual row; they should agree. Worked
example (August 2026): Dynamics 365 Finance is $252.00 at P1M and $2,520.00 at P1Y/Annual
— $252 / 1.2 = $210 and $2,520 / 12 = $210, so the catalog value is $210. The same check
across the catalog in August 2026 confirmed fourteen entries and corrected one
(Operations – Device was $75; the sheet shows $102 P1M and $1,020 P1Y, i.e. $85).

Two gotchas: SKU titles use an en dash in "Operations – Activity"/"– Device", so match on
a wildcard rather than a literal hyphen; and several products share one catalog entry
(Sales Premium $150 vs Customer Service Premium $195, F&SCM attach $30 vs CE attach $20)
— record which one the value represents in `notes`.

Azure and Azure DevOps items (`env.appInsights`, `env.devVm`, `ado.*`,
`azure.integration`) are **not** in this sheet — they stay sourced from the Azure pricing
pages, and the tier/add-on environment fees stay $0 until entered from an agreement.

### Commerce entries

The `commerce.*` and `license.commerce` entries come from the Dynamics 365 Licensing
Guide's "Additional Dynamics 365 Commerce applications, add-ons and capacities" section,
cross-checked against the NCE sheet (SKU titles: "Dynamics 365 e-Commerce Tier N Band M"
— all six bands of a tier share one price, so the catalog keeps one entry per tier;
"Dynamics 365 Commerce Scale Unit Basic/Standard/Premium - Cloud"; "Dynamics 365
Commerce Ratings and Reviews"). Two Commerce-specific gotchas:

- **Ratings and Reviews has no annual-term row** on the NCE sheet (observed Aug 2026:
  P1M only, $900). The catalog's $750 is derived via the standard /1.2 convention and
  the entry's `notes` say so — replace with the published figure if one appears.
- **The tier/band transaction quantities are not prices** — they live in
  `src/catalog/commerce.json` (`includedTransactionsPerMonth`, `overageUnitTransactions`
  per band, CSU device counts). When a new guide changes the "Number of monthly
  transactions per SKU" table, update that file too, not just the pricing catalog.

2. **Locate each catalog entry in the guide.** Open
   `src/catalog/pricing.v<current>.json`. Every entry has a `guideSection` naming the
   table or heading it came from. For each entry, find the current value in the new
   guide.

3. **Produce a diff for review** before changing anything:

   | id | label | old | new | guide section | notes |
   |----|-------|-----|-----|---------------|-------|

   Also list anything in the guide's storage/Copilot sections that has **no catalog
   match** (new SKUs, changed entitlement mechanics) — those may need `licenses.json`
   changes, not just price edits.

4. **Check the entitlement tables too** (`src/catalog/licenses.json`): tenant base GB per
   pool, per-license accrual GB, Copilot credits per user, credits per pack. These change
   less often than prices but matter more when they do. Same for
   `src/catalog/commerce.json`: the e-Commerce tier/band transaction matrices and Scale
   Unit device entitlements.

5. **Write the new catalog**: copy `pricing.v<old>.json` to `pricing.vYYYY-MM.json`
   (year-month of the new guide), update `version`, `asOf` (top level and per changed
   entry), values, and `sourceUrl`s. Update the import in `src/model/config.ts` to the
   new file. Keep the old file in git history (delete the old file in the same commit —
   the version lives on in history and in saved estimates' `catalogVersion`).

6. **Validate and test**:

   ```
   npm run validate:catalog
   npm test
   npm run build
   ```

7. **Record it**: note the change in the commit message (e.g. "pricing 2026-04: F&SCM
   data add-on 40→38, Copilot pack 200→180"). Saved estimates remember the
   `catalogVersion` they were built with; reopening one under a newer catalog recomputes
   with current prices — tell stakeholders when a saved estimate's total moves because of
   a price refresh, not a scope change.

## Ground rules for AI-assisted updates

- Values come **only** from the official guide/pricing pages — never from memory.
- Every changed entry must keep a resolvable `sourceUrl` and an accurate `guideSection`.
- If a guide section moved or was renamed, update `guideSection` so the next update can
  find it.
- When unsure whether a guide row matches a catalog entry, flag it in the diff rather
  than guessing.
