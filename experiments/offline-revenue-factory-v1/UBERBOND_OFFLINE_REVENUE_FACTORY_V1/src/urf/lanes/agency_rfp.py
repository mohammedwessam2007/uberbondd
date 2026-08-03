"""Lane 3: Agency RFP compliance-matrix backend (mission Phase 5).

Synthetic-only. Documents are plain-text fixtures written in a small
line-based markup this module defines itself (no PDF/DOCX parser is
available in this stdlib-only environment). A fixture whose document
cannot be decoded as text is handled by graceful degradation: an
'unknown' finding plus a blocking human-review request, never a crash
and never fabricated extracted content.

This lane NEVER submits a bid, NEVER recommends "submit" or "no-bid" as
a final action, and NEVER claims legal sufficiency of a compliance
matrix. The overall submission-readiness conclusion is always labeled
"blocked conclusion": a human owner must review every mandatory/pass-fail
requirement and every flagged conflict before any submission decision.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..common.hashing import sha256_file

FIXTURES = {
    "complete": "complete",
    "amended": "amended",
    "unanswered_questions": "unanswered_questions",
    "conflicting_requirements": "conflicting_requirements",
    "missing_submission_evidence": "missing_submission_evidence",
    "unparseable_format": "unparseable_format",
}

MANDATORY_DISCLAIMERS = [
    "This output is not a bid submission.",
    "This output is not a no-bid decision.",
    "This output is not a legal sufficiency determination.",
    "This output does not guarantee compliance with the RFP's requirements.",
    "A qualified human reviewer must validate every mandatory and pass/fail requirement, and resolve every "
    "flagged conflict, before any submission decision is made.",
    "This system does not submit, sign, or certify any procurement response.",
]

REQUIREMENT_TYPES = {"MANDATORY", "SCORED", "PASS_FAIL"}


def _read_metadata(fixture_dir: Path) -> dict:
    path = fixture_dir / "metadata.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def validate_input(fixture_dir: Path) -> list[dict]:
    issues = []
    meta = _read_metadata(fixture_dir)
    doc_name = meta.get("document_filename")
    if not meta or not doc_name:
        issues.append({
            "severity": "critical",
            "category": "missing_metadata_file",
            "description": f"metadata.json absent or missing 'document_filename' in fixture {fixture_dir.name}.",
            "source_path": str(fixture_dir / "metadata.json"),
        })
        return issues
    if not (fixture_dir / doc_name).exists():
        issues.append({
            "severity": "critical",
            "category": "missing_input_file",
            "description": f"Declared document '{doc_name}' is absent from fixture {fixture_dir.name}.",
            "source_path": str(fixture_dir / doc_name),
        })
    amendment_name = meta.get("amendment_filename")
    if amendment_name and not (fixture_dir / amendment_name).exists():
        issues.append({
            "severity": "critical",
            "category": "missing_input_file",
            "description": f"Declared amendment '{amendment_name}' is absent from fixture {fixture_dir.name}.",
            "source_path": str(fixture_dir / amendment_name),
        })
    return issues


def _parse_kv_block(lines: list[str]) -> dict:
    out = {}
    for line in lines:
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        out[key.strip()] = value.strip()
    return out


def _parse_document(text: str) -> tuple[dict, list[tuple[str, dict]]]:
    """Deterministic line-based parser for this lane's own markup.

    Top-level `KEY: value` lines precede any block. `[TAG]` ... `[/TAG]`
    delimits a block of `KEY: value` lines. Unknown syntax is ignored
    rather than raising, since malformed markup is a data-quality issue
    to flag, not a hard parser failure.
    """
    top_lines: list[str] = []
    blocks: list[tuple[str, dict]] = []
    current_tag: str | None = None
    current_lines: list[str] = []
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if current_tag is not None and stripped == f"[/{current_tag}]":
            blocks.append((current_tag, _parse_kv_block(current_lines)))
            current_tag = None
            current_lines = []
            continue
        if current_tag is None and stripped.startswith("[") and stripped.endswith("]") and not stripped.startswith("[/"):
            current_tag = stripped[1:-1]
            current_lines = []
            continue
        if current_tag is not None:
            current_lines.append(raw_line)
        else:
            top_lines.append(raw_line)
    top = _parse_kv_block(top_lines)
    return top, blocks


def execute(run_ctx, fixture_dir: Path) -> None:
    meta = _read_metadata(fixture_dir)
    doc_name = meta.get("document_filename")
    if not doc_name or not (fixture_dir / doc_name).exists():
        run_ctx.add_unknown(
            question="What does the RFP document contain?",
            reason=f"No usable document declared/found for fixture {fixture_dir.name}.",
            blocking=True,
        )
        run_ctx.add_finding(
            label="blocked conclusion",
            statement="Overall submission-readiness conclusion is BLOCKED: no readable RFP document available. "
            + " ".join(MANDATORY_DISCLAIMERS),
            evidence_refs=[],
            confidence="unknown",
            human_review_required=True,
            blocked_reason="No document could be located or read for this fixture.",
        )
        return

    doc_path = fixture_dir / doc_name
    digest = sha256_file(doc_path)
    try:
        doc_text = doc_path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        run_ctx.add_evidence(
            source_type="local_file",
            source_path=str(doc_path),
            source_hash=digest,
            data_classification="SYNTHETIC",
            observed_value={"byte_size": doc_path.stat().st_size, "decodable_as_utf8": False},
            parser="agency_rfp.file_stat",
            parser_version="1.0.0",
            deterministic_transform="sha256+stat",
            confidence="high",
            limitation="File identity only; content format is unsupported by this parser.",
            prohibited_interpretation="Do not treat as evidence of the document's requirement content.",
            human_review_required=True,
        )
        run_ctx.add_finding(
            label="unknown",
            statement=f"{doc_name} could not be decoded as text ({exc}); this offline system has no parser for "
            "its format (e.g. scanned image/PDF binary). No requirement content could be extracted.",
            evidence_refs=[],
            confidence="unknown",
            human_review_required=True,
        )
        run_ctx.add_issue(
            severity="critical", category="unparseable_document_format",
            description=f"{doc_name} is not decodable as UTF-8 text; no parser available for this format.",
            source_path=str(doc_path),
        )
        run_ctx.add_human_review(
            reason=f"{doc_name} must be reviewed directly by a human, or reprocessed with a format-appropriate "
            "extraction tool this offline system does not have.",
            required_role="owner",
            blocking=True,
        )
        run_ctx.add_finding(
            label="blocked conclusion",
            statement="Overall submission-readiness conclusion is BLOCKED: the RFP document format could not be "
            "parsed, so no compliance matrix could be built. " + " ".join(MANDATORY_DISCLAIMERS),
            evidence_refs=[],
            confidence="unknown",
            human_review_required=True,
            blocked_reason="Document format unsupported by this stdlib-only parser.",
        )
        return

    doc_ev = run_ctx.add_evidence(
        source_type="local_file",
        source_path=str(doc_path),
        source_hash=digest,
        data_classification="SYNTHETIC",
        observed_value={"byte_size": doc_path.stat().st_size},
        parser="agency_rfp.file_stat",
        parser_version="1.0.0",
        deterministic_transform="sha256+stat",
        confidence="high",
        limitation="Hash and size only establish file identity, not requirement content.",
        prohibited_interpretation="Do not treat as a compliance signal by itself.",
        human_review_required=False,
    )

    top, blocks = _parse_document(doc_text)
    run_ctx.add_finding(
        label="parsed fact",
        statement=f"Parsed RFP header from {doc_name}: rfp_id={top.get('RFP_ID')!r}, "
        f"due_date={top.get('DUE_DATE')!r}, submission_method={top.get('SUBMISSION_METHOD')!r}.",
        evidence_refs=[doc_ev.evidence_id],
        confidence="high",
        human_review_required=False,
    )

    requirements = [d for tag, d in blocks if tag == "REQUIREMENT"]
    questions = [d for tag, d in blocks if tag == "QUESTION"]
    attachments = [d for tag, d in blocks if tag == "ATTACHMENT"]
    attachment_by_filename = {a.get("FILENAME"): a for a in attachments if a.get("FILENAME")}
    requirement_by_id = {r.get("ID"): r for r in requirements if r.get("ID")}

    type_counts = {t: 0 for t in REQUIREMENT_TYPES}
    unmet_mandatory = []
    evidence_gaps = []
    reported_conflicts: set[tuple[str, str]] = set()

    for req in requirements:
        req_id = req.get("ID", "UNKNOWN")
        req_type = req.get("TYPE", "UNKNOWN")
        status = req.get("STATUS", "unknown")
        section = req.get("SECTION", "")
        evidence_filename = req.get("EVIDENCE") or None
        conflicts_with = req.get("CONFLICTS_WITH") or None
        if req_type in type_counts:
            type_counts[req_type] += 1

        req_ev = run_ctx.add_evidence(
            source_type="local_file",
            source_path=f"{doc_path}#{req_id}",
            source_hash=None,
            data_classification="SYNTHETIC",
            observed_value=req,
            parser="agency_rfp.requirement_extractor",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Extracted from a synthetic plain-text fixture, not a live RFP submission portal.",
            prohibited_interpretation="Presence in this register does not establish the requirement is satisfied.",
            human_review_required=False,
        )
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"Requirement {req_id} ({req_type}, section {section}) extracted with status={status!r}.",
            evidence_refs=[req_ev.evidence_id],
            confidence="high",
            human_review_required=False,
        )

        if req_type == "MANDATORY" and status != "met":
            unmet_mandatory.append(req_id)
            run_ctx.add_issue(
                severity="critical", category="mandatory_requirement_not_met",
                description=f"Requirement {req_id} (section {section}) is MANDATORY and status={status!r}, not 'met'.",
                source_path=str(doc_path),
            )
            run_ctx.add_human_review(
                reason=f"Requirement {req_id} is a MANDATORY requirement not currently marked 'met'; a human "
                "must confirm status before any submission decision.",
                required_role="owner",
                blocking=True,
            )

        if evidence_filename:
            att = attachment_by_filename.get(evidence_filename)
            if att is None:
                evidence_gaps.append(req_id)
                run_ctx.add_issue(
                    severity="moderate", category="undeclared_evidence_reference",
                    description=f"Requirement {req_id} references evidence file "
                    f"{evidence_filename!r} which has no matching [ATTACHMENT] entry.",
                    source_path=str(doc_path),
                )
            elif att.get("REQUIRED") == "true" and att.get("PROVIDED") != "true":
                evidence_gaps.append(req_id)
                run_ctx.add_issue(
                    severity="critical", category="missing_submission_evidence",
                    description=f"Requirement {req_id} depends on attachment {evidence_filename!r}, which is "
                    "REQUIRED but not PROVIDED.",
                    source_path=str(doc_path),
                )
                run_ctx.add_human_review(
                    reason=f"Attachment {evidence_filename!r} required by requirement {req_id} is missing; "
                    "a human must supply it or confirm the requirement is otherwise waived before submission.",
                    required_role="owner",
                    blocking=True,
                )

        if conflicts_with and conflicts_with in requirement_by_id:
            pair = tuple(sorted((req_id, conflicts_with)))
            if pair not in reported_conflicts:
                reported_conflicts.add(pair)
                run_ctx.add_finding(
                    label="parsed fact",
                    statement=f"Requirements {pair[0]} and {pair[1]} declare a mutual conflict via the "
                    "source document's own CONFLICTS_WITH markup.",
                    evidence_refs=[req_ev.evidence_id],
                    confidence="high",
                    human_review_required=True,
                )
                run_ctx.add_issue(
                    severity="serious", category="conflicting_requirement",
                    description=f"Requirement {pair[0]} conflicts with requirement {pair[1]} per source markup; "
                    "both cannot be satisfied as written.",
                    source_path=str(doc_path),
                )
                run_ctx.add_human_review(
                    reason=f"Conflict between {pair[0]} and {pair[1]} must be resolved with the issuing "
                    "organization (e.g. via a clarification question or amendment) before submission.",
                    required_role="owner",
                    blocking=True,
                )

    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"Requirement mix: {type_counts.get('MANDATORY', 0)} mandatory, "
        f"{type_counts.get('SCORED', 0)} scored, {type_counts.get('PASS_FAIL', 0)} pass/fail "
        f"({len(requirements)} total).",
        evidence_refs=[],
        confidence="high",
        human_review_required=False,
    )

    for q in questions:
        q_id = q.get("ID", "UNKNOWN")
        status = q.get("STATUS", "unknown")
        q_ev = run_ctx.add_evidence(
            source_type="local_file",
            source_path=f"{doc_path}#{q_id}",
            source_hash=None,
            data_classification="SYNTHETIC",
            observed_value=q,
            parser="agency_rfp.question_extractor",
            parser_version="1.0.0",
            deterministic_transform=None,
            confidence="high",
            limitation="Extracted from a synthetic plain-text fixture.",
            prohibited_interpretation="An 'answered' status here does not certify the answer's legal effect.",
            human_review_required=status == "unanswered",
        )
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"Question {q_id} status={status!r}.",
            evidence_refs=[q_ev.evidence_id],
            confidence="high",
            human_review_required=status == "unanswered",
        )
        if status == "unanswered":
            run_ctx.add_issue(
                severity="moderate", category="unanswered_question",
                description=f"Question {q_id} has no answer on record; response readiness may depend on it.",
                source_path=str(doc_path),
            )
            run_ctx.add_human_review(
                reason=f"Question {q_id} is unanswered; confirm with the issuing organization before relying "
                "on any assumption about its answer.",
                required_role="owner",
                blocking=False,
            )

    missing_required_attachments = [
        a.get("ID", "UNKNOWN") for a in attachments
        if a.get("REQUIRED") == "true" and a.get("PROVIDED") != "true"
    ]
    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"Attachment completeness: {len(attachments) - len(missing_required_attachments)}/"
        f"{len(attachments)} declared attachment(s) are REQUIRED-and-PROVIDED or not required.",
        evidence_refs=[],
        confidence="high",
        human_review_required=bool(missing_required_attachments),
    )

    amendment_name = meta.get("amendment_filename")
    if amendment_name:
        _process_amendment(run_ctx, fixture_dir, amendment_name, top, requirement_by_id)

    no_bid_flag = bool(unmet_mandatory) or bool(missing_required_attachments) or bool(reported_conflicts)
    run_ctx.add_finding(
        label="deterministic calculation",
        statement=(
            f"Readiness signal: {len(unmet_mandatory)} unmet mandatory requirement(s), "
            f"{len(missing_required_attachments)} missing required attachment(s), "
            f"{len(reported_conflicts)} declared conflict(s), "
            f"{sum(1 for q in questions if q.get('STATUS') == 'unanswered')} unanswered question(s). "
            f"no_bid_review_flag={no_bid_flag}."
        ),
        evidence_refs=[],
        confidence="high",
        human_review_required=no_bid_flag,
    )

    run_ctx.add_finding(
        label="blocked conclusion",
        statement="Overall submission-readiness conclusion is BLOCKED: this pack organizes the compliance "
        "matrix, evidence gaps, conflicts, and open questions, but a human owner must make the actual "
        "submit/no-bid decision. " + " ".join(MANDATORY_DISCLAIMERS),
        evidence_refs=[],
        confidence="unknown",
        human_review_required=True,
        blocked_reason="A submission decision requires human legal/business judgment this system does not "
        "and cannot provide.",
    )
    run_ctx.add_human_review(
        reason="A qualified human owner must review the full compliance matrix, resolve every flagged "
        "conflict and evidence gap, and make the final submit/no-bid decision.",
        required_role="owner",
        blocking=True,
    )


def _process_amendment(run_ctx, fixture_dir: Path, amendment_name: str, base_top: dict, requirement_by_id: dict) -> None:
    amendment_path = fixture_dir / amendment_name
    digest = sha256_file(amendment_path)
    amend_ev = run_ctx.add_evidence(
        source_type="local_file",
        source_path=str(amendment_path),
        source_hash=digest,
        data_classification="SYNTHETIC",
        observed_value={"byte_size": amendment_path.stat().st_size},
        parser="agency_rfp.file_stat",
        parser_version="1.0.0",
        deterministic_transform="sha256+stat",
        confidence="high",
        limitation="Hash and size only establish file identity.",
        prohibited_interpretation="Do not treat as evidence the amendment was received via an official channel.",
        human_review_required=False,
    )
    amend_top, amend_blocks = _parse_document(amendment_path.read_text(encoding="utf-8"))
    amends_id = amend_top.get("AMENDS")
    new_due_date = amend_top.get("NEW_DUE_DATE")
    run_ctx.add_finding(
        label="parsed fact",
        statement=f"Amendment {amend_top.get('AMENDMENT_ID')!r} amends RFP {amends_id!r}, "
        f"issued {amend_top.get('ISSUED_DATE')!r}, new_due_date={new_due_date!r}.",
        evidence_refs=[amend_ev.evidence_id],
        confidence="high",
        human_review_required=False,
    )
    if amends_id and base_top.get("RFP_ID") and amends_id != base_top.get("RFP_ID"):
        run_ctx.add_issue(
            severity="serious", category="amendment_rfp_id_mismatch",
            description=f"Amendment declares AMENDS={amends_id!r} but base document RFP_ID="
            f"{base_top.get('RFP_ID')!r}.",
            source_path=str(amendment_path),
        )
    if new_due_date and new_due_date != base_top.get("DUE_DATE"):
        run_ctx.add_finding(
            label="source-derived rule",
            statement=f"Amendment supersedes the original due date {base_top.get('DUE_DATE')!r} with "
            f"{new_due_date!r}; the amended date governs per standard amendment precedence.",
            evidence_refs=[amend_ev.evidence_id],
            confidence="high",
            human_review_required=True,
        )
        run_ctx.add_human_review(
            reason="Confirm the amended due date is reflected in the vendor's submission calendar.",
            required_role="owner",
            blocking=False,
        )

    actions = [d for tag, d in amend_blocks if tag == "AMENDMENT_ACTION"]
    for action in actions:
        act = action.get("ACTION", "UNKNOWN")
        if act == "MODIFY":
            target = action.get("TARGET_ID")
            field = action.get("FIELD")
            new_value = action.get("NEW_VALUE")
            exists = target in requirement_by_id
            run_ctx.add_finding(
                label="parsed fact",
                statement=f"Amendment action MODIFY: requirement {target} field {field} -> {new_value!r} "
                f"(target requirement {'found' if exists else 'NOT FOUND'} in base document).",
                evidence_refs=[amend_ev.evidence_id],
                confidence="high",
                human_review_required=not exists,
            )
            if not exists:
                run_ctx.add_issue(
                    severity="moderate", category="amendment_target_not_found",
                    description=f"Amendment MODIFY action targets requirement {target!r}, not present in the "
                    "base document.",
                    source_path=str(amendment_path),
                )
        elif act == "ADD":
            new_id = action.get("ID")
            run_ctx.add_finding(
                label="parsed fact",
                statement=f"Amendment action ADD: new requirement {new_id} ({action.get('TYPE')}, "
                f"section {action.get('SECTION')}) introduced by amendment.",
                evidence_refs=[amend_ev.evidence_id],
                confidence="high",
                human_review_required=True,
            )
            run_ctx.add_human_review(
                reason=f"New requirement {new_id} was introduced by amendment; confirm it is incorporated into "
                "the compliance matrix and tracked to completion.",
                required_role="owner",
                blocking=False,
            )
        elif act == "REMOVE":
            target = action.get("TARGET_ID")
            run_ctx.add_finding(
                label="parsed fact",
                statement=f"Amendment action REMOVE: requirement {target} withdrawn by amendment.",
                evidence_refs=[amend_ev.evidence_id],
                confidence="high",
                human_review_required=False,
            )
        else:
            run_ctx.add_finding(
                label="unknown",
                statement=f"Amendment action type {act!r} is not recognized by this parser.",
                evidence_refs=[amend_ev.evidence_id],
                confidence="unknown",
                human_review_required=True,
            )


def qa_checks(run_ctx) -> list[dict]:
    findings = run_ctx.all_findings()
    forbidden_terms = ("we recommend submitting", "bid accepted", "will win", "guaranteed to be compliant",
                        "legally sufficient", "no-bid recommended")
    violations = [f for f in findings if any(t in f["statement"].lower() for t in forbidden_terms)]
    conflict_findings = [f for f in findings if "declare a mutual conflict" in f["statement"]]
    conflict_issues = [i for i in run_ctx.all_issues() if i["category"] == "conflicting_requirement"]
    return [{
        "check_id": "qa-no-submission-recommendation",
        "description": "No finding recommends submitting, no-bidding, or asserts legal sufficiency",
        "status": "pass" if not violations else "fail",
        "detail": None if not violations else f"{len(violations)} suspect finding(s)",
    }, {
        "check_id": "qa-conflicts-flagged-as-issues",
        "description": "Every declared requirement conflict produces a matching issue record",
        "status": "pass" if len(conflict_findings) == len(conflict_issues) else "fail",
        "detail": None if len(conflict_findings) == len(conflict_issues)
        else f"{len(conflict_findings)} conflict finding(s) vs {len(conflict_issues)} conflict issue(s)",
    }]


def lane_meta() -> dict:
    return {
        "executive_summary": (
            "Compliance-matrix evidence pack for a government/agency RFP response, built entirely from local "
            "synthetic fixtures parsed with a stdlib-only line-based document reader. " + " ".join(MANDATORY_DISCLAIMERS)
        ),
        "scope": [
            "Requirement extraction (ID, type, section, owner, due, status, evidence link).",
            "Mandatory/scored/pass-fail requirement classification and counts.",
            "Submission-evidence (attachment) completeness checking.",
            "Source-declared requirement conflict register.",
            "Question-and-answer register with unanswered-question flagging.",
            "Amendment reconciliation (due-date supersession, requirement add/modify/remove).",
        ],
        "exclusions": [
            "No PDF/DOCX binary parsing is performed; unsupported document formats degrade to an 'unknown' "
            "finding and a blocking human-review request rather than fabricated content.",
            "No bid is submitted, drafted for submission, or transmitted to any issuing organization.",
            "No legal sufficiency, win-probability, or compliance-guarantee determination is made.",
        ],
        "methods": [
            "Deterministic line-based markup parsing of a self-defined requirement/question/attachment format.",
            "Structural cross-referencing of requirement evidence fields against declared attachments.",
            "Source-declared (not inferred) conflict-pair detection via explicit CONFLICTS_WITH markup.",
            "Amendment due-date and requirement-action reconciliation against the base document.",
        ],
        "mandatory_disclaimers": MANDATORY_DISCLAIMERS,
        "buyer_role": "proposal owner, capture manager, or white-label agency partner",
    }
