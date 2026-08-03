"""Lane 5: Lead-form / booking-path / revenue-leak evidence pack (mission Phase 7).

Synthetic-only. Inputs are local JSON fixtures describing a funnel's step
graph, a lead/booking form's field configuration, optional conversion-
tracking configuration, and an optional synthetic visit log -- never a
live crawl or real analytics export. This lane never quantifies a dollar
revenue-loss figure and never certifies a funnel "leak-free": it flags
structural and statistical leak *candidates* for a human to prioritize
and verify against real traffic and real business context.
"""
from __future__ import annotations

from pathlib import Path

from ..common.hashing import sha256_file
from ..common.jsonio import load_json_lenient

FIXTURES = {
    "healthy_funnel": "healthy_funnel",
    "broken_link_step": "broken_link_step",
    "form_validation_gaps": "form_validation_gaps",
    "missing_confirmation": "missing_confirmation",
    "missing_tracking": "missing_tracking",
    "high_dropoff_step": "high_dropoff_step",
}

REQUIRED_FILES = ["funnel_steps.json", "form_fields.json"]
OPTIONAL_FILES = ["tracking_config.json", "synthetic_funnel_log.json"]

DROPOFF_FLAG_THRESHOLD_PCT = 50.0

MANDATORY_DISCLAIMERS = [
    "This output is not a quantified revenue-loss estimate.",
    "This output does not certify the funnel is free of leaks beyond what was checked here.",
    "Drop-off percentages are computed from a supplied visit log; they are not live analytics and do not "
    "establish real-world traffic volume or causation.",
    "A human owner must verify each flagged item against real user behavior before prioritizing a fix.",
]


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
    for name in OPTIONAL_FILES:
        if not (fixture_dir / name).exists():
            issues.append({
                "severity": "minor",
                "category": "missing_optional_file",
                "description": f"Optional input file '{name}' is absent from fixture {fixture_dir.name}.",
                "source_path": str(fixture_dir / name),
            })
    return issues


def execute(run_ctx, fixture_dir: Path) -> None:
    leak_issue_count = 0

    steps_path = fixture_dir / "funnel_steps.json"
    steps = []
    if steps_path.exists():
        data = load_json_lenient(steps_path)
        steps = data.get("steps", [])
        ev = run_ctx.add_evidence(
            source_type="synthetic_fixture",
            source_path=str(steps_path),
            source_hash=sha256_file(steps_path),
            data_classification="SYNTHETIC",
            observed_value=data,
            parser="lead_path.funnel_steps_reader",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Synthetic step graph; not a live crawl or click-through recording.",
            prohibited_interpretation="A working link between steps does not guarantee the page renders "
            "correctly or converts.",
            human_review_required=False,
        )
        leak_issue_count += _check_step_graph(run_ctx, steps_path, steps, ev.evidence_id)
    else:
        run_ctx.add_unknown(
            question="What does the funnel's step graph look like?",
            reason=f"funnel_steps.json absent from fixture {fixture_dir.name}.",
            blocking=True,
        )

    fields_path = fixture_dir / "form_fields.json"
    if fields_path.exists():
        form = load_json_lenient(fields_path)
        ev = run_ctx.add_evidence(
            source_type="synthetic_fixture",
            source_path=str(fields_path),
            source_hash=sha256_file(fields_path),
            data_classification="SYNTHETIC",
            observed_value=form,
            parser="lead_path.form_fields_reader",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Synthetic form configuration; not a live form submission test.",
            prohibited_interpretation="A configured submit action does not guarantee the backend processes "
            "submissions correctly.",
            human_review_required=False,
        )
        leak_issue_count += _check_form(run_ctx, fields_path, form, ev.evidence_id)
    else:
        run_ctx.add_unknown(
            question="What fields and validation does the lead/booking form use?",
            reason=f"form_fields.json absent from fixture {fixture_dir.name}.",
            blocking=True,
        )

    tracking_path = fixture_dir / "tracking_config.json"
    if tracking_path.exists():
        tracking = load_json_lenient(tracking_path)
        ev = run_ctx.add_evidence(
            source_type="synthetic_fixture",
            source_path=str(tracking_path),
            source_hash=sha256_file(tracking_path),
            data_classification="SYNTHETIC",
            observed_value=tracking,
            parser="lead_path.tracking_config_reader",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Synthetic tracking configuration; not a live tag-firing verification.",
            prohibited_interpretation="A configured pixel does not guarantee it fires correctly in production.",
            human_review_required=False,
        )
        leak_issue_count += _check_tracking(run_ctx, tracking_path, tracking, ev.evidence_id)
    else:
        run_ctx.add_unknown(
            question="Is conversion tracking configured for this funnel?",
            reason=f"tracking_config.json absent from fixture {fixture_dir.name}; conversion impact of any "
            "flagged leak cannot be measured without it.",
            blocking=False,
        )

    log_path = fixture_dir / "synthetic_funnel_log.json"
    if log_path.exists():
        log = load_json_lenient(log_path)
        ev = run_ctx.add_evidence(
            source_type="synthetic_fixture",
            source_path=str(log_path),
            source_hash=sha256_file(log_path),
            data_classification="SYNTHETIC",
            observed_value=log,
            parser="lead_path.funnel_log_reader",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Synthetic visit counts; not a live analytics export.",
            prohibited_interpretation="Do not treat these counts as real traffic volume.",
            human_review_required=False,
        )
        leak_issue_count += _check_dropoff(run_ctx, log_path, log, steps, ev.evidence_id)

    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"Revenue-leak candidate count for this run: {leak_issue_count} flagged item(s) "
        "(structural + statistical, critical/serious severity only).",
        evidence_refs=[],
        confidence="high",
        human_review_required=leak_issue_count > 0,
    )

    run_ctx.add_finding(
        label="blocked conclusion",
        statement="Overall revenue-leak conclusion is BLOCKED: this pack flags structural and statistical leak "
        "candidates, but does not quantify dollar impact or certify the funnel is leak-free beyond what was "
        "checked. " + " ".join(MANDATORY_DISCLAIMERS),
        evidence_refs=[],
        confidence="unknown",
        human_review_required=True,
        blocked_reason="Dollar-impact quantification and full leak-free certification require real traffic "
        "data and business context this offline system does not have.",
    )
    run_ctx.add_human_review(
        reason="A qualified owner must verify each flagged leak candidate against real user behavior and "
        "prioritize fixes; this system does not do so itself.",
        required_role="owner",
        blocking=True,
    )


