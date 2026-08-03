# Agency RFP compliance-matrix backend

Pointer directory — the real implementation lives in the product tree:

- Lane module: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/lanes/agency_rfp.py`
- Fixtures: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/agency_rfp/{complete,amended,unanswered_questions,conflicting_requirements,missing_submission_evidence,unparseable_format}/`
- Generated example delivery: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/agency_rfp/`
- Commercial paperwork drafts: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/templates/commercial/` (fill `[LANE]` = `agency_rfp`)
- Reference docs: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/05_lane_reference.md`

## Scope
Requirement/question/attachment extraction from the lane's own
line-based markup format, mandatory-requirement and
submission-evidence gap detection, source-declared conflict register,
and amendment reconciliation (due-date supersession, MODIFY/ADD/REMOVE
actions).

## Required input
`metadata.json` plus the RFP document in the lane's own markup format.
Real PDF/DOCX documents must be transcribed into that markup by a
human first — no binary office-format parser exists in this offline
system.

## Always concludes
`"blocked conclusion"` plus a blocking human review for the actual
submit/no-bid decision — this system never submits a bid or asserts
legal sufficiency of a submission.

## Graceful degradation on unparseable input
The `unparseable_format` fixture is a deliberately-invalid-UTF-8
binary file. The lane does not crash on it and does not fabricate
content — it records an `unknown` finding and a blocking human review
instead.

## Example delivery
Generated from the `complete` fixture: 9 findings, 5 evidence items, 1
human review request, QA 5/5 pass.
