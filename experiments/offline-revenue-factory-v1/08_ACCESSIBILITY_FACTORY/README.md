# White-label accessibility acceptance-evidence backend

Pointer directory — the real implementation lives in the product tree:

- Lane module: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/lanes/accessibility.py`
- Fixtures: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/accessibility/{clean_pass,violations_found,partial_manual_review,duplicate_findings,missing_scan_data,stale_scan}/`
- Generated example delivery: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/accessibility/`
- Commercial paperwork drafts: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/templates/commercial/` (fill `[LANE]` = `accessibility`)
- Reference docs: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/05_lane_reference.md`

## Scope
Automated-scan violation extraction, deduplication, and
impact-severity summary; scan-data freshness detection (90-day
threshold); manual-checklist pass/fail/not-tested tally; page-inventory
recording.

## Required input
`automated_scan.json`; `manual_checklist.json` and
`page_inventory.json` are optional.

## Always concludes
`"blocked conclusion"` plus a blocking human review with
`required_role="licensed_professional"` — an automated pass never
certifies WCAG, ADA, or Section 508 conformance in this system.

## Example delivery
Generated from the `violations_found` fixture: 13 findings, 11
evidence items, 4 human review requests, QA 5/5 pass.
