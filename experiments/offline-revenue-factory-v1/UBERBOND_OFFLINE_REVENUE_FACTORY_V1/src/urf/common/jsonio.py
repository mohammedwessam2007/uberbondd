"""JSON read/write helpers with duplicate-key detection.

json.loads silently keeps the last value for a duplicate key. Several
lanes (notably hospital_mrf) need to detect duplicate top-level keys as
evidence of a malformed source file, so this module exposes a loader
that raises instead of silently overwriting.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class DuplicateKeyError(ValueError):
    def __init__(self, key: str):
        self.key = key
        super().__init__(f"duplicate key: {key!r}")


def _no_duplicates_hook(pairs: list[tuple[str, Any]]) -> dict:
    seen: dict[str, Any] = {}
    for key, value in pairs:
        if key in seen:
            raise DuplicateKeyError(key)
        seen[key] = value
    return seen


def load_json_strict(path: Path) -> Any:
    """Parse JSON, raising DuplicateKeyError on duplicate top-level-or-nested keys."""
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    return json.loads(text, object_pairs_hook=_no_duplicates_hook)


def load_json_lenient(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, sort_keys=True, ensure_ascii=True)
        fh.write("\n")


def read_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)
