#!/usr/bin/env python3
"""Task Observer legacy-log migration guard for UberBond.

Derived from the Task Observer bundle by Eoghan Henn / rebelytics.com (CC BY 4.0).
This helper is intentionally conservative: it never deletes the source log and refuses
an unrecognized legacy format instead of manufacturing observations.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def split_sections(raw: str) -> list[str]:
    # Legacy bundles commonly separated observations with level-two headings or
    # explicit observation headings. Refuse a file that cannot be segmented.
    matches = list(re.finditer(r"(?m)^##\s+(?:Observation\s+)?\d+\b.*$", raw))
    if not matches:
        return []
    sections: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
        sections.append(raw[match.start():end].strip())
    return [section for section in sections if section]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("legacy", type=Path, help="legacy skill-observations/log.md")
    parser.add_argument("--check-only", action="store_true", default=False)
    args = parser.parse_args()

    source = args.legacy.resolve()
    if not source.exists() or not source.is_file():
        raise SystemExit("legacy-log-not-found")
    raw = source.read_text(encoding="utf-8")
    sections = split_sections(raw)
    if not sections:
        raise SystemExit("unrecognized-legacy-format-refusing-migration")

    print(f"legacy observations detected: {len(sections)}")
    print("This helper performs detection only unless a future reviewed parser proves a lossless field mapping.")
    print("source remains untouched:", source)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
