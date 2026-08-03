# Testing

Stdlib `unittest` only — no `pytest`, no third-party test dependency.
Run the whole suite with `./scripts/run_tests.sh` from the product
root, or `cd tests && python3 -m unittest discover -s . -p 'test_*.py'
-v` directly (must run from inside `tests/` — see the note below).

## Current status
**82 tests, 7 modules, all passing** (verified via a fresh run of
`scripts/run_tests.sh` in this documentation pass).

| Module | Tests | Covers |
|---|---|---|
| `test_hashing_jsonio_ids.py` | 13 | `common/hashing.py`, `common/jsonio.py`, `common/ids.py` |
| `test_schema_and_examples.py` | 5 | every schema loads, every example validates, invalid instances are rejected (extra properties, missing required, bad enum) |
| `test_claim_safety.py` | 12 | every prohibited category, unsupported-number, unverified-price, synthetic-disclosure |
| `test_data_safety.py` | 9 | credential/PHI/live-payment patterns, `classify_and_maybe_quarantine` force-to-PROHIBITED |
| `test_packaging_tamper.py` | 6 | build/zip/verify round trip + 4 distinct tamper classes |
| `test_economics.py` | 11 | `recorder.py` real-fact derivation, `pricing.py` scenario arithmetic and labeling |
| `test_lanes_full_pipeline.py` | 26 (generated) | every lane × every fixture, driven through the real CLI subprocess |

`test_lanes_full_pipeline.py`'s 26 tests are not written out
individually — `_make_test(lane, fixture_id)` builds one test function
per `(lane, fixture_id)` pair across all 5 lanes' `FIXTURES` dicts, and
`setattr` attaches each onto `TestLanesFullPipeline` at import time.
`grep -c "def test_"` on that file alone will undercount for this
reason.

## `test_lanes_full_pipeline.py` in detail
This is the one module that exercises the **real runtime entry point**
end to end, per the project rule "exercise real runtime entry points"
— it shells out to `python3 -m urf.cli` via `subprocess.run` for every
stage (`init-run` → `validate-input` → `execute` → `qa` → `render` →
`package` → `verify-package` → `cleanup`), not an in-process shortcut,
using an isolated `--workspace` temp directory per test.

Two invariants it asserts for every combination:
1. `findings.json` is non-empty.
2. Human-review consistency: for the four decision lanes
   (`msft_csp`, `agency_rfp`, `accessibility`, `lead_path` —
   `LANES_WITH_BLOCKED_CONCLUSION`) at least one finding is labeled
   `"blocked conclusion"` and at least one human-review request
   exists. For `hospital_mrf` (a data-integrity lane, not a decision
   lane — it never reaches a blocked-conclusion finding by design),
   any finding flagged `human_review_required=True` must have at least
   one matching `human_review_request` on disk; clean input (zero
   flagged findings) correctly produces zero requests.

This test module is what surfaced the two real production defects
fixed this session (see `05_lane_reference.md`'s cross-lane invariant
note and the `hospital_mrf.py`/`msft_csp.py` source) — a
`human_review_required=True` finding with no matching request is an
audit-trail dead end, and the test was written to catch exactly that.

## Running a single module
```
cd tests
python3 -m unittest test_economics -v
```
Running `python3 -m unittest tests.test_economics` from the product
root fails with `ModuleNotFoundError: No module named '_pathsetup'` —
`_pathsetup.py` (which inserts `src/` onto `sys.path`) is a sibling
module only importable when `tests/` itself is the working directory
and is on `sys.path`, which the dotted `tests.<module>` invocation
does not arrange. Always `cd tests` first.

## Adding a test
Follow the existing pattern: import via `_pathsetup` (implicitly, by
being colocated in `tests/`), build inputs with the real dataclasses
and schemas (not hand-rolled dicts with guessed field names — read
`common/models.py` and the relevant `schemas/*.schema.json` file
first), and never weaken an assertion to make a new test pass — if a
strengthened assertion fails, that is a signal to look for a real
defect before deciding it's a test-authoring mistake.
