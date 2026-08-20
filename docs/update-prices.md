# Updating prices from a new Microsoft licensing guide

Microsoft revises the Dynamics 365 and Power Platform licensing guides regularly
(https://www.microsoft.com/licensing/docs/view/Licensing-Guides). This procedure keeps
the pricing catalog current. It is deliberately written so you can hand it, plus the new
guide PDF, to an AI assistant (Claude, Copilot, etc.) and review the diff it produces.

## Procedure

1. **Get the latest guides**: Dynamics 365 Licensing Guide and Power Platform Licensing
   Guide (PDF), plus the Azure DevOps pricing page for the AzDO entries.

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
   less often than prices but matter more when they do.

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
