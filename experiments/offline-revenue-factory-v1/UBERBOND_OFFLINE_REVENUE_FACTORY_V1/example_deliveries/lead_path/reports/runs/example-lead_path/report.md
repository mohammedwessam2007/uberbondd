# lead_path — Direct Buyer Report

Report ID: `rpt-example-lead_path-direct_buyer`  
Run ID: `example-lead_path`  
Generated: 2026-08-03T00:49:33Z  

## Executive Summary

Lead-form / booking-path revenue-leak evidence pack built from a synthetic funnel step graph, form configuration, optional tracking configuration, and an optional synthetic visit log. This output is not a quantified revenue-loss estimate. This output does not certify the funnel is free of leaks beyond what was checked here. Drop-off percentages are computed from a supplied visit log; they are not live analytics and do not establish real-world traffic volume or causation. A human owner must verify each flagged item against real user behavior before prioritizing a fix.

## Scope

- Funnel step-graph extraction and broken/dangling link detection.
- Lead/booking form field validation and label-gap detection.
- Submit-action and post-submission confirmation presence checking.
- Conversion-tracking configuration completeness checking.
- Deterministic step-over-step drop-off percentage calculation against a supplied visit log.

## Exclusions

- No live crawl, click-through recording, or real analytics export is used.
- No dollar-value revenue-loss figure is calculated or claimed.
- No certification that the funnel is free of leaks beyond what this pack explicitly checked.

## Inputs

- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/lead_path/broken_link_step/funnel_steps.json
- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/lead_path/broken_link_step/form_fields.json
- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/lead_path/broken_link_step/synthetic_funnel_log.json

## Findings (by ID — see evidence index for detail)

- fnd-example-lead_path-0001
- fnd-example-lead_path-0002
- fnd-example-lead_path-0003
- fnd-example-lead_path-0004
- fnd-example-lead_path-0005
- fnd-example-lead_path-0006
- fnd-example-lead_path-0007
- fnd-example-lead_path-0008
- fnd-example-lead_path-0009
- fnd-example-lead_path-0010
- fnd-example-lead_path-0011

## Unknowns

- unk-example-lead_path-0001

## Blocked Conclusions

- fnd-example-lead_path-0012

## Human Review Requirements

- hrr-example-lead_path-0001
- hrr-example-lead_path-0002
- hrr-example-lead_path-0003

## Limitations

- This output is not a quantified revenue-loss estimate.
- This output does not certify the funnel is free of leaks beyond what was checked here.
- Drop-off percentages are computed from a supplied visit log; they are not live analytics and do not establish real-world traffic volume or causation.
- A human owner must verify each flagged item against real user behavior before prioritizing a fix.
