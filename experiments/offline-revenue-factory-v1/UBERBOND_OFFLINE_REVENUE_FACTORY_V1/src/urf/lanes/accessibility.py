"""Lane 4: Accessibility acceptance-evidence backend (mission Phase 6).

Synthetic-only. Inputs are local JSON fixtures shaped like the output of
an automated accessibility scanner plus an optional manual-audit
checklist -- never a live crawl of any real site. This lane never
certifies WCAG conformance, ADA/Section 508 legal compliance, or that a
site is fully accessible: an automated scan covers only a subset of
WCAG success criteria, and a sampled manual checklist is not a full
audit across every page and assistive-technology combination. Every
finding says so explicitly, and QA checks enforce it.
"""
from __future__ import annotations

import datetime as _dt
import re
from pathlib import Path

from ..common.hashing import sha256_file
from ..common.jsonio import load_json_lenient

FIXTURES = {
    "clean_pass": "clean_pass",
    "violations_found": "violations_found",
    "partial_manual_review": "partial_manual_review",
    "duplicate_findings": "duplicate_findings",
    "missing_scan_data": "missing_scan_data",
    "stale_scan": "stale_scan",
}

REQUIRED_FILES = ["automated_scan.json"]
OPTIONAL_FILES = ["manual_checklist.json", "page_inventory.json"]

STALE_THRESHOLD_DAYS = 90

MANDATORY_DISCLAIMERS = [
    "This output is not a WCAG conformance certification.",
    "This output is not an ADA, Section 508, or other legal accessibility compliance determination.",
    "Automated scanning covers only a subset of WCAG success criteria and cannot detect most usability "
    "or assistive-technology issues.",
    "A sampled manual checklist is not a full audit across every page, component state, and assistive "
    "technology combination.",
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
    scan_path = fixture_dir / "automated_scan.json"
    scan = None
    if scan_path.exists():
        scan = load_json_lenient(scan_path)
        digest = sha256_file(scan_path)
        scan_ev = run_ctx.add_evidence(
            source_type="synthetic_fixture",
            source_path=str(scan_path),
            source_hash=digest,
            data_classification="SYNTHETIC",
            observed_value={"tool": scan.get("tool"), "tool_version": scan.get("tool_version"),
                             "scanned_at": scan.get("scanned_at"), "url": scan.get("url"),
                             "violation_count_raw": len(scan.get("violations", []))},
            parser="accessibility.scan_reader",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Synthetic scanner output; not a live automated-scan run against a real site.",
            prohibited_interpretation="Absence of a violation does not mean the criterion is satisfied; the "
            "scanner only detects a subset of WCAG failure modes.",
            human_review_required=False,
        )
        _process_scan(run_ctx, scan_path, scan, scan_ev.evidence_id)
    else:
        run_ctx.add_unknown(
            question="What violations, if any, does an automated accessibility scan of this page find?",
            reason=f"automated_scan.json absent from fixture {fixture_dir.name}.",
            blocking=True,
        )
        run_ctx.add_human_review(
            reason="No automated scan data is available; a human must run or supply a scan before any "
            "acceptance-evidence pack can be considered reasonably complete.",
            required_role="owner",
            blocking=True,
        )

    checklist_path = fixture_dir / "manual_checklist.json"
    if checklist_path.exists():
        checklist = load_json_lenient(checklist_path)
        digest = sha256_file(checklist_path)
        checklist_ev = run_ctx.add_evidence(
            source_type="synthetic_fixture",
            source_path=str(checklist_path),
            source_hash=digest,
            data_classification="SYNTHETIC",
            observed_value={"auditor": checklist.get("auditor"), "audited_at": checklist.get("audited_at"),
                             "item_count": len(checklist.get("items", []))},
            parser="accessibility.checklist_reader",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Synthetic manual-checklist fixture; not a real auditor's work product.",
            prohibited_interpretation="A 'pass' result reflects one auditor's sampled check, not exhaustive "
            "assistive-technology testing.",
            human_review_required=False,
        )
        _process_checklist(run_ctx, checklist_path, checklist, checklist_ev.evidence_id)
    else:
        run_ctx.add_unknown(
            question="Has a human auditor manually reviewed the criteria an automated scanner cannot check?",
            reason=f"manual_checklist.json absent from fixture {fixture_dir.name}.",
            blocking=False,
        )

    inventory_path = fixture_dir / "page_inventory.json"
    if inventory_path.exists():
        inventory = load_json_lenient(inventory_path)
        pages = inventory.get("pages", [])
        run_ctx.add_evidence(
            source_type="synthetic_fixture",
            source_path=str(inventory_path),
            source_hash=sha256_file(inventory_path),
            data_classification="SYNTHETIC",
            observed_value=inventory,
            parser="accessibility.page_inventory_reader",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Synthetic page inventory; not a verified full site map.",
            prohibited_interpretation="Coverage of listed pages does not imply coverage of the entire site.",
            human_review_required=False,
        )
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"Page inventory lists {len(pages)} page(s) in scope for this evidence pack.",
            evidence_refs=[],
            confidence="high",
            human_review_required=False,
        )

    run_ctx.add_finding(
        label="blocked conclusion",
        statement="Overall WCAG conformance/acceptance conclusion is BLOCKED: automated scan results and any "
        "sampled manual checklist are organized here as evidence, but full conformance requires manual testing "
        "of every page/state with real assistive technologies, which this offline system does not perform. "
        + " ".join(MANDATORY_DISCLAIMERS),
        evidence_refs=[],
        confidence="unknown",
        human_review_required=True,
        blocked_reason="Full WCAG conformance determination requires manual assistive-technology testing "
        "beyond automated scanning and a sampled checklist.",
    )
    run_ctx.add_human_review(
        reason="A qualified accessibility reviewer must confirm scope, remediation status, and any conformance "
        "claim before this evidence pack is used in a buyer- or partner-facing acceptance decision.",
        required_role="licensed_professional",
        blocking=True,
    )


