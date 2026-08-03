"""Packaging and chain-of-custody (mission Phase 12).

`build_package` assembles one run's report, evidence index, source
hashes, run manifest, QA result, unknown register, human-review
register, cleanup record, and a CHECKSUMS.sha256 covering every other
file in the package. `verify_package` recomputes those hashes and
confirms they match — any change after packaging invalidates
verification, which is exercised directly by the tamper-detection
self-test.
"""
from __future__ import annotations

import zipfile
from pathlib import Path

from ..common import jsonio
from ..common.hashing import sha256_file
from ..common.models import CleanupRecord
from ..common.runstore import RunContext, now_iso
from ..common.validation import validate_record_or_raise

CHECKSUMS_NAME = "CHECKSUMS.sha256"


def build_package_dir(run_ctx: RunContext, report: dict, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)

    jsonio.write_json(dest_dir / "report.json", report)
    (dest_dir / "evidence_index.json").write_text(
        jsonio.json.dumps(run_ctx.all_evidence(), indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (dest_dir / "findings.json").write_text(
        jsonio.json.dumps(run_ctx.all_findings(), indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    jsonio.write_json(dest_dir / "unknown_register.json", run_ctx.all_unknowns())
    jsonio.write_json(dest_dir / "human_review_register.json", run_ctx.all_human_reviews())
    jsonio.write_json(dest_dir / "issue_register.json", run_ctx.all_issues())

    manifest = run_ctx.load_manifest()
    if manifest is None:
        raise RuntimeError("cannot package a run with no manifest")
    jsonio.write_json(dest_dir / "run_manifest.json", manifest)

    qa = run_ctx.load_qa()
    if qa is None:
        raise RuntimeError("cannot package a run before qa has been run")
    jsonio.write_json(dest_dir / "qa_result.json", qa)

    # checksums over every file written so far (order matters not; sorted output)
    lines = []
    for p in sorted(dest_dir.rglob("*")):
        if p.is_file():
            lines.append(f"{sha256_file(p)}  {p.relative_to(dest_dir)}")
    (dest_dir / CHECKSUMS_NAME).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return dest_dir


def zip_package_dir(dest_dir: Path, zip_path: Path) -> Path:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(dest_dir.rglob("*")):
            if p.is_file():
                zf.write(p, arcname=str(p.relative_to(dest_dir)))
    return zip_path


def verify_package_dir(dest_dir: Path) -> tuple:
    """Returns (ok: bool, mismatches: list[str])."""
    checksum_file = dest_dir / CHECKSUMS_NAME
    if not checksum_file.exists():
        return False, [f"missing {CHECKSUMS_NAME}"]
    mismatches = []
    recorded = {}
    for line in checksum_file.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        digest, _, relpath = line.partition("  ")
        recorded[relpath] = digest
    for relpath, digest in recorded.items():
        p = dest_dir / relpath
        if not p.exists():
            mismatches.append(f"missing file listed in checksums: {relpath}")
            continue
        actual = sha256_file(p)
        if actual != digest:
            mismatches.append(f"checksum mismatch: {relpath} (expected {digest}, got {actual})")
    for p in sorted(dest_dir.rglob("*")):
        if p.is_file() and p.name != CHECKSUMS_NAME:
            rel = str(p.relative_to(dest_dir))
            if rel not in recorded:
                mismatches.append(f"file present but not covered by checksums: {rel}")
    return (not mismatches), mismatches


def cleanup_run(run_ctx: RunContext) -> dict:
    """Removes the run's tmp/ scratch directory, retains everything else."""
    removed = []
    tmp_dir = run_ctx.paths.run_dir_tmp
    if tmp_dir.exists():
        for p in sorted(tmp_dir.rglob("*"), reverse=True):
            if p.is_file():
                p.unlink()
                removed.append(str(p))
            elif p.is_dir():
                p.rmdir()
        if tmp_dir.exists():
            tmp_dir.rmdir()
            removed.append(str(tmp_dir))
    retained = [str(run_ctx.paths.run_dir_reports), str(run_ctx.paths.run_dir_evidence), str(run_ctx.paths.run_dir_logs)]
    record = CleanupRecord(
        cleanup_id=f"cln-{run_ctx.run_id}",
        run_id=run_ctx.run_id,
        lane=run_ctx.lane,
        removed_paths=removed,
        retained_paths=retained,
        performed_at=now_iso(),
    )
    validate_record_or_raise("cleanup_record", record.to_dict())
    run_ctx.save_cleanup(record)
    return record.to_dict()
