# CLAUDE.md — Prototype Ecosystem Rules

## Context
This is a prototype ecosystem of vanilla HTML/CSS/JS prototypes for a Verizon Business
field-service internal tool (Salesforce-embedded).

## Stylesheet
The default stylesheet is the Verizon Design System (VDS). Use the same reference
that `job-detail.html` uses:
```html
<link rel="stylesheet" href="./assets/ds/design-system.css">
```
(Adjust the relative path depth as needed per flow subfolder.)

### SLDS exception (Salesforce-native flows)
Flows whose `"project"` is `"upsells"` (or any future project explicitly documented
here as Salesforce-native) are built directly for the Salesforce Lightning Experience
UI itself rather than the Verizon-branded tool embedded inside it. These flows use the
vendored Salesforce Lightning Design System (SLDS) instead of VDS:
```html
<link rel="stylesheet" href="./assets/ds/slds/salesforce-lightning-design-system.min.css">
```
(Adjust the relative path depth as needed per flow subfolder.) All other hard rules
below (no frameworks, no build tools, no inline styles, no custom CSS, flow structure,
states rules, documentation rules) still apply — only the stylesheet choice changes.
Never mix VDS and SLDS classes in the same flow.

## Hard rules
- No frameworks, no build tools, no Tailwind, no inline styles, no custom CSS.
- Every prototype must be vanilla HTML + VDS (or SLDS for Salesforce-native flows, see above) only.

## Golden reference
`job-detail.html` is the golden reference for VDS flows. Every VDS prototype must
match its structure and conventions (head setup, asset paths, VDS class usage).
`flows/upsells/index.html` is the golden reference for SLDS flows.

## Knowledge base
`/knowledge-base/design-system.md` contains the design system rules and is **required
reading before any HTML task**.

## Flow structure
Every flow lives in `/flows/{flow-name}/` and must contain:
- `index.html`
- `requirements.md`
- `CHANGELOG.md`
- `states.md`

(These rules will be expanded in later steps.)

## States Rules

1. Every flow must include `prototype-tools.js` and declare at minimum three states:
   `default`, one error/validation state, and one empty or edge-case state.
2. Every state in the prototype must exist in:
   - The **States & Edge Cases** table in `requirements.md`
   - The **`states`** array in the flow's `flow.json` entry
   - The **`states.md`** file in the flow folder
   All three must always match — if one changes, update the others in the same task.
3. Create `/flows/{flow-name}/states.md` documenting each state: trigger, expected
   behavior, and its deep link (`?state=x`).
4. Use `?presenter=true` to hide the toolbar for stakeholder demos and recordings.

## Documentation Rules

Every flow has four doc files: `requirements.md`, `CHANGELOG.md` (source of truth),
and their HTML twins `requirements.html`, `CHANGELOG.html` (generated views).

1. Whenever a flow's `.md` docs change — including at session wrap-up — regenerate
   their `.html` twins in the same task so they never drift.
2. The `.html` views must always include the notice:
   `"Generated from the .md source — do not edit manually."`
3. The States & Edge Cases table in `requirements.html` must render each state as a
   VDS badge (`badge--gray` default · `badge--blue` loading · `badge--red` error/validation
   · `badge--orange` permission denied · `badge--yellow` in-review/warning).
4. The dashboard (`index.html`) Requirements and Changelog links point to the `.html`
   versions, not the `.md` files.

## Ecosystem Rules

1. Every new flow must be registered in `flow.json` in the same task that creates it.
   `flow.json` must never be out of date with the flows that exist on disk.
2. Every flow entry must include a `"project"` field matching one of the ids in the
   top-level `"projects"` array (e.g. `"c360"`, `"valucal"`, `"upsells"`). The viewer
   uses this to filter flows per project in the left sidebar.
3. When a flow's status changes (draft → in-review → approved), update `flow.json`
   and commit the change.
4. Every task that updates `flow.json` must also update the embedded manifest block in
   `index.html` (the `<script type="application/json" id="flow-manifest">` block) so
   they never drift. The viewer reads from that block — it does not fetch `flow.json`
   at runtime.

## Changelog Rules

1. A flow's `CHANGELOG.md` records **only** functional and design changes to that
   prototype: behavior, interactions, UI changes, states, copy, requirements.
   It is read by stakeholders as the history of design decisions.
2. **Never** record ecosystem or infrastructure work in a flow's `CHANGELOG.md`.
   The following do NOT belong there — they live in git history only:
   - Dashboard/viewer updates, `flow.json` registration, embedded manifest sync
   - HTML doc twin regeneration, template changes, file moves/renames
   - Audits, tooling, git housekeeping
3. If a task mixes both (e.g. a design change that also triggers a manifest sync),
   the changelog entry describes **only** the design change.
4. **Litmus test** for every entry: "Would a stakeholder reviewing the design care
   about this?" If not, it does not belong in `CHANGELOG.md`.
5. Entries are written for stakeholders: describe the change and the reason
   ("Changed reschedule trigger from button to inline link per stakeholder
   feedback"), never the code change.
6. Also make a git commit per task with a conventional commit message:
   `feat|fix|docs|chore({flow-name}): short description`.

## Requirements Rules

1. Every time you **CREATE** a flow prototype, you must also generate
   `/flows/{flow-name}/requirements.md` following the template at
   `/docs/templates/requirements-template.md`, deriving user stories and
   acceptance criteria from what was discussed in the session.
2. Every time you **MODIFY** a flow, update `requirements.md` so it always
   reflects the current behavior of the prototype. Requirements and prototype
   must never contradict each other.
3. Write requirements in English, in language a Salesforce developer can
   implement from directly.
4. If the session did not discuss enough detail to fill a section, add it to
   "Open Questions" — never invent requirements.

## Design System Updates
`assets/ds/` is a vendored copy of the VDS repo, and `assets/ds/slds/` is a vendored
copy of the `@salesforce-ux/design-system` package (SLDS). Neither is a git submodule —
their files are regular tracked files of this repo. To update either:
1. Replace the files in `assets/ds/` (or `assets/ds/slds/`) manually with the latest
   version from the source repo/package.
2. Commit the change with a changelog-style message describing what changed in the DS,
   e.g. `chore(ds): update VDS to vX.Y — added foo token, removed bar class` or
   `chore(ds): update SLDS to vX.Y — ...`.
