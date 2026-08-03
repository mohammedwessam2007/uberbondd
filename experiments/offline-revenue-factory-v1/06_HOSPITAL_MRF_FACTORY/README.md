# Hospital price-transparency MRF integrity evidence pack

Pointer directory — the real implementation lives in the product tree:

- Lane module: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/lanes/hospital_mrf.py`
- Fixtures: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/hospital_mrf/{valid,malformed,missing_fields,stale,duplicate_keys,compressed}/`
- Generated example delivery: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/hospital_mrf/`
- Commercial paperwork drafts: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/templates/commercial/` (fill `[LANE]` = `hospital_mrf`)
- Reference docs: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/05_lane_reference.md`

## Scope
File hashing, size, and compression detection; JSON structural-field
and duplicate-key checks; update-indicator staleness detection
(365-day threshold); local link-map validation against optional
metadata files (content-type, redirect, filename, root-TXT,
website-link).

## Required input
At least one MRF candidate file (JSON, optionally gzip-compressed).
Metadata files are optional.

## Not a decision lane
Unlike the other four lanes, `hospital_mrf` does not end in a single
blocked-conclusion finding. Each anomaly (duplicate key, missing
structural field, non-object top level, malformed date, stale data) is
individually flagged `human_review_required=True` with a matching
`human_review_request` — this pairing was a real defect found and
fixed this build cycle (two instances were missing the request; see
`16_LIMITATION_REGISTER.md` and
`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/10_testing.md`). Clean
input produces zero human-review requests.

## Never certifies
File completeness, price accuracy, or legal sufficiency are never
asserted by this lane — it reports structural facts only.

## Example delivery
Generated from the `valid` fixture: 5 findings, 5 evidence items, 0
human review requests (clean input), QA 4/4 pass.
