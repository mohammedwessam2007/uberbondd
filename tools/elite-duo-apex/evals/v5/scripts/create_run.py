#!/usr/bin/env python3
"""Create an empty, anonymous run record for one (task, configuration) pair.

Every telemetry field starts as null and is listed in `unknown_fields`. A
harness that cannot measure a field leaves it null and leaves its name in
`unknown_fields`; it must never write a fabricated zero, because a fabricated
zero is indistinguishable from a genuine measurement at scoring time.

The run label is random and unrelated to configuration order, so a judge cannot
infer "run A is the baseline" from the label. The configuration is recorded only
as an opaque hash; the human-readable configuration name never enters the record.

Usage:
  create_run.py --task CAL-UB-01 --config-hash <sha256> --starting-commit <sha>
"""

import argparse
import json
import os
import secrets
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import _minischema as ms  # noqa: E402

RUNS_DIR = os.path.join(V5, "telemetry", "runs")
SCHEMA = os.path.join(V5, "schemas", "RUN_RECORD.schema.json")

NULLABLE_FIELDS = (
    "fixture_hash", "actual_session_model", "actual_effort_level",
    "start_time", "end_time", "fresh_input_tokens", "cache_write_tokens",
    "cache_read_tokens", "output_tokens", "compaction_count", "tool_calls",
    "file_reads", "files_modified", "tests_run", "failed_tests",
    "repair_cycles", "owner_interventions", "owner_minutes",
    "acceptance_result", "critical_defects", "material_defects",
    "scope_violations", "cleanup_result", "final_tree_state",
    "measured_cost_usd",
)

ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"  # no look-alike characters


def new_anon_run_id(rng=None):
    pick = (rng or secrets).choice
    return "run-" + "".join(pick(ALPHABET) for _ in range(6))


def load_registry():
    with open(os.path.join(V5, "BENCHMARK_REGISTRY.json"), encoding="utf-8") as fh:
        return json.load(fh)


def registry_entry(task_id):
    for entry in load_registry()["tasks"]:
        if entry["task_id"] == task_id:
            return entry
    raise KeyError("unknown task_id %r; the registry is the only task source"
                   % task_id)


def build_run(task_id, config_hash, starting_commit, anon_run_id=None):
    record = {
        "task_id": task_id,
        "config_hash": config_hash,
        "anon_run_id": anon_run_id or new_anon_run_id(),
        "starting_commit": starting_commit,
    }
    for field in NULLABLE_FIELDS:
        record[field] = None
    record["unknown_fields"] = list(NULLABLE_FIELDS)
    return record


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--task", required=True)
    ap.add_argument("--config-hash", required=True)
    ap.add_argument("--starting-commit", required=True)
    ap.add_argument("--allow-blocked", action="store_true",
                    help="create the record even though the task awaits vault "
                         "material; the run still cannot be scored")
    args = ap.parse_args(argv)

    entry = registry_entry(args.task)
    if not entry["scorable_now"] and not args.allow_blocked:
        print("REFUSED: %s is %s. No hidden evaluator material exists for it in "
              "this repository, so a run cannot be scored. Re-run with "
              "--allow-blocked only if you are deliberately recording an "
              "unscorable run." % (args.task, entry["blocked_reason"]),
              file=sys.stderr)
        return 2

    record = build_run(args.task, args.config_hash, args.starting_commit)
    errors = ms.validate(ms.load_schema(SCHEMA), record)
    if errors:
        for err in errors:
            print("SCHEMA: " + err, file=sys.stderr)
        return 1

    os.makedirs(RUNS_DIR, exist_ok=True)
    path = os.path.join(RUNS_DIR, record["anon_run_id"] + ".json")
    if os.path.exists(path):
        print("REFUSED: %s already exists; run labels are never reused"
              % path, file=sys.stderr)
        return 1
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(record, fh, indent=2, sort_keys=True)
        fh.write("\n")
    print(record["anon_run_id"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
