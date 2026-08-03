# Troubleshooting

## `ModuleNotFoundError: No module named '_pathsetup'`
You ran a test module by dotted path from the wrong directory, e.g.
`python3 -m unittest tests.test_economics` from the product root.
`_pathsetup.py` is only importable when `tests/` itself is the current
directory. Fix: `cd tests && python3 -m unittest test_economics -v`
(no `tests.` prefix), or just use `./scripts/run_tests.sh`.

## `ModuleNotFoundError: No module named 'urf'`
`src/` is not on `PYTHONPATH`. Either `export PYTHONPATH=src` before
running `python3 -m urf.cli ...` directly, or use `bin/urf`, which
resolves its own location and sets this up for you.

## `urf: error: unrecognized arguments: --workspace ...`
Only `verify-package` does **not** take `--lane`/`--run-id`/
`--workspace` — it takes `--package PATH` instead (a zip or directory).
Every other subcommand takes `--workspace`. If you're scripting a full
pipeline, don't pass `--workspace` on the `verify-package` call.

## `render` raises `SystemExit` with a claim-safety message
This is the claim-safety gate doing its job (`06_claim_safety.md`),
not a bug. Read the violation category and excerpt in the error
message, then fix the *source* — usually a lane's `lane_meta()`
`executive_summary`/`mandatory_disclaimers`, or a finding's
`statement` text that got pulled into the report — so it no longer
contains a prohibited phrase, an unsupported bare number, an
unverified price mention, or an undisclosed synthetic-data report. Do
not work around this by weakening or removing the scan.

## `qa` exits with status 1
This means `overall_status != "pass"` in the QA result — read
`reports/runs/<run_id>/qa_result.json` (or the `qa` command's own
output) for which `check_id` failed and its `detail`. Common causes:
a finding's `evidence_refs` points at an evidence ID that doesn't
exist (`qa-evidence-refs-resolve`), a finding uses a label outside the
9 allowed values (`qa-finding-labels-valid`), or a finding labeled
`"human-review requirement"` doesn't also set
`human_review_required=True` (`qa-human-review-consistency`). Note
that `package` does **not** itself block on a failed QA result (see
`08_packaging_and_chain_of_custody.md`) — a failed `qa` is a signal to
fix the run, not a hard stop enforced by the code.

## `verify-package` reports mismatches
Read the mismatch list — each entry says exactly which of the three
failure classes occurred (missing file, checksum mismatch, or an
uncovered extra file) and for which path. This means the package
directory or zip was modified after `package` built it. Re-run
`package` from a fresh, unmodified run rather than hand-editing a
package's contents.

## `execute` produces duplicate findings on a re-run
`execute` appends; it is not idempotent by itself
(`02_cli_reference.md`'s resumability note). If you need to re-run a
lane's `execute`, start a fresh `init-run` with a new `--run-id`
(or `--seed`) rather than re-invoking `execute` against an existing
run.

## A schema validation error on `add_evidence`/`add_finding`/etc.
The dataclass field names in `common/models.py` are the source of
truth, not any example you've seen elsewhere. Read the relevant
`@dataclass` (`EvidenceItem`, `Finding`, `Issue`, `Unknown`,
`HumanReviewRequest`, ...) and the matching
`schemas/<record_type>.schema.json` before guessing field names —
`common/schema.py`'s validator raises on unknown/missing/mistyped
fields rather than silently accepting them, by design.

## Everything looks right but a test still fails
Per the project testing rule, never weaken the assertion to make it
pass. Re-derive whether the assertion's expectation was actually wrong
(re-read the source it's asserting against) or whether it caught a
real defect — the latter has happened twice in this codebase already
(`hospital_mrf.py`, `msft_csp.py`; see `10_testing.md`).
