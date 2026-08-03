"""Path resolution.

The factory must "run from a clean local directory, assume no
repository-specific paths" (mission Phase 1). All paths are therefore
resolved relative to the installed package location (this file), never
relative to the process current working directory or any hardcoded
absolute path outside the product tree. A `--workspace` override lets
callers (including the self-tests) redirect all writable output
directories to an isolated location to prove nothing is written outside
the workspace.
"""
from __future__ import annotations

from pathlib import Path


def product_root() -> Path:
    # src/urf/common/paths.py -> src/urf/common -> src/urf -> src -> <product root>
    return Path(__file__).resolve().parents[3]


def schemas_dir() -> Path:
    return product_root() / "schemas"


def examples_dir() -> Path:
    return product_root() / "examples"


def fixtures_dir() -> Path:
    return product_root() / "fixtures"


def templates_dir() -> Path:
    return product_root() / "templates"


class Workspace:
    """Resolves the four required writable output roots, optionally overridden."""

    def __init__(self, base: Path | None = None):
        self.base = base or product_root()

    @property
    def reports(self) -> Path:
        return self.base / "reports"

    @property
    def evidence(self) -> Path:
        return self.base / "evidence"

    @property
    def logs(self) -> Path:
        return self.base / "logs"

    @property
    def tmp(self) -> Path:
        return self.base / "tmp"

    def run_dirs(self, run_id: str) -> dict:
        return {
            "reports": self.reports / "runs" / run_id,
            "evidence": self.evidence / "runs" / run_id,
            "logs": self.logs / "runs" / run_id,
            "tmp": self.tmp / "runs" / run_id,
        }
