# Copilot Cowork skill: d365-cost-estimate

A Microsoft 365 Copilot Cowork skill that interviews a seller through the D365 F&SCM
discovery questions and produces a `.estimate.json` file importable into this repo's
estimator (`estimator.html` → **Open JSON**). Skills use the
[Agent Skills open standard](https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development)
— the same `SKILL.md` format as Claude Code, so the skill also works there
(copy `skills/d365-cost-estimate` into any `.claude/skills/`).

## Layout

```
cowork/
├── README.md                       this file
├── build-skill-zip.ps1             builds dist/d365-cost-estimate.zip
└── skills/d365-cost-estimate/
    ├── SKILL.md                    the interview + generation workflow
    ├── estimator.html              copied in by the build script (gitignored)
    └── references/
        ├── estimate-schema.md      the JSON contract + validation checklist
        ├── question-mapping.md     discovery question → JSON field rules
        ├── template.estimate.json  minimal valid file (mirrors newEstimate())
        └── example.estimate.json   worked two-wave example
```

## Build & distribute

```powershell
.\build-skill-zip.ps1
```

Then in Cowork (as the skill owner):
1. **Customize** → **Skills** tab → **Add** → **Upload skill** → pick
   `dist/d365-cost-estimate.zip`.
2. Open the skill's detail page → **Share** → **Specific users in your organization**
   → the sales team.
3. After editing the skill, rebuild, re-upload, and **Re-share** — updates flow to
   everyone you shared with.

No tenant admin needed for this route. To publish it through the M365 admin
center / App Store instead, wrap it as a plugin package with the
[Agents Toolkit CLI](https://learn.microsoft.com/microsoft-365/copilot/cowork/cowork-plugin-development):
`atk import openplugin` (requires privacy/terms URLs and a `manifest.json`).

## Keep it in sync with the app

The skill's reference files duplicate facts from the app source **by design** (Cowork
can't read this repo). When any of these change, update the matching reference and
re-share:

| App source | Mirrors into |
| --- | --- |
| `src/model/schemas.ts` (estimateSchema) | `references/estimate-schema.md`, both `.estimate.json` files |
| `src/model/estimate.ts` (`newEstimate()`) | `references/template.estimate.json` |
| `src/catalog/licenses.json` (license ids) | `references/question-mapping.md`, `references/estimate-schema.md` |
| `src/catalog/commerce.json` (tier/band/CSU ids) | `references/question-mapping.md`, `references/estimate-schema.md` |
| `src/catalog/environments.json` (env type ids) | `references/estimate-schema.md` |
| `src/model/estimate.ts` (`seededItems()`) | `references/estimate-schema.md`, `references/template.estimate.json` |
| `estimator.html` (any rebuild) | re-run `build-skill-zip.ps1` |

Sanity check after schema changes: load both reference JSON files through the real
parser, e.g. open `estimator.html` and use **Open JSON** on each, or run a one-off
`tsx` script that calls `estimateSchema.parse()` on them.
