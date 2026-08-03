# msft_csp — Direct Buyer Report

Report ID: `rpt-example-msft_csp-direct_buyer`  
Run ID: `example-msft_csp`  
Generated: 2026-08-03T00:49:33Z  

## Executive Summary

Synthetic evidence-desk pack for a Microsoft CSP outage SLA-credit review. This pack organizes incident and service-health timeline evidence, computes deterministic impact-window overlaps, and runs a claim-readiness checklist. This output is not a claim. This output is not an eligibility decision. This output is not a Microsoft representation. Authorized CSP/customer evidence is required before any submission. Current SLA/contract review is required before any submission. Partner submission is required; this system does not submit anything.

## Scope

- Synthetic incident and service-health timeline reconciliation.
- Deterministic impact-window overlap calculation.
- Claim-readiness gate evaluation.

## Exclusions

- No live Microsoft, Azure Service Health, or CSP partner system is accessed.
- No SLA credit is claimed, requested, or submitted.
- No current SLA/contract text is fetched or verified.

## Inputs

- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/msft_csp/complete/incident_timeline.json
- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/msft_csp/complete/service_health_timeline.json
- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/msft_csp/complete/subscription_metadata.json
- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/msft_csp/complete/affected_services.json
- /home/user/uberbondd/experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1/fixtures/msft_csp/complete/rule_source_registry.json
- gate:incident_evidence_present
- gate:service_health_evidence_present
- gate:subscription_evidence_present
- gate:affected_service_confirmed
- gate:rule_source_current
- gate:partner_submission_channel_available
- incident:INC-SYN-1001
- partner_responsibility_matrix

## Findings (by ID — see evidence index for detail)

- fnd-example-msft_csp-0001

## Unknowns

_None recorded._

## Blocked Conclusions

- fnd-example-msft_csp-0002

## Human Review Requirements

- hrr-example-msft_csp-0001

## Limitations

- This output is not a claim.
- This output is not an eligibility decision.
- This output is not a Microsoft representation.
- Authorized CSP/customer evidence is required before any submission.
- Current SLA/contract review is required before any submission.
- Partner submission is required; this system does not submit anything.
