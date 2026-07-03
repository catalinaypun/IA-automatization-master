# Changelog — Pricing Desk

All notable design changes to this flow are documented here.

---

## [2026-07-03]

### Changed
- Replaced the Promotion Summary accordion with a two-panel master-detail layout: a compact promotions list on the left and a focused promotion detail panel on the right, so users can switch context faster while keeping bundle and tier details visible in one place.
- Reworked the Promotion Summary layout: promotions now group into a collapsible accordion (one entry per promotion, no more duplicate promotion header rows) instead of an always-expanded, deeply nested table.
- Bundles within a promotion (e.g. different free-month terms) now switch via a segmented control instead of stacking vertically, and each bundle shows a single consolidated product tier table instead of separate side-by-side tables per product — matching stakeholder feedback on the legacy Promotions screen being hard to scan.

### Added
- Initial proof of concept for Pricing Desk, including master/child promotion setup and a promotion summary/search area for Promotion Manager workflows.
- Promotions baseline list aligned to current operational UI, including key columns (status, terms, free months, lock price, discount type, install) and quantity-tier product breakdown per promotion.
- Add Promotion builder baseline with guided steps and sectioned form structure (Information, Additional Context & Configuration, MRR & Customer Tenure, Contract Flexibility & Pricing Options).
