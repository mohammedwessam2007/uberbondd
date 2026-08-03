"""Quarantine workflow for evidence that fails data-safety scanning.

Quarantined items are written to a dedicated quarantine store (never the
normal evidence index) with the detected categories recorded and the raw
matched excerpt redacted, not the surrounding content — we keep enough to
audit *that* something was caught without re-storing the sensitive value.
"""
from __future__ import annotations

from pathlib import Path

from ..common import jsonio
from ..common.hashing import sha256_str
from .classify import DetectionResult


def redact(text: str, hits: list) -> str:
    redacted = text
    seen = set()
    for _category, excerpt in hits:
        if excerpt and excerpt not in seen:
            redacted = redacted.replace(excerpt, "[REDACTED]")
            seen.add(excerpt)
    return redacted


def quarantine_path(evidence_dir: Path) -> Path:
    return evidence_dir / "quarantine.json"


def quarantine_item(evidence_dir: Path, *, source_path: str, raw_text: str, result: DetectionResult, reason: str) -> dict:
    record = {
        "source_path": source_path,
        "raw_text_hash": sha256_str(raw_text),
        "redacted_preview": redact(raw_text, result.hits)[:400],
        "detected_categories": sorted({c for c, _ in result.hits}),
        "hit_count": len(result.hits),
        "reason": reason,
        "data_classification": "PROHIBITED",
    }
    path = quarantine_path(evidence_dir)
    items = jsonio.read_json(path) if path.exists() else []
    items.append(record)
    jsonio.write_json(path, items)
    return record
