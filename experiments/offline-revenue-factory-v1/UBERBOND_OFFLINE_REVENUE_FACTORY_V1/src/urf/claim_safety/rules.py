"""Deterministic claim-safety controls (mission Phase 10).

`scan_text` flags or blocks text implying: guaranteed recovery, savings,
compliance, legal approval, accessibility certification, Microsoft
eligibility, hospital price accuracy, government acceptance, guaranteed
revenue, conversion uplift, security certification, or professional
advice. It also flags unsupported numeric claims (a number with no
nearby evidence reference) and unverified prices, and requires synthetic
fixtures to be disclosed as such in any customer-facing report.

This is a pattern-based, best-effort scanner. It does not claim perfect
detection (mission Phase 11 constraint carried over here too) — see
LEGAL_AND_CLAIM_BOUNDARIES.md.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

CATEGORY_GUARANTEED_RECOVERY = "guaranteed_recovery"
CATEGORY_GUARANTEED_SAVINGS = "guaranteed_savings"
CATEGORY_COMPLIANCE_CLAIM = "compliance_claim"
CATEGORY_LEGAL_APPROVAL = "legal_approval"
CATEGORY_ACCESSIBILITY_CERT = "accessibility_certification"
CATEGORY_MSFT_ELIGIBILITY = "microsoft_eligibility_claim"
CATEGORY_HOSPITAL_PRICE_ACCURACY = "hospital_price_accuracy_claim"
CATEGORY_GOVERNMENT_ACCEPTANCE = "government_acceptance_claim"
CATEGORY_GUARANTEED_REVENUE = "guaranteed_revenue_claim"
CATEGORY_CONVERSION_UPLIFT = "conversion_uplift_claim"
CATEGORY_SECURITY_CERT = "security_certification_claim"
CATEGORY_PROFESSIONAL_ADVICE = "professional_advice_claim"
CATEGORY_UNSUPPORTED_NUMBER = "unsupported_number"
CATEGORY_UNVERIFIED_PRICE = "unverified_price"
CATEGORY_SYNTHETIC_DISCLOSURE_MISSING = "synthetic_disclosure_missing"

# (category, compiled pattern) — patterns are intentionally simple/readable
# so the prohibited-claim dictionary is auditable by a non-engineer owner.
_PROHIBITED_PATTERNS: list[tuple[str, re.Pattern]] = [
    (CATEGORY_GUARANTEED_RECOVERY, re.compile(r"\bguarantee(d|s)?\s+(you\s+will\s+)?recover", re.I)),
    (CATEGORY_GUARANTEED_SAVINGS, re.compile(r"\bguarantee(d|s)?\s+(savings|to\s+save)", re.I)),
    (CATEGORY_GUARANTEED_REVENUE, re.compile(r"\bguarantee(d|s)?\s+(revenue|income|profit)", re.I)),
    (CATEGORY_COMPLIANCE_CLAIM, re.compile(r"\b(is|are)\s+(fully\s+)?compliant\b", re.I)),
    (CATEGORY_COMPLIANCE_CLAIM, re.compile(r"\bcertif(y|ies|ied)\s+compliance\b", re.I)),
    (CATEGORY_LEGAL_APPROVAL, re.compile(r"\blegally\s+(approved|cleared|sufficient)\b", re.I)),
    (CATEGORY_LEGAL_APPROVAL, re.compile(r"\bmeets?\s+all\s+legal\s+requirements\b", re.I)),
    (CATEGORY_ACCESSIBILITY_CERT, re.compile(r"\bwcag\s*2?\.?\d?\s*(aa|aaa)?\s*(certified|certification|compliant)\b", re.I)),
    (CATEGORY_ACCESSIBILITY_CERT, re.compile(r"\bada\s+(compliant|certified)\b", re.I)),
    (CATEGORY_MSFT_ELIGIBILITY, re.compile(r"\b(you|customer)\s+(is|are)\s+eligible\s+for\s+(a\s+)?(microsoft\s+)?(sla\s+)?credit\b", re.I)),
    (CATEGORY_MSFT_ELIGIBILITY, re.compile(r"\bmicrosoft\s+(will|has)\s+approved\b", re.I)),
    (CATEGORY_HOSPITAL_PRICE_ACCURACY, re.compile(r"\bprices?\s+(is|are)\s+accurate\b", re.I)),
    (CATEGORY_HOSPITAL_PRICE_ACCURACY, re.compile(r"\bfile\s+is\s+complete\s+and\s+accurate\b", re.I)),
    (CATEGORY_GOVERNMENT_ACCEPTANCE, re.compile(r"\b(will|is)\s+(be\s+)?accepted\s+by\s+(the\s+)?(agency|government|procurement)\b", re.I)),
    (CATEGORY_CONVERSION_UPLIFT, re.compile(r"\bwill\s+increase\s+conversion(s)?\s+by\s+\d", re.I)),
    (CATEGORY_CONVERSION_UPLIFT, re.compile(r"\bguarantee(d|s)?\s+(a\s+)?conversion\s+(uplift|increase)\b", re.I)),
    (CATEGORY_SECURITY_CERT, re.compile(r"\b(pci|soc\s*2|iso\s*27001)\s+(certified|compliant)\b", re.I)),
    (CATEGORY_PROFESSIONAL_ADVICE, re.compile(r"\bthis\s+is\s+(legal|tax|accounting|medical)\s+advice\b", re.I)),
]

_MONEY_OR_PERCENT = re.compile(r"(\$\s?\d[\d,]*(\.\d+)?|\d+(\.\d+)?\s?%)")
_EVIDENCE_MARKER = re.compile(r"\[(ev|fnd)-[\w.-]+\]|evidence[_ ]?ref", re.I)
_SYNTHETIC_MARKER = re.compile(r"\bsynthetic\b", re.I)
_PRICE_WORD = re.compile(r"\bprice[sd]?\b", re.I)
_VERIFIED_MARKER = re.compile(r"\b(verified|source[- ]?derived|as[- ]stated\s+in)\b", re.I)


@dataclass
class ClaimViolation:
    category: str
    excerpt: str
    rule: str


def scan_text(text: str) -> list[ClaimViolation]:
    violations: list[ClaimViolation] = []
    for category, pattern in _PROHIBITED_PATTERNS:
        for match in pattern.finditer(text):
            start = max(0, match.start() - 20)
            end = min(len(text), match.end() + 20)
            violations.append(ClaimViolation(category=category, excerpt=text[start:end].strip(), rule=pattern.pattern))

    for match in _MONEY_OR_PERCENT.finditer(text):
        window_start = max(0, match.start() - 60)
        window_end = min(len(text), match.end() + 60)
        window = text[window_start:window_end]
        if not _EVIDENCE_MARKER.search(window):
            violations.append(ClaimViolation(
                category=CATEGORY_UNSUPPORTED_NUMBER,
                excerpt=window.strip(),
                rule="numeric claim without adjacent evidence reference",
            ))

    for match in _PRICE_WORD.finditer(text):
        window_start = max(0, match.start() - 60)
        window_end = min(len(text), match.end() + 60)
        window = text[window_start:window_end]
        if _MONEY_OR_PERCENT.search(window) and not _VERIFIED_MARKER.search(window):
            violations.append(ClaimViolation(
                category=CATEGORY_UNVERIFIED_PRICE,
                excerpt=window.strip(),
                rule="price mentioned without a verification/source marker",
            ))

    return violations


def check_synthetic_disclosure(text: str, uses_synthetic_data: bool) -> list[ClaimViolation]:
    if uses_synthetic_data and not _SYNTHETIC_MARKER.search(text):
        return [ClaimViolation(
            category=CATEGORY_SYNTHETIC_DISCLOSURE_MISSING,
            excerpt=text[:80].strip(),
            rule="report uses synthetic data but does not disclose it",
        )]
    return []


def is_safe(text: str, *, uses_synthetic_data: bool = False) -> bool:
    return not scan_text(text) and not check_synthetic_disclosure(text, uses_synthetic_data)
