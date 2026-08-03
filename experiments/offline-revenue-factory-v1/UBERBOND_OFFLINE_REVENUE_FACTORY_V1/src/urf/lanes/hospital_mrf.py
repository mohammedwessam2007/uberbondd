"""Lane 2: Hospital price-transparency MRF integrity evidence pack (mission Phase 4).

Local-file workflow only: every "HTTP metadata" fixture here is captured
metadata (content-type, redirect chain, final URL) supplied as a local
JSON fixture, not a live network fetch. This lane never certifies
compliance, price accuracy, completeness, or legal sufficiency — every
finding it produces says so explicitly, and QA checks enforce it.
"""
from __future__ import annotations

import datetime as _dt
import gzip
import json
from pathlib import Path

from ..common.hashing import sha256_file
from ..common.jsonio import DuplicateKeyError, load_json_strict

FIXTURES = {
    "valid": "valid",
    "malformed": "malformed",
    "missing_fields": "missing_fields",
    "stale": "stale",
    "duplicate_keys": "duplicate_keys",
    "compressed": "compressed",
}

METADATA_FILENAMES = {"http_metadata.json", "filename_metadata.json", "link_map.json", "root_mrf_list.txt"}

REQUIRED_STRUCTURAL_FIELDS = [
    "hospital_name", "last_updated_on", "hospital_location", "hospital_address",
    "license_information", "standard_charge_information",
]

STALE_THRESHOLD_DAYS = 365
NEVER_A_CERTIFICATION = [
    "This evidence pack does not certify price-transparency compliance.",
    "This evidence pack does not certify price accuracy.",
    "This evidence pack does not certify completeness.",
    "This evidence pack does not certify legal sufficiency.",
]


def _mrf_candidate_files(fixture_dir: Path) -> list[Path]:
    return sorted(p for p in fixture_dir.iterdir() if p.is_file() and p.name not in METADATA_FILENAMES)


def _read_metadata(fixture_dir: Path, name: str):
    p = fixture_dir / name
    if not p.exists():
        return None
    if p.suffix == ".txt":
        return p.read_text(encoding="utf-8")
    return json.loads(p.read_text(encoding="utf-8"))


def validate_input(fixture_dir: Path) -> list[dict]:
    issues = []
    candidates = _mrf_candidate_files(fixture_dir)
    if not candidates:
        issues.append({
            "severity": "critical",
            "category": "no_mrf_candidate_file",
            "description": f"No MRF candidate file found in fixture {fixture_dir.name}.",
            "source_path": str(fixture_dir),
        })
    for name in ("http_metadata.json", "filename_metadata.json", "link_map.json"):
        if not (fixture_dir / name).exists():
            issues.append({
                "severity": "minor",
                "category": "missing_metadata_file",
                "description": f"Optional metadata file '{name}' absent from fixture {fixture_dir.name}.",
                "source_path": str(fixture_dir / name),
            })
    return issues


def _detect_compression(path: Path) -> str:
    with open(path, "rb") as fh:
        magic = fh.read(2)
    if magic == b"\x1f\x8b":
        return "gzip"
    return "none"


def _load_mrf_text(path: Path, compression: str) -> str:
    if compression == "gzip":
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            return fh.read()
    return path.read_text(encoding="utf-8")


