"""Data classification and credential/PHI detection (mission Phase 11).

DATA_CLASSES: PUBLIC, SYNTHETIC, CUSTOMER_PROVIDED, CONFIDENTIAL,
PERSONAL_DATA, PHI, CREDENTIAL, PROHIBITED.

`scan_for_prohibited` is pattern-based and explicitly does not claim
perfect detection (see docstring on DetectionResult and
SECURITY_AND_PRIVACY_BOUNDARIES.md). Any hit routes the evidence item to
quarantine rather than the normal evidence store.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

DATA_CLASSES = [
    "PUBLIC", "SYNTHETIC", "CUSTOMER_PROVIDED", "CONFIDENTIAL",
    "PERSONAL_DATA", "PHI", "CREDENTIAL", "PROHIBITED",
]

_CREDENTIAL_PATTERNS = [
    ("aws_access_key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("generic_api_key_assignment", re.compile(r"(?i)\b(api[_-]?key|secret[_-]?key|access[_-]?token)\b\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}")),
    ("private_key_block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("bearer_token", re.compile(r"(?i)\bBearer\s+[A-Za-z0-9_\-.=]{16,}")),
    ("password_assignment", re.compile(r"(?i)\bpassword\b\s*[:=]\s*['\"]?\S{6,}")),
]

_PHI_PATTERNS = [
    ("mrn_label", re.compile(r"(?i)\bmedical\s+record\s+number\b\s*[:=]?\s*\w+")),
    ("diagnosis_code", re.compile(r"(?i)\bicd-?10\b\s*[:=]?\s*[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?")),
    ("patient_name_label", re.compile(r"(?i)\bpatient\s+name\b\s*[:=]")),
    ("ssn", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
]

_LIVE_PAYMENT_PATTERNS = [
    ("card_pan_like", re.compile(r"\b(?:\d[ -]*?){13,19}\b")),
    ("cvv_label", re.compile(r"(?i)\bcvv\b\s*[:=]?\s*\d{3,4}")),
]


@dataclass
class DetectionResult:
    hits: list = field(default_factory=list)  # list[(category, matched_text_excerpt)]

    @property
    def is_clean(self) -> bool:
        return not self.hits

    def to_list(self) -> list:
        return [{"category": c, "excerpt": e} for c, e in self.hits]


def _scan(patterns, text: str) -> list:
    hits = []
    for category, pattern in patterns:
        for m in pattern.finditer(text):
            hits.append((category, text[m.start():m.end()][:64]))
    return hits


def scan_for_credentials(text: str) -> DetectionResult:
    return DetectionResult(hits=_scan(_CREDENTIAL_PATTERNS, text))


def scan_for_phi(text: str) -> DetectionResult:
    return DetectionResult(hits=_scan(_PHI_PATTERNS, text))


def scan_for_live_payment_details(text: str) -> DetectionResult:
    return DetectionResult(hits=_scan(_LIVE_PAYMENT_PATTERNS, text))


def scan_for_prohibited(text: str) -> DetectionResult:
    """Union of credential, PHI, and live-payment scans. Best-effort only."""
    hits = (
        _scan(_CREDENTIAL_PATTERNS, text)
        + _scan(_PHI_PATTERNS, text)
        + _scan(_LIVE_PAYMENT_PATTERNS, text)
    )
    return DetectionResult(hits=hits)


def classify_and_maybe_quarantine(text: str, declared_classification: str) -> tuple:
    """Returns (effective_classification, DetectionResult).

    If prohibited content is detected regardless of the declared
    classification, the effective classification is forced to
    'PROHIBITED' and the caller must quarantine the item rather than
    store it in the normal evidence index.
    """
    if declared_classification not in DATA_CLASSES:
        raise ValueError(f"unknown data classification: {declared_classification!r}")
    result = scan_for_prohibited(text)
    if not result.is_clean:
        return "PROHIBITED", result
    return declared_classification, result
