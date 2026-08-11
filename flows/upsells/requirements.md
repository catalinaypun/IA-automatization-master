# Upsells — Requirements

> **Purpose:** Let a Sales/Growth user capture the vehicle and shipping/installation data needed to fulfill an Upsell (or Blended) order directly from the Salesforce Opportunity, distinguishing lines that need a brand-new vehicle (Expansion / Initial Sale) from lines that only add a feature to a vehicle the account already owns (Upsell).

---

## Context

- **Tool area:** Salesforce Opportunity record, "Capture" tab (Lightning Experience). This is the same "Order Tab" capture experience referenced by the business, currently built on the Opportunity rather than the Order object.
- **Target user role:** Sales / Growth Team (initiates the upsell capture); Onboarding Success Specialist (OSS) validates it afterward.
- **Entry point:** "Capture customer details" action on the Opportunity page header, visible once the Opportunity product lines have an Order Detail Type.
- **Design system:** This flow is Salesforce-native and uses SLDS (Salesforce Lightning Design System) instead of VDS — see the SLDS exception in `CLAUDE.md`.
- **Design source:** Structure, copy, and screens are taken directly from Marcela's existing Figma file ("Upsell experience" board, Order Tab file) plus two stakeholder walkthroughs (Leo Gómez, product; Gabriel Barbosa, engineering) and the "Data Capture Business Owner" deck.

---

## Key definitions (confirmed by stakeholders)

- **Initial Sale**: first bundle sold to a brand-new account — a full bundle (core + features) on a brand-new vehicle.
- **Expansion**: adding a full bundle (core + features) to a new vehicle on an *existing* account. Structurally identical to Initial Sale — both require entering a new VIN.
- **Upsell**: adding only feature(s) — no core — to a vehicle that already has a core installed. Requires selecting an *existing* vehicle; the upsell experience does not allow capturing a new VIN.
- **Blended order**: an order/Opportunity that contains both Upsell lines and Expansion/Initial Sale lines together.
- **Order Detail Type**: a field on the Opportunity Product line (Expansion / Initial Sale / Upsell) that is populated automatically from the Order + CPQ — it is not user-editable in this UI, only displayed.

---

## User Stories

| ID    | As a…       | I want to…                                                                 | So that…                                                              |
|-------|-------------|------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| US-01 | Sales/Growth | see each Opportunity product line's Order Detail Type (Expansion / Initial Sale / Upsell) | I know which lines need a new vehicle vs. an existing one            |
| US-02 | Sales/Growth | capture one shared shipping address and installation contact for all lines by default | I don't have to re-enter the same address for every product          |
| US-03 | Sales/Growth | select an existing vehicle for an Upsell line instead of entering a new VIN  | I don't accidentally create a duplicate vehicle record                |
| US-04 | Sales/Growth | enter a new VIN for an Expansion or Initial Sale line                        | the new vehicle gets properly registered                              |
| US-05 | Sales/Growth | know immediately if the selected vehicle's existing hardware is incompatible with the upsell feature | I can inform the customer a core replacement is needed before finalizing |
| US-06 | Sales/Growth | see a clear message when the Capture experience isn't enabled yet for an Opportunity | I know not to attempt the capture and can follow up later             |

---

## Acceptance Criteria

### US-01 — Order Detail Type visibility
- **Given** an Opportunity has product lines from a Blended order
- **When** I open the Capture tab
- **Then** the Opportunity product table shows Product, Parent Bundle Name, Quantity, Hardware type, Order Detail Type, and VMI for every line

### US-02 — Shared shipping/install info
- **Given** I click "Capture customer details"
- **When** the "Shipping address and contact are the same for all products" checkbox is checked
- **Then** one address and one contact selection apply to every line in the capture

### US-03 — Select existing vehicles for Upsell
- **Given** I'm capturing a line whose Order Detail Type is Upsell
- **When** I reach the vehicle step
- **Then** I see a checkbox list of vehicles already on the account (Vehicle Name, YMM, VIN, Class, Vehicle ID) and cannot enter a new VIN

### US-04 — Enter new VINs for Expansion/Initial Sale
- **Given** I'm capturing a line whose Order Detail Type is Expansion or Initial Sale
- **When** I reach the vehicle step
- **Then** I see an editable table to type in the new vehicle's name, YMM, VIN, and class

### US-05 — Hardware compatibility result
- **Given** I've selected an existing vehicle for an Upsell line
- **When** the Hardware Specifier compatibility check returns incompatible
- **Then** I see the current core, the required core, and a note that replacement hardware will be shipped/installed at no charge to the contract (per KB reference — see Open Questions)

