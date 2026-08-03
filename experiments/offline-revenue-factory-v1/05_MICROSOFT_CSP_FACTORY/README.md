# Microsoft CSP outage SLA-credit evidence desk

This directory is a pointer, not a duplicate — the real, runnable
implementation lives in the product tree to avoid maintaining two
copies of the same code:

- Lane module: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/lanes/msft_csp.py`
- Fixtures: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/msft_csp/{complete,missing_evidence}/`
- Generated example delivery: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/msft_csp/`
- Commercial paperwork drafts: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/templates/commercial/` (fill `[LANE]` = `msft_csp`)
- Reference docs: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/05_lane_reference.md`

## Scope
Incident/service-health timeline reconciliation, deterministic impact-
window overlap calculation, and claim-readiness gate evaluation, using
a synthetic incident timeline, service-health timeline, subscription
metadata, affected-service metadata, and a rule-source placeholder
registry.

## Required input
`incident_timeline.json`, `service_health_timeline.json`,
`subscription_metadata.json`, `affected_services.json`,
`rule_source_registry.json`.

## Mandatory disclaimers (enforced by claim safety, not just written
## here)
Not a claim. Not an eligibility decision. Not a Microsoft
representation. Requires authorized CSP/customer evidence. Requires
current SLA/contract review. Requires partner submission.

## Blocked-conclusion mechanism
`rule_source_current` and `partner_submission_channel_available` are
hard-coded `False` in this offline system, so `execute` always
produces a final `"blocked conclusion"` finding — a positive
eligibility conclusion is structurally unreachable, proven by
`tests/test_lanes_full_pipeline.py`'s `missing_evidence` fixture case
and by dedicated coverage in the lane's own test path.

## Example delivery
Generated from the `complete` fixture: 2 findings, 13 evidence items,
1 human review request, QA 5/5 pass — see
`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/README.md`
for the full cross-lane table and the package's own checksum-verified
zip.