def _check_step_graph(run_ctx, steps_path: Path, steps: list, evidence_id: str) -> int:
    leak_count = 0
    step_ids = {s.get("step_id") for s in steps}
    for step in steps:
        step_id = step.get("step_id", "unknown")
        name = step.get("name", "")
        next_id = step.get("expected_next_step_id")
        working = step.get("has_working_link_to_next")
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"Funnel step {step_id} ({name}, type={step.get('type')}) extracted; "
            f"expected_next_step_id={next_id!r}, has_working_link_to_next={working!r}.",
            evidence_refs=[evidence_id],
            confidence="high",
            human_review_required=False,
        )
        if next_id is not None and next_id not in step_ids:
            leak_count += 1
            run_ctx.add_issue(
                severity="serious", category="dangling_funnel_reference",
                description=f"Step {step_id} expects next step {next_id!r}, which is not present in the "
                "step graph.",
                source_path=str(steps_path),
            )
        if next_id is not None and working is False:
            leak_count += 1
            run_ctx.add_issue(
                severity="critical", category="broken_funnel_link",
                description=f"Step {step_id} ({name}) has a broken link to its expected next step "
                f"{next_id!r}; this is a hard dead end in the funnel.",
                source_path=str(steps_path),
            )
            run_ctx.add_human_review(
                reason=f"Step {step_id} ({name}) is a dead end; confirm and fix the link before relying on "
                "this funnel for lead capture.",
                required_role="owner",
                blocking=True,
            )
    return leak_count


def _check_form(run_ctx, fields_path: Path, form: dict, evidence_id: str) -> int:
    leak_count = 0
    fields = form.get("fields", [])
    gap_fields = []
    for field in fields:
        name = field.get("name", "unknown")
        required = field.get("required", False)
        has_validation = field.get("has_validation", False)
        has_label = field.get("has_label", False)
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"Form field {name!r} (type={field.get('type')}): required={required}, "
            f"has_validation={has_validation}, has_label={has_label}.",
            evidence_refs=[evidence_id],
            confidence="high",
            human_review_required=False,
        )
        if required and (not has_validation or not has_label):
            gap_fields.append(name)
            run_ctx.add_issue(
                severity="moderate", category="form_field_gap",
                description=f"Required field {name!r} is missing validation and/or a label "
                f"(has_validation={has_validation}, has_label={has_label}); this raises abandonment risk.",
                source_path=str(fields_path),
            )

    if not form.get("submit_action_configured", False):
        leak_count += 1
        run_ctx.add_issue(
            severity="critical", category="form_submit_not_configured",
            description=f"Form {form.get('form_id', 'unknown')} has no configured submit action; "
            "submissions may be silently lost.",
            source_path=str(fields_path),
        )
        run_ctx.add_human_review(
            reason="Form submit action is not configured; confirm whether submissions are actually captured "
            "anywhere before treating this form as functional.",
            required_role="owner",
            blocking=True,
        )

    if not form.get("confirmation_present", False):
        leak_count += 1
        run_ctx.add_issue(
            severity="critical", category="missing_confirmation_page",
            description=f"Form {form.get('form_id', 'unknown')} has no confirmation step after submission; "
            "users cannot tell whether their submission succeeded, which commonly causes duplicate or "
            "abandoned submissions.",
            source_path=str(fields_path),
        )
        run_ctx.add_human_review(
            reason="No post-submission confirmation exists; confirm this is intentional or add one before "
            "relying on this form to capture leads.",
            required_role="owner",
            blocking=True,
        )

    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"Form field gap summary: {len(gap_fields)}/{len(fields)} required field(s) missing "
        f"validation and/or a label.",
        evidence_refs=[],
        confidence="high",
        human_review_required=bool(gap_fields),
    )
    return leak_count


