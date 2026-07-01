# {Flow Name} — Requirements

> **Purpose:** {One-line description of what this flow does and why it exists.}

---

## Context

- **Tool area:** {Which part of the Verizon C360 / field-service tool this belongs to.}
- **Target user role:** {e.g., Field Technician, Dispatcher, Account Manager}
- **Entry point:** {How the user reaches this flow — e.g., from the Job List, from a notification, etc.}

---

## User Stories

| ID    | As a…         | I want to…    | So that…      |
|-------|---------------|---------------|---------------|
| US-01 | {role}        | {action}      | {benefit}     |
| US-02 | {role}        | {action}      | {benefit}     |

---

## Acceptance Criteria

### US-01 — {short title}
- **Given** {precondition}
- **When** {action}
- **Then** {expected result}

### US-02 — {short title}
- **Given** {precondition}
- **When** {action}
- **Then** {expected result}

---

## States & Edge Cases

| State             | Trigger                              | Expected UI behavior                        |
|-------------------|--------------------------------------|---------------------------------------------|
| Happy path        | {normal conditions}                  | {what the user sees}                        |
| Loading           | {data fetch in progress}             | {skeleton / spinner behavior}               |
| Empty             | {no data returned}                   | {empty state message or illustration}       |
| Validation error  | {user submits invalid input}         | {inline error message, field highlight}     |
| Permission denied | {user lacks required role/access}    | {disabled state, hidden element, or message}|
| System error      | {API failure or timeout}             | {error banner, retry option}                |

---

## Open Questions

- [ ] {Decision or clarification still pending from stakeholders.}
- [ ] {Add more as needed — never invent requirements to fill gaps.}
