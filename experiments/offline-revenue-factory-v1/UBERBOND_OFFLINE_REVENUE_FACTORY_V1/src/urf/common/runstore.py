"""RunContext: in-memory + on-disk state for a single lane run.

A run moves through stages: init-run -> validate-input -> execute -> qa ->
render -> package -> cleanup. Each stage is resumable: it reads whatever
prior-stage JSON exists on disk and appends to the run manifest's
`stages_completed` list. Nothing is held only in memory across CLI
invocations; the run directory on disk is the source of truth.
"""
from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from . import jsonio
from .ids import make_record_id
from .models import (
    CleanupRecord, DeliveryAcceptance, EvidenceItem, Finding, HumanReviewRequest,
    Issue, QAResult, Report, RunManifest, SourceArtifact, Unknown,
)
from .paths import Workspace, product_root
from .validation import validate_record_or_raise
from .. import __version__ as SOFTWARE_VERSION


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _git_commit() -> Optional[str]:
    """Best-effort, never fabricated: null if git metadata is unavailable.

    Reads .git/HEAD directly rather than shelling out to `git`, so this
    never spawns a subprocess and never fails if git is absent.
    """
    try:
        root = product_root()
        for parent in [root, *root.parents]:
            git_dir = parent / ".git"
            if git_dir.is_dir():
                head = (git_dir / "HEAD").read_text().strip()
                if head.startswith("ref:"):
                    ref_path = git_dir / head.split(" ", 1)[1].strip()
                    if ref_path.exists():
                        return ref_path.read_text().strip()
                    return None
                return head
        return None
    except OSError:
        return None


@dataclass
class RunPaths:
    run_dir_reports: Path
    run_dir_evidence: Path
    run_dir_logs: Path
    run_dir_tmp: Path

    @property
    def manifest_path(self) -> Path:
        return self.run_dir_logs / "run_manifest.json"

    @property
    def evidence_index_path(self) -> Path:
        return self.run_dir_evidence / "evidence_index.json"

    @property
    def findings_path(self) -> Path:
        return self.run_dir_evidence / "findings.json"

    @property
    def issues_path(self) -> Path:
        return self.run_dir_evidence / "issues.json"

    @property
    def unknowns_path(self) -> Path:
        return self.run_dir_evidence / "unknowns.json"

    @property
    def human_review_path(self) -> Path:
        return self.run_dir_evidence / "human_review_requests.json"

    @property
    def qa_path(self) -> Path:
        return self.run_dir_reports / "qa_result.json"

    @property
    def cleanup_path(self) -> Path:
        return self.run_dir_logs / "cleanup_record.json"