def _check_tracking(run_ctx, tracking_path: Path, tracking: dict, evidence_id: str) -> int:
    leak_count = 0
    pixel_present = tracking.get("conversion_pixel_present", False)
    goal_configured = tracking.get("goal_configured", False)
    run_ctx.add_finding(
        label="parsed fact",
        statement=f"Conversion tracking: conversion_pixel_present={pixel_present}, "
        f"goal_configured={goal_configured}.",
        evidence_refs=[evidence_id],
        confidence="high",
        human_review_required=not (pixel_present and goal_configured),
    )
    if not pixel_present or not goal_configured:
        run_ctx.add_issue(
            severity="moderate", category="conversion_tracking_gap",
            description="Conversion tracking is incomplete; leak candidates flagged elsewhere in this pack "
            "cannot be tied to a measured conversion-rate impact until tracking is fixed.",
            source_path=str(tracking_path),
        )
    return leak_count


def _check_dropoff(run_ctx, log_path: Path, log: dict, steps: list, evidence_id: str) -> int:
    leak_count = 0
    visits = log.get("visits_by_step", {})
    ordered_ids = [s.get("step_id") for s in steps if s.get("step_id") in visits]
    for prev_id, cur_id in zip(ordered_ids, ordered_ids[1:]):
        prev_visits = visits.get(prev_id, 0)
        cur_visits = visits.get(cur_id, 0)
        if prev_visits <= 0:
            continue
        dropoff_pct = round((prev_visits - cur_visits) / prev_visits * 100, 1)
        flagged = dropoff_pct >= DROPOFF_FLAG_THRESHOLD_PCT
        run_ctx.add_finding(
            label="deterministic calculation",
            statement=f"Step-over-step drop-off {prev_id}->{cur_id}: {prev_visits} -> {cur_visits} visit(s) "
            f"({dropoff_pct}% drop-off, {'flagged as a leak candidate' if flagged else 'below threshold'}).",
            evidence_refs=[evidence_id],
            confidence="high",
            human_review_required=flagged,
        )
        if flagged:
            leak_count += 1
            run_ctx.add_issue(
                severity="serious", category="high_dropoff_step",
                description=f"Step {cur_id} shows a {dropoff_pct}% drop-off from step {prev_id} in the "
                f"supplied visit log, at or above the {DROPOFF_FLAG_THRESHOLD_PCT}% flag threshold.",
                source_path=str(log_path),
            )
            run_ctx.add_human_review(
                reason=f"Investigate step {cur_id} for a possible revenue leak; drop-off in a synthetic log "
                "is only a candidate signal, not confirmed real-world behavior.",
                required_role="owner",
                blocking=False,
            )
    return leak_count


def qa_checks(run_ctx) -> list[dict]:
    findings = run_ctx.all_findings()
    forbidden_terms = ("guaranteed revenue", "certified leak-free", "will recover $", "confirmed loss of $")
    violations = [f for f in findings if any(t in f["statement"].lower() for t in forbidden_terms)]
    return [{
        "check_id": "qa-no-revenue-quantification-claim",
        "description": "No finding asserts a guaranteed dollar recovery or certifies the funnel leak-free",
        "status": "pass" if not violations else "fail",
        "detail": None if not violations else f"{len(violations)} suspect finding(s)",
    }]


def lane_meta() -> dict:
    return {
        "executive_summary": (
            "Lead-form / booking-path revenue-leak evidence pack built from a synthetic funnel step graph, "
            "form configuration, optional tracking configuration, and an optional synthetic visit log. "
            + " ".join(MANDATORY_DISCLAIMERS)
        ),
        "scope": [
            "Funnel step-graph extraction and broken/dangling link detection.",
            "Lead/booking form field validation and label-gap detection.",
            "Submit-action and post-submission confirmation presence checking.",
            "Conversion-tracking configuration completeness checking.",
            "Deterministic step-over-step drop-off percentage calculation against a supplied visit log.",
        ],
        "exclusions": [
            "No live crawl, click-through recording, or real analytics export is used.",
            "No dollar-value revenue-loss figure is calculated or claimed.",
            "No certification that the funnel is free of leaks beyond what this pack explicitly checked.",
        ],
        "methods": [
            "Step-graph link and reference-integrity checking.",
            "Field-level validation/label completeness checking against a required-field list.",
            "Step-over-step visit drop-off percentage calculation with a fixed flag threshold.",
        ],
        "mandatory_disclaimers": MANDATORY_DISCLAIMERS,
        "buyer_role": "marketing/growth owner, site owner, or white-label agency partner",
    }
