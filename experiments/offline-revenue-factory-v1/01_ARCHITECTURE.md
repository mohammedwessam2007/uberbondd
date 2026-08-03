# Architecture

Full detail lives in `UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/03_architecture.md`;
this is the mission-level summary.

## Layout
```
UBERBOND_OFFLINE_REVENUE_FACTORY_V1/
  src/urf/
    common/        schema validator, models, hashing, jsonio, ids, paths, runstore, validation
    lanes/         one module per lane + base.py (shared report/qa/acceptance helpers)
    claim_safety/  regex-based outbound-claim scanner
    data_safety/   regex-based credential/PHI/live-payment scanner
    packaging/     build/zip/verify a delivery package, checksums
    report_engine/ 4 role-based templates + markdown/html/json/csv rendering
    economics/     real-fact recorder + labeled-assumption pricing calculator
    cli.py         the one entry point wiring all of the above together
  schemas/ fixtures/ templates/commercial/ examples/ example_deliveries/ docs/ tests/ scripts/
```

## One pipeline, five lanes
Every lane runs through the identical 8-stage CLI pipeline
(`init-run → validate-input → execute → qa → render → package →
cleanup → verify-package`). A lane is one module satisfying a 5-function
contract (`FIXTURES`, `validate_input`, `execute`, `qa_checks`,
`lane_meta`) — `cli.py` has no lane-specific branches. Adding a sixth
lane requires no change to `cli.py` itself
(`UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/11_adding_a_new_lane.md`).

## One evidence model, everywhere
11 record types (`evidence_item`, `source_artifact`, `finding`,
`issue`, `unknown`, `human_review_request`, `report`, `run_manifest`,
`qa_result`, `delivery_acceptance`, `cleanup_record`), each a
dataclass with a matching JSON Schema, validated before every disk
write. No lane can bypass this — `RunContext`'s `add_*` methods all
call `validate_record_or_raise` first.

## Structural safety gates, not advisory text
- Claim safety blocks `render` on a prohibited claim.
- Data safety force-reclassifies prohibited-pattern evidence to
  `PROHIBITED`.
- Chain-of-custody checksums make packaging tamper-evident.

None of these are policy documents alone — each is enforced by code
the self-test suite exercises directly.

## Resumable, disk-backed state
Every run is identified by a `run_id` and lives entirely under a
resolved `Workspace` (`reports/`, `evidence/`, `logs/`, `tmp/`). Every
CLI stage re-opens the same on-disk state and appends; nothing is held
only in memory across invocations.
