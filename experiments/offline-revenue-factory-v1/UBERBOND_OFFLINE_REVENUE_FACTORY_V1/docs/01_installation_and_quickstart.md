# Installation and quickstart

## Requirements
Python 3.11+ (stdlib only — no `pip install` needed; nothing here uses
`jsonschema`, `pytest`, or any third-party package). No network access
is required or used.

## Verify the install
```
cd experiments/offline-revenue-factory-v1/UBERBOND_OFFLINE_REVENUE_FACTORY_V1
python3 -m py_compile $(find src -name '*.py')
./scripts/run_tests.sh
```
Expect all self-tests to pass (82 tests as of this writing — see
`10_testing.md`).

## Run one lane end to end
```
export PYTHONPATH=src
LANE=hospital_mrf
FIXTURE=valid
RUN_ID=quickstart-run-1

python3 -m urf.cli init-run       --lane $LANE --fixture $FIXTURE --run-id $RUN_ID
python3 -m urf.cli validate-input --lane $LANE --run-id $RUN_ID
python3 -m urf.cli execute        --lane $LANE --run-id $RUN_ID
python3 -m urf.cli qa             --lane $LANE --run-id $RUN_ID
python3 -m urf.cli render         --lane $LANE --run-id $RUN_ID --template direct_buyer
python3 -m urf.cli package        --lane $LANE --run-id $RUN_ID
python3 -m urf.cli verify-package --package reports/runs/$RUN_ID/$RUN_ID.zip
python3 -m urf.cli cleanup        --lane $LANE --run-id $RUN_ID
```
Or use `bin/urf` in place of `python3 -m urf.cli` (same script,
resolves its own location).

## Isolate output from the product tree
Every subcommand accepts `--workspace DIR`. Pass the same `--workspace`
to every stage of a run to keep its `reports/`, `evidence/`, `logs/`,
`tmp/` output entirely inside an isolated directory instead of the
product root — this is how the self-tests and `example_deliveries/`
were built, and is the recommended pattern for any real engagement so
runs don't collide.

## Available lanes and fixtures
```
python3 -c "
from urf.lanes import LANES, get_lane_module
for lane in LANES:
    print(lane, sorted(get_lane_module(lane).FIXTURES))
"
```
