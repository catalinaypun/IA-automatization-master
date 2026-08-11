# Upsells — Requirements

> **Purpose:** Let a Salesforce user configure and add an upsell product to an existing Order, directly within the Salesforce Lightning Experience UI (not the Verizon-branded embedded tool).

---

## Context

- **Tool area:** Salesforce Order record page (Lightning Experience), Sales / Orders app.
- **Target user role:** Sales Rep / Account Manager working an Order.
- **Entry point:** From the Order record page, in the "Configure Upsell" card.
- **Design system:** This flow is Salesforce-native and uses SLDS (Salesforce Lightning Design System) instead of VDS — see the SLDS exception in `CLAUDE.md`.

---

## User Stories

| ID    | As a…              | I want to…                                              | So that…                                              |
|-------|--------------------|----------------------------------------------------------|--------------------------------------------------------|
| US-01 | Sales Rep          | select an eligible upsell product for an Order and set its quantity and discount | I can add the right upsell with the correct pricing to the Order |
| US-02 | Sales Rep          | see the extended price update as I configure the upsell  | I know the total cost before adding it to the Order     |
| US-03 | Sales Rep          | see the upsells already added to this Order              | I don't duplicate an upsell that's already on the Order  |
| US-04 | Sales Rep          | get a clear message when no eligible upsells exist for this Order | I understand why I can't add one and can act accordingly |

---

## Acceptance Criteria

### US-01 — Configure and add an upsell
- **Given** I am on the Order record page with eligible upsell products available
- **When** I select a product, set a quantity greater than 0, and click "Add to Order"
- **Then** the upsell is added to the "Upsells on this Order" list

### US-02 — Live extended price
- **Given** I have selected an upsell product
- **When** I change quantity or discount %
- **Then** the Extended Price field reflects the updated total

### US-03 — Existing upsells visibility
- **Given** the Order already has one or more upsells added
- **When** the Configure Upsell card loads
- **Then** those upsells are listed in the "Upsells on this Order" table with product, quantity, unit price, and extended price

### US-04 — No eligible upsells
- **Given** the account has reached its upsell limit or no eligible products are configured for the Order's Pricebook
- **When** the Configure Upsell card loads
- **Then** an empty-state message explains why no upsells are available, and the product selector/Add action are not shown

---

## States & Edge Cases

| State             | Trigger                                          | Expected UI behavior                                                        |
|-------------------|---------------------------------------------------|-------------------------------------------------------------------------------|
| default           | Order loads with eligible upsells available        | Product selector, quantity/discount inputs, extended price, and Add button are visible; existing upsells (if any) are listed |
| loading           | Eligible upsell products are being fetched          | Spinner is shown over the Configure Upsell card body                         |
| empty             | No eligible upsells for this Order/account          | Empty-state illustration and message shown; selector and Add action hidden; related list shows "No upsells added yet." |
| validation-error  | User attempts to add an upsell with quantity = 0    | Error banner shown at top of card; Quantity field shows inline help text     |

---

## Open Questions

- [ ] What is the actual eligibility rule for "upsell limit reached" on an account — is it a fixed count, a dollar cap, or product-specific?
- [ ] Should discount % have a max cap enforced by profile/role (e.g. reps can't exceed 15% without approval)?
- [ ] Does adding an upsell require a page save, or is it committed immediately (matching a Quick Action / LWC pattern)?
- [ ] Should removing an upsell from the related list require a confirmation step?
