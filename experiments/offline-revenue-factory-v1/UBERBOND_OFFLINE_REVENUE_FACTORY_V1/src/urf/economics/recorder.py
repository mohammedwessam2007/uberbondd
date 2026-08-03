"""Per-run economics recorder (mission Phase 16).

Records only measurable, already-on-disk per-run facts: wall-clock
duration derived from the run manifest's own started_at/finished_at
timestamps, the record counts the manifest already tracks, and the
final package's real byte size. This module never computes or
fabricates a dollar cost -- dollar figures only ever appear in
pricing.py's explicitly labeled scenario calculator, and even there
every figure is labeled 'assumption' or 'modeled', never 'observed'.
Owner/AI minutes are not tracked by this offline system and are always
reported as unknown unless supplied externally by the operator.
"""
from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Optional


def _parse_iso(ts: Optional[str]) -> Optional[_dt.datetime]:
    if not ts:
        return None
    return _dt.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=_dt.timezone.utc)


def record_run_economics(manifest: dict, package_path: Optional[Path] = None,
                          owner_minutes: Optional[float] = None,
                          ai_minutes: Optional[float] = None) -> dict:
    """Build an economics record from real, already-recorded run facts.

    `owner_minutes`/`ai_minutes` are optional operator-supplied inputs;
    this system has no way to observe them itself, so they default to
    None (unknown) rather than an invented number.
    """
    started = _parse_iso(manifest.get("started_at"))
    finished = _parse_iso(manifest.get("finished_at"))
    duration_seconds = None
    if started and finished:
        duration_seconds = round((finished - started).total_seconds(), 3)

    package_bytes = None
    if package_path is not None and Path(package_path).exists():
        package_bytes = Path(package_path).stat().st_size

    return {
        "run_id": manifest.get("run_id"),
        "lane": manifest.get("lane"),
        "fixture_id": manifest.get("fixture_id"),
        "wall_clock_duration_seconds": duration_seconds,
        "wall_clock_duration_label": "observed fact" if duration_seconds is not None else "unknown",
        "finding_count": manifest.get("finding_count"),
        "unknown_count": manifest.get("unknown_count"),
        "human_review_count": manifest.get("human_review_count"),
        "warning_count": manifest.get("warning_count"),
        "counts_label": "observed fact",
        "final_package_byte_size": package_bytes,
        "package_size_label": "observed fact" if package_bytes is not None else "unknown",
        "owner_minutes": owner_minutes,
        "ai_minutes": ai_minutes,
        "minutes_label": "observed fact" if (owner_minutes is not None or ai_minutes is not None) else "unknown",
        "minutes_note": "Not tracked automatically by this offline system; supply owner_minutes/ai_minutes "
        "explicitly if a human operator recorded them, otherwise this remains unknown.",
    }