def execute(run_ctx, fixture_dir: Path) -> None:
    http_meta = _read_metadata(fixture_dir, "http_metadata.json")
    filename_meta = _read_metadata(fixture_dir, "filename_metadata.json")
    link_map = _read_metadata(fixture_dir, "link_map.json")
    root_txt = _read_metadata(fixture_dir, "root_mrf_list.txt")

    for name, value in (("http_metadata", http_meta), ("filename_metadata", filename_meta),
                         ("link_map", link_map), ("root_mrf_list.txt", root_txt)):
        if value is None:
            run_ctx.add_unknown(
                question=f"What does the {name} metadata contain for this fixture?",
                reason=f"{name} file absent from fixture {fixture_dir.name}.",
                blocking=False,
            )
        else:
            run_ctx.add_evidence(
                source_type="local_file",
                source_path=str(fixture_dir / (name if name.endswith(".txt") else f"{name}.json")),
                source_hash=None,
                data_classification="SYNTHETIC",
                observed_value=value,
                parser="hospital_mrf.metadata_reader",
                parser_version="1.0.0",
                deterministic_transform=None,
                confidence="high",
                limitation="Locally supplied metadata; not a live HTTP capture.",
                prohibited_interpretation="Does not certify the source URL's live availability or content.",
                human_review_required=False,
            )

    for candidate in _mrf_candidate_files(fixture_dir):
        digest = sha256_file(candidate)
        size = candidate.stat().st_size
        compression = _detect_compression(candidate)
        run_ctx.add_evidence(
            source_type="local_file",
            source_path=str(candidate),
            source_hash=digest,
            data_classification="SYNTHETIC",
            observed_value={"byte_size": size, "compression": compression},
            parser="hospital_mrf.file_stat",
            parser_version="1.0.0",
            deterministic_transform="sha256+stat",
            confidence="high",
            limitation="Hash and size only establish file identity, not content correctness.",
            prohibited_interpretation="Do not treat as a validity or compliance signal by itself.",
            human_review_required=False,
        )
        run_ctx.add_finding(
            label="deterministic calculation",
            statement=f"File {candidate.name} hashes to sha256:{digest} ({size} bytes, compression={compression}).",
            evidence_refs=[],
            confidence="high",
            human_review_required=False,
        )

        try:
            text = _load_mrf_text(candidate, compression)
        except OSError as exc:
            run_ctx.add_finding(
                label="parsed fact",
                statement=f"Failed to read {candidate.name} after decompression attempt: {exc}",
                evidence_refs=[],
                confidence="high",
                human_review_required=True,
            )
            continue

        if compression == "gzip":
            try:
                data = json.loads(text, object_pairs_hook=_dup_check)
            except DuplicateKeyError as exc:
                _record_duplicate_key(run_ctx, candidate, exc)
                continue
            except json.JSONDecodeError as exc:
                _record_parse_failure(run_ctx, candidate, exc)
                continue
        else:
            try:
                data = load_json_strict(candidate)
            except DuplicateKeyError as exc:
                _record_duplicate_key(run_ctx, candidate, exc)
                continue
            except json.JSONDecodeError as exc:
                _record_parse_failure(run_ctx, candidate, exc)
                continue

        _check_structure(run_ctx, candidate, data)
        _check_staleness(run_ctx, candidate, data)

    _validate_link_map(run_ctx, fixture_dir, link_map)


def _dup_check(pairs):
    seen = {}
    for k, v in pairs:
        if k in seen:
            raise DuplicateKeyError(k)
        seen[k] = v
    return seen


def _record_duplicate_key(run_ctx, candidate: Path, exc: DuplicateKeyError) -> None:
    run_ctx.add_finding(
        label="parsed fact",
        statement=f"Duplicate top-level or nested key detected while parsing {candidate.name}: {exc.key!r}.",
        evidence_refs=[],
        confidence="high",
        human_review_required=True,
    )
    run_ctx.add_issue(
        severity="serious", category="duplicate_field",
        description=f"Duplicate key {exc.key!r} in {candidate.name}.",
        source_path=str(candidate),
    )
    run_ctx.add_human_review(
        reason=f"{candidate.name} contains duplicate key {exc.key!r}; a human must determine which value is authoritative.",
        required_role="owner",
        blocking=True,
    )


def _record_parse_failure(run_ctx, candidate: Path, exc: Exception) -> None:
    run_ctx.add_finding(
        label="parsed fact",
        statement=f"{candidate.name} failed to parse as JSON: {exc}",
        evidence_refs=[],
        confidence="high",
        human_review_required=True,
    )
    run_ctx.add_issue(
        severity="critical", category="parse_failure",
        description=f"JSON parse failure in {candidate.name}: {exc}",
        source_path=str(candidate),
    )
    run_ctx.add_human_review(
        reason=f"{candidate.name} could not be parsed; a human must inspect the source file directly.",
        required_role="owner",
        blocking=True,
    )


def _check_structure(run_ctx, candidate: Path, data) -> None:
    if not isinstance(data, dict):
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"{candidate.name} top level is not a JSON object; structural checks skipped.",
            evidence_refs=[],
            confidence="high",
            human_review_required=True,
        )
        run_ctx.add_human_review(
            reason=f"{candidate.name} top-level JSON value is not an object; a human must inspect the source "
                   "file directly to determine its actual structure.",
            required_role="owner",
            blocking=True,
        )
        return
    missing = [f for f in REQUIRED_STRUCTURAL_FIELDS if f not in data]
    if missing:
        run_ctx.add_issue(
            severity="serious", category="structural_field_missing",
            description=f"{candidate.name} is missing required field(s): {missing}",
            source_path=str(candidate),
        )
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"{candidate.name} is missing required structural field(s): {missing}.",
            evidence_refs=[],
            confidence="high",
            human_review_required=True,
        )
        run_ctx.add_human_review(
            reason=f"{candidate.name} is missing required structural field(s) {missing}; a human must confirm "
                   "whether the source file is incomplete or the schema expectation is wrong.",
            required_role="owner",
            blocking=False,
        )
    else:
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"{candidate.name} contains all {len(REQUIRED_STRUCTURAL_FIELDS)} required structural fields.",
            evidence_refs=[],
            confidence="high",
            human_review_required=False,
        )
    charges = data.get("standard_charge_information")
    if isinstance(charges, list):
        run_ctx.add_finding(
            label="deterministic calculation",
            statement=f"{candidate.name} contains an estimated {len(charges)} standard_charge_information row(s).",
            evidence_refs=[],
            confidence="high",
            human_review_required=False,
        )


