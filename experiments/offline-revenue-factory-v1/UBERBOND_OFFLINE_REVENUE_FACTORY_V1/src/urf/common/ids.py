"""Run ID and record ID generation.

Run IDs are either supplied explicitly (--run-id) or derived
deterministically from lane + fixture_id + a caller-supplied seed
(--seed). If neither is supplied, a random run ID is generated and the
manifest records that it was randomly assigned (never fabricated as if
it were deterministic).
"""
from __future__ import annotations

import re
import uuid

from .hashing import sha256_str

_SAFE = re.compile(r"[^a-zA-Z0-9_.-]+")


def _slug(text: str) -> str:
    return _SAFE.sub("-", text).strip("-") or "x"


def make_run_id(lane: str, fixture_id: str, seed: str | None, explicit: str | None) -> tuple[str, str]:
    """Returns (run_id, origin) where origin is one of 'explicit', 'seeded', 'random'."""
    if explicit:
        return explicit, "explicit"
    if seed:
        digest = sha256_str(f"{lane}:{fixture_id}:{seed}")[:12]
        return f"run-{_slug(lane)}-{digest}", "seeded"
    digest = uuid.uuid4().hex[:12]
    return f"run-{_slug(lane)}-{digest}", "random"


def make_record_id(prefix: str, run_id: str, ordinal: int) -> str:
    return f"{prefix}-{run_id}-{ordinal:04d}"