def _process_scan(run_ctx, scan_path: Path, scan: dict, scan_evidence_id: str) -> None:
    scanned_at_raw = scan.get("scanned_at")
    if scanned_at_raw:
        try:
            scanned_at = _parse_iso(scanned_at_raw)
            age_days = (_dt.datetime.now(_dt.timezone.utc) - scanned_at).days
            stale = age_days > STALE_THRESHOLD_DAYS
            run_ctx.add_finding(
                label="deterministic calculation",
                statement=f"Automated scan is {age_days} day(s) old "
                f"({'stale' if stale else 'within'} the {STALE_THRESHOLD_DAYS}-day freshness threshold).",
                evidence_refs=[scan_evidence_id],
                confidence="high",
                human_review_required=stale,
            )
            if stale:
                run_ctx.add_issue(
                    severity="moderate", category="stale_scan_data",
                    description=f"automated_scan.json scanned_at={scanned_at_raw!r} is older than "
                    f"{STALE_THRESHOLD_DAYS} days.",
                    source_path=str(scan_path),
                )
                run_ctx.add_human_review(
                    reason="Automated scan data is older than the freshness threshold; re-scan before relying "
                    "on it for any current acceptance decision.",
                    required_role="owner",
                    blocking=False,
                )
        except (ValueError, TypeError):
            run_ctx.add_finding(
                label="parsed fact",
                statement=f"automated_scan.json field scanned_at={scanned_at_raw!r} is not in ISO-8601 UTC "
                "format expected by this parser.",
                evidence_refs=[scan_evidence_id],
                confidence="high",
                human_review_required=True,
            )

    raw_violations = scan.get("violations", [])
    seen = {}
    duplicate_count = 0
    for v in raw_violations:
        selector = None
        nodes = v.get("nodes", [])
        if nodes:
            selector = nodes[0].get("selector")
        key = (v.get("id"), selector)
        if key in seen:
            duplicate_count += 1
            continue
        seen[key] = v

    if duplicate_count:
        run_ctx.add_issue(
            severity="minor", category="duplicate_violation_entry",
            description=f"{duplicate_count} duplicate violation entrie(s) collapsed to a single unique finding "
            "per (rule id, selector) pair.",
            source_path=str(scan_path),
        )

    impact_counts = {"critical": 0, "serious": 0, "moderate": 0, "minor": 0}
    for v in seen.values():
        v_id = v.get("id", "unknown-rule")
        wcag_sc = v.get("wcag_sc", "unknown")
        impact = v.get("impact", "unknown")
        selector = v.get("nodes", [{}])[0].get("selector", "unknown") if v.get("nodes") else "unknown"
        if impact in impact_counts:
            impact_counts[impact] += 1
        v_ev = run_ctx.add_evidence(
            source_type="derived",
            source_path=f"{scan_path}#{v_id}:{selector}",
            source_hash=None,
            data_classification="SYNTHETIC",
            observed_value=v,
            parser="accessibility.violation_extractor",
            parser_version="1.0.0",
            deterministic_transform="deduplicate_by_rule_and_selector",
            confidence="high",
            limitation="One automated-scan finding; does not by itself establish severity to end users.",
            prohibited_interpretation="Absence from this list does not mean the page has no other issues.",
            human_review_required=False,
        )
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"Automated violation {v_id} (WCAG {wcag_sc}, impact={impact}) at selector "
            f"{selector!r}: {v.get('help', '')}",
            evidence_refs=[v_ev.evidence_id],
            confidence="high",
            human_review_required=False,
        )
        run_ctx.add_issue(
            severity={"critical": "critical", "serious": "serious", "moderate": "moderate",
                      "minor": "minor"}.get(impact, "moderate"),
            category="automated_accessibility_violation",
            description=f"{v_id} (WCAG {wcag_sc}) at {selector!r}: {v.get('help', '')}",
            source_path=str(scan_path),
        )

    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"Automated scan violation summary: {impact_counts['critical']} critical, "
        f"{impact_counts['serious']} serious, {impact_counts['moderate']} moderate, "
        f"{impact_counts['minor']} minor ({len(seen)} unique violation(s), "
        f"{len(raw_violations)} raw entrie(s) before dedup).",
        evidence_refs=[],
        confidence="high",
        human_review_required=bool(impact_counts["critical"] or impact_counts["serious"]),
    )