def _check_staleness(run_ctx, candidate: Path, data) -> None:
    if not isinstance(data, dict) or "last_updated_on" not in data:
        return
    raw = data["last_updated_on"]
    try:
        updated = _dt.datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=_dt.timezone.utc)
    except (ValueError, TypeError):
        run_ctx.add_finding(
            label="parsed fact",
            statement=f"{candidate.name} field last_updated_on={raw!r} is not in YYYY-MM-DD format.",
            evidence_refs=[],
            confidence="high",
            human_review_required=True,
        )
        run_ctx.add_human_review(
            reason=f"{candidate.name} last_updated_on={raw!r} is not in YYYY-MM-DD format; a human must confirm "
                   "the file's actual currency before use.",
            required_role="owner",
            blocking=False,
        )
        return
    age_days = (_dt.datetime.now(_dt.timezone.utc) - updated).days
    stale = age_days > STALE_THRESHOLD_DAYS
    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"{candidate.name} last_updated_on is {age_days} day(s) old "
                  f"({'stale' if stale else 'within'} the {STALE_THRESHOLD_DAYS}-day freshness threshold).",
        evidence_refs=[],
        confidence="high",
        human_review_required=stale,
    )
    if stale:
        run_ctx.add_human_review(
            reason=f"{candidate.name} update indicator is older than {STALE_THRESHOLD_DAYS} days; confirm currency "
                   "before using in any buyer-facing evidence pack.",
            required_role="owner",
            blocking=False,
        )


def _validate_link_map(run_ctx, fixture_dir: Path, link_map) -> None:
    if not link_map:
        return
    linked = link_map.get("linked_files", [])
    missing_targets = [f for f in linked if not (fixture_dir / f).exists()]
    run_ctx.add_finding(
        label="deterministic calculation",
        statement=f"Local link-map check: {len(linked) - len(missing_targets)}/{len(linked)} referenced "
                  f"file(s) resolve locally.",
        evidence_refs=[],
        confidence="high",
        human_review_required=bool(missing_targets),
    )
    if missing_targets:
        run_ctx.add_issue(
            severity="moderate", category="broken_local_link",
            description=f"Link map references file(s) not present locally: {missing_targets}",
            source_path=str(fixture_dir / "link_map.json"),
        )


def qa_checks(run_ctx) -> list[dict]:
    findings = run_ctx.all_findings()
    forbidden_terms = ("is compliant", "certified compliant", "price accuracy confirmed", "legally sufficient")
    violations = [f for f in findings if any(t in f["statement"].lower() for t in forbidden_terms)]
    return [{
        "check_id": "qa-no-compliance-certification",
        "description": "No finding certifies compliance, price accuracy, or legal sufficiency",
        "status": "pass" if not violations else "fail",
        "detail": None if not violations else f"{len(violations)} suspect finding(s)",
    }]


def lane_meta() -> dict:
    return {
        "executive_summary": (
            "Structural and integrity evidence pack for a hospital price-transparency machine-readable file "
            "(MRF), built entirely from local synthetic fixtures. " + " ".join(NEVER_A_CERTIFICATION)
        ),
        "scope": [
            "File hashing, size, and compression detection.",
            "JSON structural-field and duplicate-field checks.",
            "Update-indicator staleness calculation.",
            "Local link-map validation (no live crawling).",
        ],
        "exclusions": [
            "No live HTTP fetch of any hospital website is performed.",
            "No price accuracy, completeness, or legal-sufficiency certification is issued.",
            "No CMS/regulator submission or attestation is made.",
        ],
        "methods": [
            "sha256 file hashing and byte-size measurement.",
            "gzip magic-byte compression detection.",
            "Strict JSON parsing with duplicate-key detection.",
            "Structural-field presence check against a fixed required-field list.",
            "Update-indicator age calculation against a 365-day threshold.",
        ],
        "mandatory_disclaimers": NEVER_A_CERTIFICATION,
        "buyer_role": "hospital compliance owner or white-label agency partner",
    }
