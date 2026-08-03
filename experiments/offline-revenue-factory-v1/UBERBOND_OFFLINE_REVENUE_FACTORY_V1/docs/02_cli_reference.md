# CLI reference

Entry point: `python3 -m urf.cli <subcommand> [options]` (from `src/`
on `PYTHONPATH`, or via `bin/urf` which sets this up). Every
subcommand is synchronous, makes no network requests, and writes only
under the resolved workspace.

## Global pattern
Every subcommand except `verify-package` takes:
- `--lane {msft_csp,hospital_mrf,agency_rfp,accessibility,lead_path}` (required)
- `--run-id ID` (required after `init-run`; optional on `init-run`, where omitting it derives one — see below)
- `--fixture NAME` (required on `init-run`, ignored/optional afterward — the manifest remembers it)
- `--workspace DIR` (optional; defaults to the product root)

## Subcommands, in pipeline order
1. **`init-run`** — creates the run manifest, hashes every input fixture file (`input_hashes`), captures `git_commit` (read directly from `.git/HEAD`, never a subprocess). `--seed S` makes the run_id deterministic (`sha256(lane:fixture:seed)[:12]`) instead of random.
2. **`validate-input`** — calls the lane's `validate_input(fixture_dir)`; records issues (critical/serious/moderate/minor).
3. **`execute`** — calls the lane's `execute(run_ctx, fixture_dir)`; this is where all evidence/findings/unknowns/human_review_requests are produced.
4. **`qa`** — runs base checks (`lanes/base.py`) plus the lane's own `qa_checks(run_ctx)`; exits 1 if `overall_status != "pass"`.
5. **`render`** — builds a `Report` record for `--template {direct_buyer,white_label_partner,internal_qa,technical_appendix}`, runs the claim-safety scan over the executive summary + limitations, and writes markdown/html/json/evidence-index-csv. **Blocks (raises `SystemExit`) if the claim-safety scan finds a violation.**
6. **`package`** — builds the package directory (report, evidence index, findings, registers, manifest, qa result, `CHECKSUMS.sha256`) and zips it. Updates the manifest's `final_package_hash`/`qa_ref`.
7. **`cleanup`** — removes only the run's `tmp/` scratch directory; everything else is retained.
8. **`verify-package`** — takes `--package PATH` (zip or directory, no `--lane`/`--run-id`/`--workspace`). Recomputes every checksum and reports `OK` or a list of mismatches; exits 1 on any mismatch.

## Resumability
Every stage reads whatever prior-stage state already exists on disk
and appends `stages_completed`. Re-running an already-completed stage
is safe (idempotent for `validate-input`/`qa`/`render`/`package`;
`execute` will append duplicate findings if re-run without a fresh
`init-run` — always start a new run rather than re-executing).

## Exit codes
`0` on success. `qa` and `verify-package` return `1` on a failed
check/mismatch (not an exception) so they compose in shell scripts.
Missing-manifest / unknown-lane / unknown-fixture errors raise
`SystemExit` with a message, also non-zero.