def _process_checklist(run_ctx, checklist_path: Path, checklist: dict, checklist_evidence_id: str) -> None:
    items = checklist.get("items", [])
    result_counts = {"pass": 0, "fail": 0, "not_tested": 0}
    for item in items:
        sc = item.get("wcag_sc", "unknown")
        result = item.get("result", "unknown")
        title = item.get("title", "")
        if result in result_counts:
            result_counts[result] += 1
        item_ev = run_ctx.add_evidence(
            source_type="derived",
            source_path=f"{checklist_path}#{sc}",
            source_hash=None,
            data_classification="SYNTHETIC",
            observed_value=item,
            parser="accessibility.checklist_item_extractor",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="One auditor's sampled manual check; not exhaustive testing.",
            prohibited_interpretation="A 'pass' result does not certify the criterion across every page/state.",
            human_review_required=result != "pass",
        )
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"Manual check WCAG {sc} ({title}): result={result}.",
            evidence_refs=[item_ev.evidence_id],
            confidence="high",
            human_review_required=result != "pass",
        )
        if result == "fail":
            run_ctx.add_issue(
                severity="serious", category="manual_check_failed",
                description=f"Manual check for WCAG {sc} ({title}) failed: {item.get('notes', '')}",
                source_path=str(checklist_path),
            )
            run_ctx.add_human_review(
                reason=f"Manual check failure for WCAG {sc} ({title}) requires remediation tracking and "
                "re-verification.",
                required_role="owner",
                blocking=False,
            )
        elif result == "not_tested":
            run_ctx.add_issue(
                severity="minor", category="manual_check_not_tested",
                description=f"Manual check for WCAG {sc} ({title}) was not tested: {item.get('notes', '')}",
                source_path=str(checklist_path),
            )

    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"Manual checklist summary: {result_counts['pass']} pass, {result_counts['fail']} fail, "
        f"{result_counts['not_tested']} not tested ({len(items)} item(s) sampled).",
        evidence_refs=[],
        confidence="high",
        human_review_required=bool(result_counts["fail"] or result_counts["not_tested"]),
    )


def qa_checks(run_ctx) -> list[dict]:
    findings = run_ctx.all_findings()
    forbidden_terms = ("is wcag compliant", "fully accessible", "ada compliant", "certified accessible",
                        "section 508 compliant", "conformance certified")
    violations = [f for f in findings if any(t in f["statement"].lower() for t in forbidden_terms)]

    scan_findings = [f for f in findings if "raw entrie(s) before dedup" in f["statement"]]
    dedup_ok = True
    for f in scan_findings:
        m_unique = re.search(r"\((\d+) unique violation", f["statement"])
        m_raw = re.search(r"(\d+) raw entrie", f["statement"])
        if m_unique and m_raw and int(m_unique.group(1)) > int(m_raw.group(1)):
            dedup_ok = False

    return [{
        "check_id": "qa-no-conformance-certification",
        "description": "No finding certifies WCAG/ADA/Section 508 conformance or full accessibility",
        "status": "pass" if not violations else "fail",
        "detail": None if not violations else f"{len(violations)} suspect finding(s)",
    }, {
        "check_id": "qa-violation-dedup-sane",
        "description": "Unique violation count never exceeds raw violation count",
        "status": "pass" if dedup_ok else "fail",
        "detail": None,
    }]


def lane_meta() -> dict:
    return {
        "executive_summary": (
            "Accessibility acceptance-evidence pack combining synthetic automated-scan results and an optional "
            "sampled manual checklist. " + " ".join(MANDATORY_DISCLAIMERS)
        ),
        "scope": [
            "Automated-scan violation extraction, deduplication, and impact-severity summary.",
            "Scan-data freshness (staleness) calculation.",
            "Manual checklist item extraction and pass/fail/not-tested summary.",
            "Page-inventory scope recording.",
        ],
        "exclusions": [
            "No live crawl or scan of any real website is performed.",
            "No WCAG conformance, ADA, or Section 508 compliance certification is issued.",
            "No assistive-technology (screen reader, switch device, etc.) testing is performed by this system.",
        ],
        "methods": [
            "Rule-id + selector based deduplication of automated violation entries.",
            "Impact-severity bucketing (critical/serious/moderate/minor).",
            "Scan-timestamp age calculation against a 90-day freshness threshold.",
            "Manual checklist pass/fail/not-tested tally.",
        ],
        "mandatory_disclaimers": MANDATORY_DISCLAIMERS,
        "buyer_role": "accessibility program owner, legal/compliance contact, or white-label agency partner",
    }
