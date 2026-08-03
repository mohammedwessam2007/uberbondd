"""Role-based report templates (mission Phase 8/9).

Four templates share one underlying Report record and vary only in which
sections are shown/redacted:

- direct_buyer: buyer-facing, no internal QA notes, no UberBond internal
  cost/process detail.
- white_label_partner: same as direct_buyer but with UberBond branding
  references stripped so a partner can present it under their own name.
- internal_qa: everything, including blocked conclusions and QA detail.
- technical_appendix: methods, parser versions, evidence references,
  hashes — the detailed backing material.
"""
from __future__ import annotations

TEMPLATES = ("direct_buyer", "white_label_partner", "internal_qa", "technical_appendix")

_BRANDING_TERMS = ("UberBond", "uberbond")


def sections_for(template: str) -> dict:
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template!r}")
    base = {
        "executive_summary": True, "scope": True, "exclusions": True,
        "inputs": True, "methods": False, "findings": True, "evidence_refs": False,
        "unknowns": True, "blocked_conclusions": True, "human_review_requirements": True,
        "limitations": True, "run_manifest": False, "checksum": False, "qa_detail": False,
    }
    if template == "direct_buyer":
        return base
    if template == "white_label_partner":
        out = dict(base)
        out["strip_branding"] = True
        return out
    if template == "internal_qa":
        out = dict(base)
        out.update(methods=True, evidence_refs=True, run_manifest=True, qa_detail=True)
        return out
    if template == "technical_appendix":
        out = dict(base)
        out.update(methods=True, evidence_refs=True, run_manifest=True, checksum=True)
        return out
    raise AssertionError("unreachable")


def strip_branding(text: str) -> str:
    out = text
    for term in _BRANDING_TERMS:
        out = out.replace(term, "the delivering partner")
    return out
