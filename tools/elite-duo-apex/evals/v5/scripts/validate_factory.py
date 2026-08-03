#!/usr/bin/env python3
"""Validate the whole v5 benchmark factory.

Checks, in order:
  1. the registry lists exactly 12 tasks: 6 calibration, 4 held-out, 2 adversarial
  2. every registry entry resolves to a file that exists on disk
  3. every manifest validates against TASK_MANIFEST.schema.json
  4. every manifest's recorded hash matches the file the registry points at
  5. the four schemas parse and use only supported draft-07 keywords
  6. the contamination audit is clean
  7. the decision vocabulary is exactly the four allowed decisions
  8. the lexicographic hierarchy has all ten dimensions in the right order

This is the script an owner runs to answer "is the factory still coherent?"
without reading any of it. It performs no benchmark run, contacts nothing, and
writes nothing.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import _minischema as ms  # noqa: E402
import check_contamination  # noqa: E402
import decide_promotion  # noqa: E402
import score_run  # noqa: E402

EXPECTED_COUNTS = {"calibration": 6, "held_out": 4, "adversarial": 2, "total": 12}

EXPECTED_HIERARCHY = (
    "1_prohibited_external_action",
    "2_protected_path_violation",
    "3_critical_defect",
    "4_acceptance_test_failure",
    "5_material_defect",
    "6_owner_burden",
    "7_repair_count",
    "8_elapsed_time",
    "9_fresh_token_usage",
    "10_measured_total_cost",
)

REQUIRED_DOCS = (
    "README.md",
    "CONTAMINATION_POLICY.md",
    "ANONYMIZATION_PROTOCOL.md",
    "EXECUTOR_PROTOCOL.md",
    "JUDGE_PROTOCOL.md",
    "CLEANUP_PROTOCOL.md",
    "FABLE_PACKET_BUILDER_SPEC.md",
)

REQUIRED_SCRIPTS = (
    "validate_factory.py", "create_run.py", "seal_identity_map.py",
    "build_executor_packet.py", "build_judge_packet.py", "score_run.py",
    "decide_promotion.py", "check_contamination.py", "check_cleanup.py",
)


def sha256_file(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def run_checks():
    problems = []

    registry_path = os.path.join(V5, "BENCHMARK_REGISTRY.json")
    if not os.path.exists(registry_path):
        return ["BENCHMARK_REGISTRY.json is missing; nothing else can be checked"]
    with open(registry_path, encoding="utf-8") as fh:
        registry = json.load(fh)

    if registry["task_counts"] != EXPECTED_COUNTS:
        problems.append("registry counts %r != expected %r"
                        % (registry["task_counts"], EXPECTED_COUNTS))
    tasks = registry["tasks"]
    if len(tasks) != 12:
        problems.append("registry lists %d tasks, expected 12" % len(tasks))
    ids = [t["task_id"] for t in tasks]
    if len(set(ids)) != len(ids):
        problems.append("duplicate task ids in registry")

    manifest_schema = ms.load_schema(os.path.join(V5, "schemas",
                                                  "TASK_MANIFEST.schema.json"))
    for entry in tasks:
        for key in ("manifest", "executor_packet", "sealed_contract"):
            rel = entry.get(key)
            if rel is None:
                continue
            path = os.path.join(V5, rel)
            if not os.path.exists(path):
                problems.append("%s: %s points at missing file %s"
                                % (entry["task_id"], key, rel))
        manifest_path = os.path.join(V5, entry["manifest"])
        if not os.path.exists(manifest_path):
            continue
        if sha256_file(manifest_path) != entry["manifest_sha256"]:
            problems.append("%s: manifest hash in registry is stale"
                            % entry["task_id"])
        with open(manifest_path, encoding="utf-8") as fh:
            manifest = json.load(fh)
        for err in ms.validate(manifest_schema, manifest):
            problems.append("%s: %s" % (entry["task_id"], err))
        if manifest["task_id"] != entry["task_id"]:
            problems.append("%s: manifest task_id disagrees with registry"
                            % entry["task_id"])
        if (entry["task_class"] == "CALIBRATION") != entry["scorable_now"]:
            problems.append("%s: scorable_now disagrees with task_class"
                            % entry["task_id"])

    for name in ("TASK_MANIFEST", "RUN_RECORD", "JUDGE_RESULT",
                 "PROMOTION_DECISION"):
        path = os.path.join(V5, "schemas", name + ".schema.json")
        if not os.path.exists(path):
            problems.append("missing schema %s" % name)
            continue
        try:
            ms.load_schema(path)
        except ValueError as exc:
            problems.append("schema %s: %s" % (name, exc))

    for name in REQUIRED_DOCS:
        if not os.path.exists(os.path.join(V5, name)):
            problems.append("missing document %s" % name)
    for name in REQUIRED_SCRIPTS:
        if not os.path.exists(os.path.join(V5, "scripts", name)):
            problems.append("missing script scripts/%s" % name)

    problems += ["contamination: " + f for f in check_contamination.findings_repo()]

    if tuple(decide_promotion.DECISIONS) != ("PROMOTE", "REJECT",
                                             "INSUFFICIENT_EVIDENCE",
                                             "CONTAMINATED"):
        problems.append("promotion decision vocabulary has drifted")
    if score_run.DIMENSION_NAMES != EXPECTED_HIERARCHY:
        problems.append("lexicographic hierarchy has drifted from the contract")

    return problems


def main(argv=None):
    problems = run_checks()
    for problem in problems:
        print("FACTORY: " + problem)
    if problems:
        print("FACTORY_INVALID (%d problem(s))" % len(problems))
        return 1
    print("FACTORY_VALID: 12 tasks (6 calibration / 4 held-out / 2 adversarial), "
          "4 schemas, %d documents, %d scripts"
          % (len(REQUIRED_DOCS), len(REQUIRED_SCRIPTS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
