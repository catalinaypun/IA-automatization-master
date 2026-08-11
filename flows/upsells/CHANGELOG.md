# Changelog — Upsells

All notable design changes to this flow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Entries are written for stakeholders — describe the design change and the reason, not the code.

---

## [2026-08-11]

### Added
- Created the initial Upsells flow: a Salesforce Order record page with a "Configure Upsell" card for selecting an upsell product, setting quantity and discount, and adding it to the Order.
- Added an "Upsells on this Order" related list showing previously added upsells.
- Added `default`, `loading`, `empty`, and `validation-error` states, including an empty-state message for when no eligible upsells exist and a validation error for a zero quantity.
- Built with SLDS (Salesforce Lightning Design System) instead of VDS, since this flow represents native Salesforce UI rather than the Verizon-branded embedded tool.
