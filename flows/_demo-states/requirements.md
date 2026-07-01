# State Switcher Demo — Requirements

> **Purpose:** Demonstrate the `prototype-tools.js` state switcher pattern to the team,
> showing how default, error, and empty states are implemented in a flow prototype.

---

## Context

- **Tool area:** Prototype infrastructure — not a real product flow.
- **Target user role:** Prototype author (designer / AI assistant building flows).
- **Entry point:** Linked from the Prototype Viewer dashboard (`index.html`).

---

## User Stories

| ID    | As a…            | I want to…                                          | So that…                                                   |
|-------|------------------|-----------------------------------------------------|------------------------------------------------------------|
| US-01 | Prototype author | see all available states in a floating toolbar      | I can switch between states without editing the URL manually |
| US-02 | Prototype author | deep-link to a specific state via `?state=x`        | I can share a direct link to an error or edge-case state    |
| US-03 | Presenter        | hide the toolbar via `?presenter=true`              | demo recordings and stakeholder reviews look clean          |

---

## Acceptance Criteria

### US-01 — Floating toolbar
- **Given** a page that declares `window.FLOW_STATES`
- **When** the page loads without `?presenter=true`
- **Then** a toolbar appears fixed at the bottom-right listing one button per state; the active state button is styled as primary

### US-02 — Deep-link to state
- **Given** a URL with `?state=error`
- **When** the page loads
- **Then** only elements with `data-show-on-state="error"` are visible; all other conditional elements are hidden

### US-03 — Presenter mode
- **Given** a URL with `?presenter=true`
- **When** the page loads
- **Then** the toolbar is not rendered; the correct state is still applied from `?state=`

---

## States & Edge Cases

| State             | Trigger                             | Expected UI behavior                                           |
|-------------------|-------------------------------------|----------------------------------------------------------------|
| default           | `?state=default` or no param        | Happy-path work order list with 3 items and status badges      |
| error             | `?state=error`                      | Reschedule form with date field in error state and error copy  |
| empty             | `?state=empty`                      | Empty-state card with explanatory message and Refresh button   |

---

## Open Questions

- None — this is an infrastructure demo, not a stakeholder deliverable.
