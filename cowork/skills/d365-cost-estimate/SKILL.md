---
name: d365-cost-estimate
description: |
  Interviews a seller through D365 F&SCM discovery questions and produces a
  .estimate.json file that imports directly into MCA's D365 cloud cost estimator
  (estimator.html, "Open JSON" button). Estimates the Microsoft cloud run-rate:
  environments, storage, user subscriptions, Copilot Studio credits, Azure DevOps,
  ISVs, and other monthly items. Use when user asks to "create a D365 estimate",
  "fill out the cost estimator", "build the estimate JSON", "estimate cloud costs
  for a D365 deal", "F&SCM cost estimate", or shares discovery notes for a
  Dynamics 365 Finance / Supply Chain opportunity.
license: MIT
metadata:
  author: Dag Calafell, MCA Connect
  version: "1.0"
---

# D365 F&SCM Cloud Cost Estimate Intake

## What This Skill Does

Turns discovery answers for a Dynamics 365 Finance & Supply Chain opportunity into a
ready-to-import estimate file for MCA's D365 cost estimator. The estimator models the
**Microsoft cloud run-rate** — environments over the project timeline, storage
entitlement vs. overage, user subscriptions, Copilot Studio credits, Azure DevOps,
and custom monthly items (ISVs, Fabric, IP). It does **not** estimate implementation
services effort.

The output is `<Client>.estimate.json`. The seller opens `estimator.html` in a browser
and clicks **Open JSON** to load it. A copy of `estimator.html` is bundled with this
skill — offer it to the user if they don't already have the tool.

## Workflow

### Step 1 — Gather the discovery answers

If the user provides discovery notes, a call transcript, or documents, extract answers
from those first and only ask about gaps. Otherwise ask the questions below. Group them
into at most three conversational messages — never one question at a time.

**Timeline & team**
1. Project timeline — is it a phased rollout? Describe the phases/waves and milestones (target go-live dates if known).
2. How many hours of development are in the budget, and over how long? (Used to derive concurrent developers and DEV environments.)
3. Maximum number of Functional Consultants on the project?
4. Maximum number of Solution Architects?

**Licensing**
5. Which SKUs is Microsoft selling, and how many users of each? (ERP Premium / ERP full / CE Premium / CE Enterprise / Sales-CS Professional / Attach / Activity / Team Members / Device; Customer Insights?)
6. How do users ramp per wave — how many at each go-live vs. full deployment?
7. Is there a negotiated monthly subscription total from Microsoft, or should we compute from list prices?

**Scope**
8. Is Commerce in scope?
9. Which interfaces/integrations are in scope?
10. Which ISVs are in scope? (Names and monthly pricing if known.)
11. Is any IP (MCA or third-party) in scope?
12. Are Copilot Studio agents in scope? (What agents, expected usage?)
13. Do they plan to use M365 Copilot / Cowork with D365? For how many users?
14. Should Microsoft Fabric be budgeted? (Capacity size if known.)
15. Are multiple production environments required?

**Always close with:** 16. *"What other facts might pertain to making the IT budget?"*

Do not ask about HQ location or Azure region — it doesn't affect this estimate.

### Step 2 — Translate answers to estimator fields

Read `references/question-mapping.md` and map every answer per its rules. Key points:

- Several questions have **no native field** (Commerce, interfaces, ISVs, IP, M365
  Copilot, Fabric) and are modeled as `customItems` rows or `copilotAgents` entries.
  When a price is unknown, add the row anyway with `monthlyAmount: 0` and a
  `notes: "pricing TBD"` — $0 rows keep the scope item visible in the tool.
- **Show your math** for derived values. Concurrent developers =
  `ceil(dev hours ÷ (duration months × 130 productive hours/dev-month))` — state the
  formula with the numbers and ask the user to confirm before finalizing.
- State every assumption you make. Collect them for the summary in Step 4.

### Step 3 — Build and validate the JSON

1. Start from `references/template.estimate.json` — never build the file from scratch.
2. Apply the mapped values.
3. Validate against the checklist in `references/estimate-schema.md`. The estimator
   rejects the whole file on any schema violation, and some mistakes (inverted month
   ranges, duplicate environment ids) pass the schema but silently produce wrong
   numbers — the checklist covers both kinds.

`references/example.estimate.json` is a fully worked two-wave example — consult it
when unsure how a structure should look.

### Step 4 — Deliver

Produce two things:

1. **The file** `<Client>.estimate.json` (use the client's name; it becomes the
   estimator's save filename).
2. **An assumptions & unknowns summary** in this format:

| # | Item | Value used | Source / assumption |
|---|------|-----------|---------------------|
| 1 | Concurrent developers | 5 | 4,500 h ÷ (7 mo × 130 h) = 4.95 → 5 (confirmed) |
| 2 | Commerce Scale Unit | $0 placeholder | In scope, pricing TBD |

List every $0 placeholder row and every derived or assumed number. These are the
follow-ups the seller must price before the estimate is final.

If the user doesn't have the estimator tool, give them the bundled `estimator.html`
from this skill's folder.

### Step 5 — Tell the user how to import

> Open `estimator.html` in a browser (double-click the file — no install needed).
> Click **Open JSON** in the header and pick `<Client>.estimate.json`.
> The dashboard, schedule grid, and monthly costs fill in immediately.
> Note: importing replaces whatever estimate was previously open, and the tool
> autosaves your work in the browser. Use **Save JSON** to export changes back to a file.

## Rules

- Never invent prices. Unknown price → $0 row + TBD note, and list it in the summary.
- Never omit a top-level JSON key from the template — the import fails atomically.
- `schemaVersion` is the **number** `1`, never the string `"1"`.
- Months are 1-based integers relative to project start; `toMonth` is inclusive.
- Leave `environments: []` unless adding an extra PROD/TRAIN or overriding storage —
  the tool derives the standard environment set from the timeline automatically.
- Currency is USD list pricing throughout.

## Additional Resources

- **`references/question-mapping.md`** — every discovery question mapped to its JSON field, with heuristics and worked examples
- **`references/estimate-schema.md`** — the full JSON contract: required keys, enums, valid ids, and the validation checklist
- **`references/template.estimate.json`** — minimal valid starting file (matches the tool's "New" estimate)
- **`references/example.estimate.json`** — fully worked two-wave phased rollout with ISVs, agents, and placeholders
- **`estimator.html`** — the estimator tool itself; give a copy to users who don't have it
