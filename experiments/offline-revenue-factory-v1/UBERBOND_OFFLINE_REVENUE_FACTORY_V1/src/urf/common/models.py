"""Dataclasses for the common evidence model, matched 1:1 to schemas/*.schema.json.

Every record type here corresponds to exactly one schema file. `SCHEMA_REGISTRY`
maps record type name -> schema filename, used by validate_all_examples() and
by the run pipeline to validate every record it emits before writing it.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional

SCHEMA_REGISTRY = {
    "evidence_item": "evidence_item.schema.json",
    "source_artifact": "source_artifact.schema.json",
    "finding": "finding.schema.json",
    "issue": "issue.schema.json",
    "unknown": "unknown.schema.json",
    "human_review_request": "human_review_request.schema.json",
    "report": "report.schema.json",
    "run_manifest": "run_manifest.schema.json",
    "qa_result": "qa_result.schema.json",
    "delivery_acceptance": "delivery_acceptance.schema.json",
    "cleanup_record": "cleanup_record.schema.json",
}

FINDING_LABELS = [
    "observed fact", "parsed fact", "deterministic calculation", "source-derived rule",
    "model interpretation", "assumption", "unknown", "blocked conclusion",
    "human-review requirement",
]

DATA_CLASSES = [
    "PUBLIC", "SYNTHETIC", "CUSTOMER_PROVIDED", "CONFIDENTIAL",
    "PERSONAL_DATA", "PHI", "CREDENTIAL", "PROHIBITED",
]


def _clean(d: dict) -> dict:
    return {k: v for k, v in d.items()}


@dataclass
class EvidenceItem:
    evidence_id: str
    run_id: str
    lane: str
    source_type: str
    source_path: str
    source_hash: Optional[str]
    collected_at: str
    data_classification: str
    observed_value: Any
    parser: str
    parser_version: str
    deterministic_transform: Optional[str]
    confidence: str
    limitation: str
    prohibited_interpretation: str
    human_review_required: bool
    chain_of_custody: list = field(default_factory=list)
    report_refs: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "evidence_item"


@dataclass
class SourceArtifact:
    artifact_id: str
    lane: str
    path: str
    sha256: str
    byte_size: int
    format: str
    data_classification: str
    collected_at: str

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "source_artifact"


@dataclass
class Finding:
    finding_id: str
    run_id: str
    lane: str
    label: str
    statement: str
    evidence_refs: list
    confidence: str
    human_review_required: bool
    blocked_reason: Optional[str] = None

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "finding"


@dataclass
class Issue:
    issue_id: str
    run_id: str
    lane: str
    severity: str
    category: str
    description: str
    detected_at: str
    source_path: Optional[str] = None

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "issue"


@dataclass
class Unknown:
    unknown_id: str
    run_id: str
    lane: str
    question: str
    reason: str
    blocking: bool

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "unknown"


@dataclass
class HumanReviewRequest:
    request_id: str
    run_id: str
    lane: str
    reason: str
    required_role: str
    blocking: bool
    status: str

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "human_review_request"


@dataclass
class Report:
    report_id: str
    run_id: str
    lane: str
    template: str
    executive_summary: str
    scope: list
    exclusions: list
    inputs: list
    methods: list
    findings: list
    evidence_refs: list
    unknowns: list
    blocked_conclusions: list
    human_review_requirements: list
    limitations: list
    delivery_acceptance_ref: Optional[str]
    run_manifest_ref: str
    checksum: Optional[str]
    generated_at: str

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "report"


@dataclass
class RunManifest:
    run_id: str
    lane: str
    fixture_id: str
    input_hashes: dict
    software_version: str
    started_at: str
    finished_at: Optional[str]
    stages_completed: list
    finding_count: int
    unknown_count: int
    warning_count: int
    human_review_count: int
    qa_ref: Optional[str]
    final_package_hash: Optional[str]
    git_commit: Optional[str]

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "run_manifest"


@dataclass
class QAResult:
    qa_id: str
    run_id: str
    lane: str
    checks: list
    passed: int
    failed: int
    overall_status: str
    evaluated_at: str

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "qa_result"


@dataclass
class DeliveryAcceptance:
    acceptance_id: str
    run_id: str
    lane: str
    buyer_role: str
    acceptance_criteria: list
    signed: bool
    signed_at: Optional[str]
    notes: str

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "delivery_acceptance"


@dataclass
class CleanupRecord:
    cleanup_id: str
    run_id: str
    lane: str
    removed_paths: list
    retained_paths: list
    performed_at: str

    def to_dict(self) -> dict:
        return _clean(asdict(self))

    record_type = "cleanup_record"
