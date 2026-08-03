# Lead-form, booking-path, and revenue-leak evidence pack

Pointer directory — the real implementation lives in the product tree:

- Lane module: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/lanes/lead_path.py`
- Fixtures: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/lead_path/{healthy_funnel,broken_link_step,form_validation_gaps,missing_confirmation,missing_tracking,high_dropoff_step}/`
- Generated example delivery: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/example_deliveries/lead_path/`
- Commercial paperwork drafts: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/templates/commercial/` (fill `[LANE]` = `lead_path`)
- Reference docs: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/05_lane_reference.md`

## Scope
Funnel step-graph link integrity, form field validation and
label-gap detection, submit-action/confirmation presence, conversion-
tracking gap detection, and step-over-step drop-off percentage against
a supplied synthetic visit log (≥50% flags as a candidate for review,
never a confirmed loss).

## Required input
`funnel_steps.json`, `form_fields.json`; `tracking_config.json` and
`synthetic_funnel_log.json` are optional.

## No live actions
This lane never submits a real form, creates a real booking, or
triggers any live operation — every fixture is synthetic or a local
snapshot.

## Always concludes
`"blocked conclusion"` — this system never quantifies a guaranteed
dollar revenue loss and never certifies a funnel leak-free.

## Example delivery
Generated from the `broken_link_step` fixture: 12 findings, 3 evidence
items, 3 human review requests, QA 4/4 pass.
