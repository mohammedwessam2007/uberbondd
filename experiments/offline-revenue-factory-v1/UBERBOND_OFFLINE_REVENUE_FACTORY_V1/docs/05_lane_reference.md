# Lane reference

One section per lane, summarizing scope, exclusions, and required
input, quoted from each lane module's own `lane_meta()` and
`REQUIRED_FILES`/fixture-format definition — the authoritative source
is always `src/urf/lanes/<lane>.py`, this is a convenience summary.

## msft_csp — Microsoft CSP outage SLA-credit evidence desk
- **Scope:** incident/service-health timeline reconciliation, deterministic impact-window overlap calculation, claim-readiness gate evaluation.
- **Required input:** `incident_timeline.json`, `service_health_timeline.json`, `subscription_metadata.json`, `affected_services.json`, `rule_source_registry.json`.
- **Always concludes:** `blocked conclusion` — eligibility is never asserted; `rule_source_current` and `partner_submission_channel_available` gates are hard-coded `False` in this offline system, so a positive conclusion is structurally unreachable.
- **Fixtures:** `complete`, `missing_evidence`.

## hospital_mrf — Hospital price-transparency MRF integrity pack
- **Scope:** file hashing/size/compression detection, JSON structural-field and duplicate-key checks, update-indicator staleness (365-day threshold), local link-map validation.
- **Required input:** at least one MRF candidate file (JSON, optionally gzip); metadata files are optional.
- **Not a decision lane:** does not end in a single blocked-conclusion finding; instead, each anomaly (duplicate key, missing field, non-object top level, malformed date, stale data) is individually flagged `human_review_required=True` with a matching `human_review_request`. Clean input produces zero human-review requests.
- **Fixtures:** `valid`, `malformed`, `missing_fields`, `stale`, `duplicate_keys`, `compressed`.

## agency_rfp — Agency RFP compliance-matrix backend
- **Scope:** requirement/question/attachment extraction from a self-defined line-based markup, mandatory-requirement and submission-evidence gap detection, source-declared conflict register, amendment reconciliation (due-date supersession, MODIFY/ADD/REMOVE actions).
- **Required input:** `metadata.json` + the RFP document in this lane's own markup format (real PDF/DOCX must be transcribed by a human first — no binary office-format parser exists).
- **Always concludes:** `blocked conclusion` + blocking human_review for the submit/no-bid decision.
- **Fixtures:** `complete`, `amended`, `unanswered_questions`, `conflicting_requirements`, `missing_submission_evidence`, `unparseable_format` (deliberately-invalid-UTF-8 binary, exercises graceful degradation — `unknown` finding + blocking human review, never a crash or fabricated content).

## accessibility — Accessibility acceptance-evidence backend
- **Scope:** automated-scan violation extraction/dedup/impact-severity summary, scan-data freshness (90-day threshold), manual-checklist pass/fail/not-tested tally, page-inventory recording.
- **Required input:** `automated_scan.json`; `manual_checklist.json`/`page_inventory.json` optional.
- **Always concludes:** `blocked conclusion` — never certifies WCAG/ADA/Section 508 conformance — plus a blocking human_review with `required_role="licensed_professional"`.
- **Fixtures:** `clean_pass`, `violations_found`, `partial_manual_review`, `duplicate_findings`, `missing_scan_data`, `stale_scan`.

## lead_path — Lead-form/booking-path revenue-leak evidence pack
- **Scope:** funnel step-graph link integrity, form field validation/label-gap detection, submit-action/confirmation presence, conversion-tracking gap detection, step-over-step drop-off percentage against a supplied visit log (≥50% flags as a candidate, not a confirmed loss).
- **Required input:** `funnel_steps.json`, `form_fields.json`; `tracking_config.json`/`synthetic_funnel_log.json` optional.
- **Always concludes:** `blocked conclusion` — never quantifies a dollar loss, never certifies leak-free.
- **Fixtures:** `healthy_funnel`, `broken_link_step`, `form_validation_gaps`, `missing_confirmation`, `missing_tracking`, `high_dropoff_step`.

## Cross-lane invariant
Every lane must never fabricate. Where a lane cannot determine
something (missing file, unparseable document, no matching timeline
entry), it records an `unknown` finding and — in every observed case
in this codebase — a matching `human_review_request`, rather than
guessing or omitting. `tests/test_lanes_full_pipeline.py` runs the
full pipeline for all 26 lane×fixture combinations and asserts this.
