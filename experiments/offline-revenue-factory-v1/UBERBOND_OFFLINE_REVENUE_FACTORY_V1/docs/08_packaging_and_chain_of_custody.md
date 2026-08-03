# Packaging and chain of custody

`src/urf/packaging/package.py` turns a completed run into a
self-verifying delivery package.

## `build_package_dir(run_ctx, report, dest_dir)`
Writes, into `dest_dir`:
- `report.json` (the report record passed in)
- `evidence_index.json` — `run_ctx.all_evidence()`
- `findings.json` — `run_ctx.all_findings()`
- `unknown_register.json` — `run_ctx.all_unknowns()`
- `human_review_register.json` — `run_ctx.all_human_reviews()`
- `issue_register.json` — `run_ctx.all_issues()`
- `run_manifest.json` — the run's manifest (raises `RuntimeError` if
  the run has no manifest yet)
- `qa_result.json` — the run's QA result (raises `RuntimeError` if `qa`
  has not been run yet — this is the one hard precondition `package`
  enforces in code)
- `CHECKSUMS.sha256` — one `sha256  relative/path` line per file
  written above, computed **after** every other file exists, so it
  covers all of them

Note precisely what `build_package_dir` does *not* check: it requires a
QA result to exist, but does not inspect whether that QA result's
`overall_status` is `"pass"`. A failed-QA run can still be packaged by
the code. See `03_architecture.md`'s "safety gates are structural, not
advisory" section — this particular gate is a documented, deliberate
gap: the discipline is enforced by process (`04_delivery_checklist.md`
in `templates/commercial/`), not by the packaging code.

## `zip_package_dir(dest_dir, zip_path)`
Zips every file under `dest_dir` (sorted order, `ZIP_DEFLATED`) with
paths relative to `dest_dir`, so the zip's internal layout matches the
directory's.

## `verify_package_dir(dest_dir) -> (ok, mismatches)`
Independently recomputes SHA-256 for every file `CHECKSUMS.sha256`
lists and compares. Reports three distinct failure classes, not just a
single pass/fail bit:
1. a listed file is missing from disk,
2. a listed file's recomputed hash does not match the recorded hash
   (content was altered after packaging),
3. a file exists on disk but is **not** listed in `CHECKSUMS.sha256`
   (something was added after packaging without going through the
   packaging step).

If `CHECKSUMS.sha256` itself is missing, verification fails
immediately with that single mismatch rather than silently treating
the directory as valid.

## `cleanup_run(run_ctx)`
Removes only the run's `tmp/` scratch directory (deepest-first
delete, including the directory itself once empty). `reports/`,
`evidence/`, and `logs/` for the run are explicitly retained — cleanup
is disk hygiene, not evidence destruction. Writes a `CleanupRecord`
(`removed_paths`, `retained_paths`, `performed_at`) so the cleanup
itself is part of the auditable record.

## CLI wiring
`cli.py`'s `package` subcommand calls `build_package_dir` then
`zip_package_dir` and updates the run manifest's
`final_package_hash`/`qa_ref`. `verify-package` is the only subcommand
that takes `--package PATH` instead of `--lane`/`--run-id`/`--workspace`
— it operates on a zip or directory path directly and exits `1` on any
mismatch, so it composes in shell scripts as a standalone integrity
check independent of any run state.

## Test coverage
`tests/test_packaging_tamper.py` — 6 tests, all passing: a full
build-then-verify round trip on a minimal but schema-valid run,
`zip_package_dir` producing a real zip, and one test per tamper class
(content mutation, missing file, uncovered extra file, missing
`CHECKSUMS.sha256`) proving `verify_package_dir` actually catches each
one rather than passing by omission.
