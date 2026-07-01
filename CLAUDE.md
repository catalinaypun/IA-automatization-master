# CLAUDE.md — Prototype Ecosystem Rules

## Context
This is a prototype ecosystem of vanilla HTML/CSS/JS prototypes for a Verizon Business
field-service internal tool (Salesforce-embedded).

## Stylesheet
The ONLY stylesheet allowed is the Verizon Design System (VDS). Use the same reference
that `job-detail.html` uses:
```html
<link rel="stylesheet" href="./assets/ds/design-system.css">
```
(Adjust the relative path depth as needed per flow subfolder.)

## Hard rules
- No frameworks, no build tools, no Tailwind, no inline styles, no custom CSS.
- Every prototype must be vanilla HTML + VDS only.

## Golden reference
`job-detail.html` is the golden reference. Every prototype must match its structure
and conventions (head setup, asset paths, VDS class usage).

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
`assets/ds/` is a vendored copy of the VDS repo. It is not a git submodule — its files
are regular tracked files of this repo. To update it:
1. Replace the files in `assets/ds/` manually with the latest version from the source repo.
2. Commit the change with a changelog-style message describing what changed in the DS,
   e.g. `chore(ds): update VDS to vX.Y — added foo token, removed bar class`.
