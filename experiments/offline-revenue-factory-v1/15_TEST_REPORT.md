# Test report

All results below are from a fresh run performed during this
documentation/assembly pass, not carried over from an earlier claim.

## Self-test suite
```
$ ./scripts/run_tests.sh
...
----------------------------------------------------------------------
Ran 82 tests in 15.682s

OK
```
**82/82 tests passed, 0 failed, 0 errored, 7 modules.**

| Module | Tests | Covers |
|---|---|---|
| `test_hashing_jsonio_ids.py` | 13 | hashing, JSON I/O, deterministic/seeded run IDs |
| `test_schema_and_examples.py` | 5 | every schema loads; every example validates; invalid instances rejected |
| `test_claim_safety.py` | 12 | every prohibited-claim category; unsupported-number; unverified-price; synthetic-disclosure |
| `test_data_safety.py` | 9 | credential/PHI/live-payment detection; force-to-PROHIBITED |
| `test_packaging_tamper.py` | 6 | build/zip/verify round trip + 4 tamper classes |
| `test_economics.py` | 11 | real-fact recorder; labeled-assumption pricing scenarios |
| `test_lanes_full_pipeline.py` | 26 (generated, one per lane×fixture) | real CLI subprocess, all 5 lanes, all fixtures, no-fabrication invariant |

## Compilation
```
$ python3 -m py_compile $(find src -name '*.py')
```
31 Python files compiled with zero errors.

## JSON/schema validation
```
22 JSON files parsed OK (schemas/ + examples/)
```
plus `test_schema_and_examples.py`'s dedicated validation of every
schema against its own example and rejection tests for invalid
instances.

## No network requests
```
$ grep -rniE "urllib\.request|http\.client|socket\.(socket|connect)|requests\.(get|post)|subprocess\." src --include="*.py"
(no matches)
```
No networking or subprocess-spawning code exists anywhere in `src/`.
Every CLI subcommand is synchronous and file-system-only.

## No credentials or PHI in generated artifacts
Ran the product's own `data_safety.classify.scan_for_prohibited`
scanner (credential + PHI + live-payment patterns) directly against
every generated artifact:
```
checked 82 JSON files under example_deliveries/, 0 prohibited-pattern hits
checked 99 additional files (example_deliveries/*.md, *.html, *.csv,
  fixtures/**/*.json, examples/*.json), 0 prohibited-pattern hits
```
**181 files scanned, 0 hits**, across every generated example delivery,
every fixture, and every schema example.

## Checksums and tamper detection
- `test_packaging_tamper.py` proves `verify_package_dir` catches
  content mutation, a missing file, an uncovered extra file, and a
  missing `CHECKSUMS.sha256` — 4 dedicated tests, all passing.
- All 5 real example-delivery zips were independently re-verified
  during this pass:
```
$ python3 -m urf.cli verify-package --package example_deliveries/msft_csp/reports/runs/example-msft_csp/example-msft_csp.zip
verify-package: OK
(...identical OK result for hospital_mrf, agency_rfp, accessibility, lead_path...)
```

## No writes outside the workspace
Every self-test that runs the CLI (`test_lanes_full_pipeline.py`,
`test_packaging_tamper.py`) does so inside an isolated `--workspace`
temp directory; nothing in the CLI or lane code references an
absolute or repository-root path other than the resolved `Workspace`.

## Cleanup
`tmp/` scratch directories for all in-repo test workspaces are removed
by their own test teardown / the `cleanup` CLI stage; no stray temp
files were left in the product tree by this pass.

## Nothing hidden
No test was skipped, no assertion was weakened to make a failure pass,
and every number in this report was produced by a command run during
this documentation pass, not asserted from memory.
