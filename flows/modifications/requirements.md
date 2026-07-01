# Modifications — Requirements

> **Purpose:** Allow a field technician to view and edit job details inline,
> within a split-panel layout embedded in Salesforce.

---

## Context

- **Tool area:** C360 — Job Detail
- **Target user role:** Field Technician, Dispatcher
- **Entry point:** From the Job List, clicking a job record opens this view.

---

## User Stories

| ID    | As a…              | I want to…                                          | So that…                                                      |
|-------|--------------------|-----------------------------------------------------|---------------------------------------------------------------|
| US-01 | Field Technician   | view job details in a split-panel layout            | I can see all relevant information without leaving Salesforce |
| US-02 | Field Technician   | edit job fields inline on the right panel           | I can update job data without navigating to a separate form   |
| US-03 | Dispatcher         | see the current state of a job at a glance          | I can triage and prioritize work orders efficiently           |

---

## Acceptance Criteria

### US-01 — Split-panel layout
- **Given** a field technician opens a job record
- **When** the Job Detail view loads
- **Then** a split layout is shown: read-only summary on the left, editable detail on the right

### US-02 — Inline editing
- **Given** the technician is on the edit panel
- **When** they modify a field and submit
- **Then** the field is saved and the left panel updates to reflect the change

### US-03 — Job state visibility
- **Given** any user opens the view
- **When** the page loads
- **Then** the job status, type, and key dates are prominently displayed with appropriate VDS badges

---

## States & Edge Cases

| State            | Trigger                          | Expected UI behavior                                    |
|------------------|----------------------------------|---------------------------------------------------------|
| default          | Job record loads successfully    | Split layout shown, all fields populated                |
| loading          | Data fetch in progress           | Skeleton or spinner in both panels                      |
| validation error | User submits invalid field value | Inline error message below the field, submit blocked    |
| permission denied| User lacks edit rights           | Edit panel fields disabled or hidden                    |

---

## Open Questions

- [ ] Which fields are editable inline vs. requiring a full Salesforce record edit?
- [ ] What happens when a job is locked (in-progress by another technician)?
