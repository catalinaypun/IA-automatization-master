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
