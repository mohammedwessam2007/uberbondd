# Common QA engine

Pointer directory — the real implementation lives in the product tree:

- Shared QA runner: `../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/src/urf/lanes/base.py::run_qa`
- Per-lane extra checks: each lane module's own `qa_checks(run_ctx)`

## 3 base checks, run for every lane
1. `qa-evidence-refs-resolve` — every finding's `evidence_refs` resolve
   to an existing evidence item; fails if any reference is dangling.
2. `qa-finding-labels-valid` — every finding carries one of the 9
   required labels.
3. `qa-human-review-consistency` — every finding labeled
   `"human-review requirement"` also sets `human_review_required=True`.

Each lane's `qa_checks(run_ctx)` returns additional lane-specific
checks (e.g. certification-ban checks, structural checks) that are
appended to these 3 before the overall `qa_result` is computed and
saved.

## Result shape
`{qa_id, run_id, lane, checks: [{check_id, description, status
(pass|fail|skipped), detail}], passed, failed, overall_status
(pass|fail), evaluated_at}` — schema at
`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/schemas/qa_result.schema.json`.

## Enforcement
The `qa` CLI subcommand exits `1` if `overall_status != "pass"`, so it
composes as a hard gate in shell scripts
(`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/02_cli_reference.md`).
Note the one documented gap: `package` does not itself re-check QA
status before packaging — see
`../UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/08_packaging_and_chain_of_custody.md`.

## Proof
All 5 generated example deliveries pass their full QA check set (see
`14_FIVE_EXAMPLE_DELIVERIES/`), and `tests/test_lanes_full_pipeline.py`
runs `qa` for all 26 lane×fixture combinations as part of the real CLI
pipeline.