class RunContext:
    def __init__(self, run_id: str, lane: str, fixture_id: str, workspace: Workspace):
        self.run_id = run_id
        self.lane = lane
        self.fixture_id = fixture_id
        self.workspace = workspace
        dirs = workspace.run_dirs(run_id)
        self.paths = RunPaths(
            run_dir_reports=dirs["reports"],
            run_dir_evidence=dirs["evidence"],
            run_dir_logs=dirs["logs"],
            run_dir_tmp=dirs["tmp"],
        )
        for d in (self.paths.run_dir_reports, self.paths.run_dir_evidence,
                  self.paths.run_dir_logs, self.paths.run_dir_tmp):
            d.mkdir(parents=True, exist_ok=True)

    # ---- manifest -------------------------------------------------
    def load_manifest(self) -> Optional[dict]:
        if self.paths.manifest_path.exists():
            return jsonio.read_json(self.paths.manifest_path)
        return None

    def init_manifest(self, input_hashes: dict) -> dict:
        manifest = RunManifest(
            run_id=self.run_id,
            lane=self.lane,
            fixture_id=self.fixture_id,
            input_hashes=input_hashes,
            software_version=SOFTWARE_VERSION,
            started_at=now_iso(),
            finished_at=None,
            stages_completed=["init-run"],
            finding_count=0,
            unknown_count=0,
            warning_count=0,
            human_review_count=0,
            qa_ref=None,
            final_package_hash=None,
            git_commit=_git_commit(),
        ).to_dict()
        validate_record_or_raise("run_manifest", manifest)
        jsonio.write_json(self.paths.manifest_path, manifest)
        return manifest

    def mark_stage(self, stage: str) -> dict:
        manifest = self.load_manifest()
        if manifest is None:
            raise RuntimeError("run not initialized: call init-run first")
        if stage not in manifest["stages_completed"]:
            manifest["stages_completed"].append(stage)
        manifest["finding_count"] = len(self._load_list(self.paths.findings_path))
        manifest["unknown_count"] = len(self._load_list(self.paths.unknowns_path))
        manifest["human_review_count"] = len(self._load_list(self.paths.human_review_path))
        issues = self._load_list(self.paths.issues_path)
        manifest["warning_count"] = sum(1 for i in issues if i.get("severity") in ("moderate", "minor", "informational"))
        if stage == "cleanup":
            manifest["finished_at"] = now_iso()
        validate_record_or_raise("run_manifest", manifest)
        jsonio.write_json(self.paths.manifest_path, manifest)
        return manifest

    # ---- append-only record lists ----------------------------------
    @staticmethod
    def _load_list(path: Path) -> list:
        if path.exists():
            return jsonio.read_json(path)
        return []

    def _append(self, path: Path, record_type: str, record: dict) -> None:
        validate_record_or_raise(record_type, record)
        items = self._load_list(path)
        items.append(record)
        jsonio.write_json(path, items)

    def add_evidence(self, **kwargs) -> EvidenceItem:
        ordinal = len(self._load_list(self.paths.evidence_index_path)) + 1
        item = EvidenceItem(
            evidence_id=kwargs.pop("evidence_id", make_record_id("ev", self.run_id, ordinal)),
            run_id=self.run_id,
            lane=self.lane,
            collected_at=kwargs.pop("collected_at", now_iso()),
            chain_of_custody=kwargs.pop("chain_of_custody", [{"event": "collected", "actor": f"urf.lanes.{self.lane}", "at": now_iso()}]),
            report_refs=kwargs.pop("report_refs", []),
            **kwargs,
        )
        self._append(self.paths.evidence_index_path, "evidence_item", item.to_dict())
        return item

    def add_finding(self, **kwargs) -> Finding:
        ordinal = len(self._load_list(self.paths.findings_path)) + 1
        finding = Finding(
            finding_id=kwargs.pop("finding_id", make_record_id("fnd", self.run_id, ordinal)),
            run_id=self.run_id,
            lane=self.lane,
            **kwargs,
        )
        self._append(self.paths.findings_path, "finding", finding.to_dict())
        return finding

    def add_issue(self, **kwargs) -> Issue:
        ordinal = len(self._load_list(self.paths.issues_path)) + 1
        issue = Issue(
            issue_id=kwargs.pop("issue_id", make_record_id("iss", self.run_id, ordinal)),
            run_id=self.run_id,
            lane=self.lane,
            detected_at=kwargs.pop("detected_at", now_iso()),
            **kwargs,
        )
        self._append(self.paths.issues_path, "issue", issue.to_dict())
        return issue

    def add_unknown(self, **kwargs) -> Unknown:
        ordinal = len(self._load_list(self.paths.unknowns_path)) + 1
        unk = Unknown(
            unknown_id=kwargs.pop("unknown_id", make_record_id("unk", self.run_id, ordinal)),
            run_id=self.run_id,
            lane=self.lane,
            **kwargs,
        )
        self._append(self.paths.unknowns_path, "unknown", unk.to_dict())
        return unk

    def add_human_review(self, **kwargs) -> HumanReviewRequest:
        ordinal = len(self._load_list(self.paths.human_review_path)) + 1
        req = HumanReviewRequest(
            request_id=kwargs.pop("request_id", make_record_id("hrr", self.run_id, ordinal)),
            run_id=self.run_id,
            lane=self.lane,
            status=kwargs.pop("status", "open"),
            **kwargs,
        )
        self._append(self.paths.human_review_path, "human_review_request", req.to_dict())
        return req

    def save_qa(self, qa: QAResult) -> None:
        validate_record_or_raise("qa_result", qa.to_dict())
        jsonio.write_json(self.paths.qa_path, qa.to_dict())

    def load_qa(self) -> Optional[dict]:
        if self.paths.qa_path.exists():
            return jsonio.read_json(self.paths.qa_path)
        return None

    def save_cleanup(self, record: CleanupRecord) -> None:
        validate_record_or_raise("cleanup_record", record.to_dict())
        jsonio.write_json(self.paths.cleanup_path, record.to_dict())

    # ---- accessors ---------------------------------------------------
    def all_evidence(self) -> list:
        return self._load_list(self.paths.evidence_index_path)

    def all_findings(self) -> list:
        return self._load_list(self.paths.findings_path)

    def all_issues(self) -> list:
        return self._load_list(self.paths.issues_path)

    def all_unknowns(self) -> list:
        return self._load_list(self.paths.unknowns_path)

    def all_human_reviews(self) -> list:
        return self._load_list(self.paths.human_review_path)
