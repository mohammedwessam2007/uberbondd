# Commercial templates

Pointer directory — the real templates live in the product tree:
`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/templates/commercial/`.

## What's there
13 lane-parameterized Markdown documents (fill in `[LANE]` with one of
`msft_csp`, `hospital_mrf`, `agency_rfp`, `accessibility`, `lead_path`)
plus a README explaining the design choice:

1. Internal scope
2. Exclusions
3. Input checklist
4. Delivery checklist
5. QA checklist
6. Revision boundary
7. Refund-risk register
8. Dispute-evidence checklist
9. Acceptance form
10. Buyer and partner qualification (combined into one document —
    the two checklists share nearly all of their structure)
11. Pricing-hypothesis worksheet
12. Recurring expansion map
13. Kill-condition checklist

This covers every artifact type the mission brief's Phase 9 lists;
buyer qualification and partner qualification were merged into a
single document (`10_buyer_partner_qualification.md`) rather than kept
as two near-duplicate files, per the same scope-discipline reasoning
below.

## Why one document per type instead of 65 per-lane copies
Every template is grounded in real, lane-agnostic structure —
`lane_meta()`'s common shape, `REQUIRED_FILES`/`OPTIONAL_FILES`
conventions, real `check_id`s, the real `DeliveryAcceptance` schema,
and the real `economics.pricing` API — so one parameterized document
per type covers all 5 lanes without duplicating near-identical content
5 times over, consistent with this build's scope-discipline rule
("implement the smallest complete solution").

## Status
These are internal drafting assets, not contracts — every template
says so in its own header, matching the mission brief exactly.
