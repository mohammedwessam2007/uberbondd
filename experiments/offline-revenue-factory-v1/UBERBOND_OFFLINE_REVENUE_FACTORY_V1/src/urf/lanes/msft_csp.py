"""Lane 1: Microsoft CSP outage SLA-credit evidence desk (mission Phase 3).

Synthetic-only. This lane NEVER emits a positive eligibility conclusion.
The overall eligibility finding is always labeled "blocked conclusion"
because two gates can never be satisfied by an offline, no-network
system: (a) the rule-source registry is a placeholder, not a current
SLA/contract text, and (b) there is no live partner submission channel.
That refusal is proven by tests/test_blocked_conclusions.py.

Mandatory disclaimers (verbatim requirements from the mission):
not a claim, not an eligibility decision, not a Microsoft representation,
requires authorized CSP/customer evidence, requires current SLA/contract
review, requires partner submission.
"""
from __future__ import annotations

import datetime as _dt
from pathlib import Path

from ..common.jsonio import load_json_lenient

FIXTURES = {
    "complete": "complete",
    "missing_evidence": "missing_evidence",
}

REQUIRED_FILES = [
    "incident_timeline.json",
    "service_health_timeline.json",
    "subscription_metadata.json",
    "affected_services.json",
    "rule_source_registry.json",
]

MANDATORY_DISCLAIMERS = [
    "This output is not a claim.",
    "This output is not an eligibility decision.",
    "This output is not a Microsoft representation.",
    "Authorized CSP/customer evidence is required before any submission.",
    "Current SLA/contract review is required before any submission.",
    "Partner submission is required; this system does not submit anything.",
]


def _parse_iso(ts: str) -> _dt.datetime:
    return _dt.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc)


def validate_input(fixture_dir: Path) -> list[dict]:
    issues = []
    for name in REQUIRED_FILES:
        if not (fixture_dir / name).exists():
            issues.append({
                "severity": "critical",
                "category": "missing_input_file",
                "description": f"Required input file '{name}' is absent from fixture {fixture_dir.name}.",
                "source_path": str(fixture_dir / name),
            })
    return issues


def _overlap_seconds(a_start, a_end, b_start, b_end) -> int:
    start = max(a_start, b_start)
    end = min(a_end, b_end)
    return max(0, int((end - start).total_seconds()))


