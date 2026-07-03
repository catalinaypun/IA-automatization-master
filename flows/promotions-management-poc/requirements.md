# Pricing Desk — Requirements

> **Purpose:** Establish a baseline Promotions experience in Pricing Desk to list active promotions and show product pricing behavior by quantity tiers.

---

## Context

- **Tool area:** Pricing Manager
- **Target user role:** Promotion Manager
- **Entry point:** From Salesforce, through the Promotions menu.

---

## User Stories

| ID    | As a…             | I want to…                                                        | So that…                                                              |
|-------|-------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------|
| US-01 | Promotion Manager | view promotions in a compact list and select one at a time        | I can quickly identify active offers and focus on one promotion detail |
| US-02 | Promotion Manager | inspect product-level quantity tiers in a dedicated detail panel   | I can validate pricing behavior by min/max quantity ranges without losing list context |
| US-03 | Promotion Manager | filter, search, and start adding a new promotion from one place   | I can manage promotions without leaving the Pricing Desk context       |
| US-04 | Promotion Manager | open an Add Promotion builder with guided sections                | I can capture master details and pricing configuration in a structured flow |

---

## Acceptance Criteria

### US-01 — Promotions summary list
- **Given** I open Pricing Desk from the Promotions menu
- **When** the default state loads
- **Then** I see a two-panel layout where the left panel shows a compact promotions list (name, date range, status badge) and the first promotion is selected by default

### US-02 — Product quantity tier visibility
- **Given** I select a promotion from the left panel list
- **When** the promotion has more than one child bundle (e.g. different term lengths)
- **Then** the right detail panel updates to that promotion, where I can switch bundles using a segmented control and each bundle shows its own Terms/Free Months/Lock Price/Discount Type/Install values and a single consolidated product table with min quantity, max quantity, and price per product

### US-03 — Management entry actions
- **Given** I am in the promotions view
- **When** I use the top action area
- **Then** I have controls for filter, search, and add promotion

### US-04 — Add Promotion builder baseline
- **Given** I click Add Promotion from the summary screen
- **When** the builder opens
- **Then** I see step labels (Master Details, Child Promotions, Tiers & Floor Pricing, Review) and sections for Information, Additional Context & Configuration, MRR & Customer Tenure, and Contract Flexibility & Pricing Options

---

## States & Edge Cases

| State            | Trigger                                   | Expected UI behavior                                              |
|------------------|-------------------------------------------|-------------------------------------------------------------------|
| default          | Page opens with valid data                | Two-panel promotions layout is visible, first promotion is selected in the left list, and its detail is visible on the right; Add Promotion can open the builder view |
| loading          | Promotion data retrieval in progress      | Loading indicator is visible; two-panel promotions layout is hidden |
| validation-error | User submits incomplete required data     | Validation message appears while the two-panel promotions layout remains visible |
| system-error     | Promotions retrieval fails                | System error message is shown; two-panel promotions layout is hidden |

---

## Open Questions

- [ ] Which fields should be editable inline in this screen vs. moved to a create/edit promotion flow?
- [ ] In the builder, which fields are mandatory only for auto-approval vs. mandatory for full approval workflows?
- [ ] Should the promotions list support sorting/grouping options (for example by status or date range) in the left panel?
