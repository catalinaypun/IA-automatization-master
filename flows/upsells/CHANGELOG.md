# Changelog — Upsells

All notable design changes to this flow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Entries are written for stakeholders — describe the design change and the reason, not the code.

---

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