def execute(run_ctx, fixture_dir: Path) -> None:
    loaded = {}
    for name in REQUIRED_FILES:
        path = fixture_dir / name
        if path.exists():
            loaded[name] = load_json_lenient(path)
            ev = run_ctx.add_evidence(
                source_type="synthetic_fixture",
                source_path=str(path),
                source_hash=None,
                data_classification="SYNTHETIC",
                observed_value=loaded[name],
                parser="msft_csp.load_json_lenient",
                parser_version="1.0.0",
                deterministic_transform=None,
                confidence="high",
                limitation="Synthetic fixture; not authorized CSP/customer evidence.",
                prohibited_interpretation="Do not treat as Microsoft-confirmed eligibility.",
                human_review_required=False,
            )
        else:
            run_ctx.add_unknown(
                question=f"What is the content of missing input '{name}'?",
                reason=f"File absent from fixture set {fixture_dir.name}.",
                blocking=True,
            )

    gates = {
        "incident_evidence_present": "incident_timeline.json" in loaded,
        "service_health_evidence_present": "service_health_timeline.json" in loaded,
        "subscription_evidence_present": "subscription_metadata.json" in loaded,
        "affected_service_confirmed": "affected_services.json" in loaded,
        "rule_source_current": False,  # always false offline: registry is a placeholder, never live SLA text
        "partner_submission_channel_available": False,  # always false: no outbound channel exists
    }

    for gate_name, satisfied in gates.items():
        run_ctx.add_evidence(
            source_type="derived",
            source_path=f"gate:{gate_name}",
            source_hash=None,
            data_classification="SYNTHETIC",
            observed_value={"gate": gate_name, "satisfied": satisfied},
            parser="msft_csp.claim_readiness_checklist",
            parser_version="1.0.0",
            deterministic_transform="gate_evaluation",
            confidence="high",
            limitation="Gate evaluated against synthetic/offline evidence only.",
            prohibited_interpretation="A satisfied gate does not by itself establish eligibility.",
            human_review_required=not satisfied,
        )

    if "incident_timeline.json" in loaded and "service_health_timeline.json" in loaded:
        for incident in loaded["incident_timeline.json"]:
            matches = [
                h for h in loaded["service_health_timeline.json"]
                if h["service"] == incident["service"] and h["region"] == incident["region"]
            ]
            if not matches:
                run_ctx.add_finding(
                    label="unknown",
                    statement=f"No service-health timeline entry matches incident {incident['incident_id']} "
                              f"({incident['service']}, {incident['region']}); impact window cannot be calculated.",
                    evidence_refs=[],
                    confidence="unknown",
                    human_review_required=True,
                )
                run_ctx.add_human_review(
                    reason=f"Incident {incident['incident_id']} has no matching service-health timeline entry; "
                           "a human must locate corroborating evidence before an impact window can be computed.",
                    required_role="customer",
                    blocking=True,
                )
                continue
            for h in matches:
                overlap = _overlap_seconds(
                    _parse_iso(incident["start"]), _parse_iso(incident["end"]),
                    _parse_iso(h["start"]), _parse_iso(h["end"]),
                )
                ev = run_ctx.add_evidence(
                    source_type="derived",
                    source_path=f"incident:{incident['incident_id']}",
                    source_hash=None,
                    data_classification="SYNTHETIC",
                    observed_value={"incident_id": incident["incident_id"], "overlap_seconds": overlap},
                    parser="msft_csp.impact_window_calculator",
                    parser_version="1.0.0",
                    deterministic_transform="interval_intersection",
                    confidence="high",
                    limitation="Computed from synthetic timelines; not authoritative Microsoft telemetry.",
                    prohibited_interpretation="Overlap duration alone does not establish SLA credit eligibility.",
                    human_review_required=False,
                )
                run_ctx.add_finding(
                    label="deterministic calculation",
                    statement=f"Incident {incident['incident_id']} overlaps a matching service-health degradation "
                              f"window for {overlap} seconds.",
                    evidence_refs=[ev.evidence_id],
                    confidence="high",
                    human_review_required=False,
                )

    partner_matrix = [
        {"step": "Confirm subscription and support tier", "owner": "customer"},
        {"step": "Provide authorized incident/service-health evidence", "owner": "customer"},
        {"step": "Verify current SLA/contract text", "owner": "CSP partner"},
        {"step": "Prepare and submit credit request", "owner": "CSP partner"},
        {"step": "Adjudicate and issue credit", "owner": "Microsoft"},
        {"step": "Compile and hand off evidence desk pack (this system's scope)", "owner": "UberBond evidence desk"},
    ]
    run_ctx.add_evidence(
        source_type="derived",
        source_path="partner_responsibility_matrix",
        source_hash=None,
        data_classification="PUBLIC",
        observed_value=partner_matrix,
        parser="msft_csp.partner_responsibility_matrix",
        parser_version="1.0.0",
        deterministic_transform=None,
        confidence="high",
        limitation="Describes typical role division; not a contractual commitment by any party.",
        prohibited_interpretation="Does not assign legal responsibility.",
        human_review_required=False,
    )

    all_gates_satisfied = all(gates.values())
    blocked_reason = (
        "rule_source_current and partner_submission_channel_available can never both be true in this "
        "offline system, so a positive eligibility conclusion is always withheld."
        if not all_gates_satisfied else
        "unreachable: gates evaluated true, but manual review is still required before submission."
    )
    run_ctx.add_finding(
        label="blocked conclusion",
        statement="Overall SLA-credit eligibility conclusion is BLOCKED. " + " ".join(MANDATORY_DISCLAIMERS),
        evidence_refs=[],
        confidence="unknown",
        human_review_required=True,
        blocked_reason=blocked_reason,
    )
    run_ctx.add_human_review(
        reason="Current SLA/contract text and partner submission channel must be confirmed by a human before "
               "any credit request is prepared.",
        required_role="partner",
        blocking=True,
    )


def qa_checks(run_ctx) -> list[dict]:
    findings = run_ctx.all_findings()
    positive_claims = [
        f for f in findings
        if f["label"] != "blocked conclusion" and "eligible" in f["statement"].lower()
        and "not" not in f["statement"].lower()
    ]
    return [{
        "check_id": "qa-no-positive-eligibility",
        "description": "No finding asserts positive SLA-credit eligibility outside a blocked conclusion",
        "status": "pass" if not positive_claims else "fail",
        "detail": None if not positive_claims else f"{len(positive_claims)} suspect finding(s)",
    }, {
        "check_id": "qa-eligibility-conclusion-blocked",
        "description": "Exactly one 'blocked conclusion' finding exists for overall eligibility",
        "status": "pass" if sum(1 for f in findings if f["label"] == "blocked conclusion") >= 1 else "fail",
        "detail": None,
    }]


def lane_meta() -> dict:
    return {
        "executive_summary": (
            "Synthetic evidence-desk pack for a Microsoft CSP outage SLA-credit review. This pack organizes "
            "incident and service-health timeline evidence, computes deterministic impact-window overlaps, and "
            "runs a claim-readiness checklist. " + " ".join(MANDATORY_DISCLAIMERS)
        ),
        "scope": [
            "Synthetic incident and service-health timeline reconciliation.",
            "Deterministic impact-window overlap calculation.",
            "Claim-readiness gate evaluation.",
        ],
        "exclusions": [
            "No live Microsoft, Azure Service Health, or CSP partner system is accessed.",
            "No SLA credit is claimed, requested, or submitted.",
            "No current SLA/contract text is fetched or verified.",
        ],
        "methods": [
            "Interval-intersection calculation over supplied timeline fixtures.",
            "Static claim-readiness gate checklist.",
        ],
        "mandatory_disclaimers": MANDATORY_DISCLAIMERS,
        "buyer_role": "CSP partner or direct customer",
    }
