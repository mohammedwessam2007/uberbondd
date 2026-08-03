"""Shared helpers every lane module uses.

Each lane module implements four functions with a common signature:

    FIXTURES: dict[str, str]                     # fixture_id -> relative dir under fixtures/<lane>/
    validate_input(fixture_dir: Path) -> list[dict]      # list of Issue-shaped dicts (not yet persisted)
    execute(run_ctx: RunContext, fixture_dir: Path) -> None   # populates evidence/findings/unknowns/human_review
    qa_checks(run_ctx: RunContext) -> list[dict]         # list of {check_id, description, status, detail}
    lane_meta() -> dict                                   # title, scope, exclusions, methods, mandatory_disclaimers, buyer_role

`build_report` and `run_qa` below consume that common shape so the CLI
does not need lane-specific branches.
"""
from __future__ import annotations

from ..common.hashing import sha256_json
from ..common.models import DeliveryAcceptance, QAResult, Report
from ..common.runstore import RunContext, now_iso
from ..common.validation import validate_record_or_raise


def build_report(run_ctx: RunContext, lane_meta: dict, template: str) -> dict:
    findings = run_ctx.all_findings()
    unknowns = run_ctx.all_unknowns()
    human_reviews = run_ctx.all_human_reviews()
    evidence = run_ctx.all_evidence()

    blocked = [f["finding_id"] for f in findings if f["label"] == "blocked conclusion"]
    non_blocked_findings = [f["finding_id"] for f in findings if f["label"] != "blocked conclusion"]

    report = Report(
        report_id=f"rpt-{run_ctx.run_id}-{template}",
        run_id=run_ctx.run_id,
        lane=run_ctx.lane,
        template=template,
        executive_summary=lane_meta["executive_summary"],
        scope=lane_meta["scope"],
        exclusions=lane_meta["exclusions"],
        inputs=[e["source_path"] for e in evidence],
        methods=lane_meta["methods"],
        findings=non_blocked_findings,
        evidence_refs=[e["evidence_id"] for e in evidence],
        unknowns=[u["unknown_id"] for u in unknowns],
        blocked_conclusions=blocked,
        human_review_requirements=[h["request_id"] for h in human_reviews],
        limitations=lane_meta["mandatory_disclaimers"],
        delivery_acceptance_ref=None,
        run_manifest_ref=run_ctx.run_id,
        checksum=None,
        generated_at=now_iso(),
    ).to_dict()
    report["checksum"] = sha256_json({k: v for k, v in report.items() if k != "checksum"})
    validate_record_or_raise("report", report)
    return report


def run_qa(run_ctx: RunContext, extra_checks: list) -> dict:
    checks = []

    findings = run_ctx.all_findings()
    evidence_ids = {e["evidence_id"] for e in run_ctx.all_evidence()}
    dangling = [f["finding_id"] for f in findings for ref in f["evidence_refs"] if ref not in evidence_ids]
    checks.append({
        "check_id": "qa-evidence-refs-resolve",
        "description": "Every finding's evidence_refs resolve to an existing evidence item",
        "status": "pass" if not dangling else "fail",
        "detail": None if not dangling else f"dangling refs in findings: {dangling}",
    })

    labeled_ok = all(f["label"] in {
        "observed fact", "parsed fact", "deterministic calculation", "source-derived rule",
        "model interpretation", "assumption", "unknown", "blocked conclusion", "human-review requirement",
    } for f in findings)
    checks.append({
        "check_id": "qa-finding-labels-valid",
        "description": "Every finding carries one of the nine required labels",
        "status": "pass" if labeled_ok else "fail",
        "detail": None,
    })

    human_review_consistent = all(
        (f["label"] != "human-review requirement") or f["human_review_required"]
        for f in findings
    )
    checks.append({
        "check_id": "qa-human-review-consistency",
        "description": "Findings labeled 'human-review requirement' also set human_review_required=true",
        "status": "pass" if human_review_consistent else "fail",
        "detail": None,
    })

    checks.extend(extra_checks)

    passed = sum(1 for c in checks if c["status"] == "pass")
    failed = sum(1 for c in checks if c["status"] == "fail")
    qa = QAResult(
        qa_id=f"qa-{run_ctx.run_id}",
        run_id=run_ctx.run_id,
        lane=run_ctx.lane,
        checks=checks,
        passed=passed,
        failed=failed,
        overall_status="pass" if failed == 0 else "fail",
        evaluated_at=now_iso(),
    )
    run_ctx.save_qa(qa)
    return qa.to_dict()


def build_delivery_acceptance(run_ctx: RunContext, buyer_role: str, criteria: list) -> dict:
    acc = DeliveryAcceptance(
        acceptance_id=f"acc-{run_ctx.run_id}",
        run_id=run_ctx.run_id,
        lane=run_ctx.lane,
        buyer_role=buyer_role,
        acceptance_criteria=criteria,
        signed=False,
        signed_at=None,
        notes="Template acceptance form; requires explicit human signature before it is valid.",
    ).to_dict()
    validate_record_or_raise("delivery_acceptance", acc)
    return acc