### US-06 — Feature not yet available
- **Given** the Capture experience is not yet enabled for this Opportunity
- **When** I open the Capture tab
- **Then** I see a warning banner: "The 'Capture customer details' functionality is not yet available." and the action is disabled

---

## States & Edge Cases

| State             | Trigger                                                                | Expected UI behavior                                                                                 |
|--------------------|---------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| default            | Opportunity record loads, Capture tab selected                           | Opportunity product table with Order Detail Type per line; Vehicles/Asset Trackers/Key Fob IDs at 0     |
| capture-data       | User clicks "Capture customer details"                                   | Existing/New table per line + valid shipping address and contact already selected                       |
| validation-error   | Address/contact not yet selected                                         | Red-bordered selects + inline "Please select an address/contact to continue."                            |
| select-vehicles    | Capturing an Upsell-type line                                            | Checkbox list of existing vehicles only — no new VIN entry allowed                                       |
| enter-vehicles     | Capturing an Expansion/Initial Sale-type line                            | Editable table to type in new vehicle VIN/YMM/Class                                                      |
| incompatible       | Hardware Specifier compatibility check fails                             | Current vs. required core shown, plus the replacement/shipping note                                      |
| empty              | Capture experience not enabled for this Opportunity                      | Warning banner, "Capture customer details" action disabled                                                |

---

## Data fields (from source systems — per "Data Capture Business Owner" deck, fields to be finalized)

- **Reveal/Fleetcare**: Universal Account Id, Vehicle Id, Vehicle Tracking Id, VIN, Year/Make/Model, Vehicle Status, Label, Registration Number, Asset Tracker, VTU/Camera/DVR Serial Number, Imei, gsm, boxId/boxname, Hardware status, LastPing.
- **C360**: Account Id, Shipment Status, ESN, Installed, Worticket Id/Status, Install Type/Status/Date, MMID, Tracking ID.
- **1ERP**: BPID, Next Bill Date, Bill Plan Id, Technical Reference Id, Provider Order Number, Contract Account Number, ESN, Camera.
- **Hubble**: Device Serial Number, FirstPing.
- **SFDC**: Account Id, Account Type/Status, Platform, Contract Type.

## Backend process this UI triggers (for context — not built in this prototype)

1. Fetch VIN/vehicle data (internal → GCP → C360 fallback, up to 24h data latency).
2. Select Parent Line(s) → Choose Upsell Feature (already defined by the Quote, not re-selected here).
3. Call Hardware Specifier (on-demand API, new integration) to check compatibility.
4. If compatible → Amend Contract → Create Quote and Finalize → CSP → Order Tab for the upsell feature.
5. If incompatible → Amend Contract → Core Change decision → Change Parent VTU / Work Tickets → Return Device (C360, existing/BAU — no new UI needed there).
6. Edge case: ESN Mismatch between VTU, 1ERP, and Reveal → creates a validation case instead of proceeding automatically.

---

## Open Questions

*(Carried over verbatim from stakeholder sessions and the Data Capture Business Owner deck — not resolved yet.)*

- [ ] VIN Capture is changing to VIN **Selection** for Upsell — where and when in the flow should this happen? Does the Quote creation step need to know this already?
- [ ] If the ESN isn't installed yet, the VIN info could exist in SFDC or in C360 depending on where the customer is in their onboarding journey — which source should the UI read from?
- [ ] Software-only upsells should bypass the Capture experience entirely — is that reflected in this flow, or handled upstream?
- [ ] Does C360 need to send feedback back into the SFDC Asset so it has the correct info?
- [ ] Today C360 calls Hardware Specifier with vehicle + subscription info; the new design moves that call to SFDC — but SFDC doesn't currently pass subscription info. Who owns this integration change?
- [ ] Is "identify what needs to be shipped vs. replaced" determined in C360 or in Hardware Specifier?
- [ ] Is the core/hardware replacement (when an upsell requires a swap) billed to the customer, or absorbed by Verizon? Referenced KB text says replacement hardware "is not related with the contract and must be added in Connect 360," but this has not been formally confirmed (Gabriel Barbosa, pending verification).
- [ ] Can an Upsell be started on a vehicle that already has a scheduled install appointment? If so, how does it link to the existing appointment (relates to the Modifications flow)?
- [ ] Additional edge cases still being compiled by engineering (Confluence, not yet shared): upsell for a VTU that will need replacement (proposed checkbox to flag this upfront), no VIN captured, no make/model available.
