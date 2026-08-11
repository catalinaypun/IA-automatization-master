# Changelog — Upsells

All notable design changes to this flow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Entries are written for stakeholders — describe the design change and the reason, not the code.

---

## [2026-08-11] — Rebuilt "Capture customer data" modal as a real 2-step wizard

### Changed
- Made the product list table in step 1 **read-only** (removed the row "Select" actions) — it now only shows which products this capture applies to, per stakeholder feedback that the row actions were confusing.
- Added the missing "Next" action to step 1's footer (previously only had "Cancel").

### Added
- Added the modal's real step 2 ("Select a product and complete vehicle information"): the same product table gains a radio button per row to choose which line to configure next, with the shipping address and contact shown again for confirmation. Sourced from Marcela's Figma (all 6 modal-state variants reviewed for fidelity).
- Added "Back" navigation from the vehicle-capture screens (Select vehicles / Enter vehicles) to the new product-selection step.

## [2026-08-11] — Pixel-perfect pass against Marcela's Order Tab Figma

### Added
- Added the Global Navigation bar (Home / Accounts / Opportunities / Quotes / Orders / Products / Product Rules / Price Rules / Summary Variables / More) below the Global Header, matching the real Salesforce app shell.
- Added the Opportunity stage Path (Prospecting → Qualification → Developing → Negotiating → Close) with a "Change Closed Status" action.
- Added the "Related List Quick Links" panel (Quote, Approvals, Commissions, Contact Roles, Contracts, Order Line Items, Gong Conversations, DocuSign Status).
- Added the right-hand Activity sidebar (Activity / Chatter / Cases / Promo Details tabs) with the "Upcoming & Overdue's" empty-state panel.
- Added "Export" and "Finalize" actions above the Opportunity product table, and a "View All" action below it.
- Added the missing "Amount" field to the Opportunity detail row.

### Changed
- Reorganized the Capture tab into a two-column layout (product/vehicle capture on the left, Activity sidebar on the right) to match the real screen.
- Reordered the Vehicles/Asset Trackers action buttons to "Edit Installation address" then "Edit shipping address" per the source design.

## [2026-08-11] — Component catalog kickoff (SLDS)

### Added
- Added a dedicated component catalog page at `flows/upsells/components/index.html` to build the Upsells design system in controlled increments.
- Implemented and locked the first two baseline components in the agreed sequence: Global Header and Opportunity Record Header.
- Added a component backlog tracker at `flows/upsells/components.md` to keep implementation order and completion status explicit.
- Added the next baseline component set to the catalog: Opportunity Product Table, Capture Customer Data Modal (capture-data and validation-error variants), Select Vehicles Modal, and Enter Vehicles Modal.
- Added the remaining baseline components to complete the agreed sequence: Hardware Incompatible Modal and Feature Not Available Banner.

### Changed
- Added an in-flow link on the Upsells screen to open the new component catalog directly from the prototype.

## [2026-08-11] — Interactivity + pixel-accuracy pass

### Changed
- Wired every button/link in the flow (Capture customer details, row-level Select actions, modal close/Cancel/Save/Proceed) to actually drive state transitions, so the prototype can be clicked through end-to-end instead of only switching states from the toolbar.
- Corrected the Global Header to match the real SLDS component (verified against Salesforce's official Figma Lightning Design System library): white background instead of a dark bar, with a proper search input and the standard action icon set (Favorites, Create New, Setup, Help, Notifications, Avatar).

## [2026-08-11] — Revised to match real Opportunity Capture flow

### Changed
- Rebuilt the flow from scratch to match the actual "Order Tab" capture experience: it now lives on the Opportunity record's Capture tab (not a standalone Order page), based on stakeholder walkthroughs and the existing Figma design.
- Replaced the generic "select a product and configure quantity/discount" screen with the real Opportunity product table (Product, Parent Bundle Name, Quantity, Hardware type, Order Detail Type, VMI), since upsell/expansion lines already exist on the Opportunity and are never picked fresh in this UI.
- Split vehicle capture into two distinct paths per line type: selecting an existing vehicle for Upsell lines (no new VIN allowed) vs. entering a new VIN for Expansion/Initial Sale lines.
- Added a hardware compatibility result step showing the current vs. required core and the replacement/shipping note when an upsell isn't compatible with the vehicle's existing hardware.
- Replaced the previous 4-state set with 7 states that reflect the real screens: `default`, `capture-data`, `validation-error`, `select-vehicles`, `enter-vehicles`, `incompatible`, `empty`.

## [2026-08-11] — Initial version

### Added
- Created the initial Upsells flow: a Salesforce Order record page with a "Configure Upsell" card for selecting an upsell product, setting quantity and discount, and adding it to the Order.
- Added an "Upsells on this Order" related list showing previously added upsells.
- Added `default`, `loading`, `empty`, and `validation-error` states, including an empty-state message for when no eligible upsells exist and a validation error for a zero quantity.
- Built with SLDS (Salesforce Lightning Design System) instead of VDS, since this flow represents native Salesforce UI rather than the Verizon-branded embedded tool.
