#!/usr/bin/env python3
"""Derive a public executor packet from a task manifest.

An executor packet is the ONLY task material an executing session may read.
It is a strict projection of the manifest: every field is copied verbatim, and
the fields listed in EXCLUDED_KEYS are dropped because they are (or may later
become) evaluator-side material.

The exclusion is enforced twice on purpose: once by construction (allow-list
projection) and once by assertion (`assert_packet_clean`), so a future edit that
adds a field to the allow-list cannot silently leak a hidden key.

Usage:
  build_executor_packet.py --manifest manifests/CAL-UB-01.json --out public/calibration
  build_executor_packet.py --all            # rebuild every packet deterministically
"""

import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(HERE)

# Never present in a packet, for any task class.
EXCLUDED_KEYS = frozenset({
    "hidden_evaluator_reference",
    "hidden_evaluator_checks",
    "scoring_rubric",
})

# Copied verbatim from the manifest when present.
PACKET_KEYS = (
    "task_id",
    "task_class",
    "capability_class",
    "fixture_version",
    "starting_commit_or_fixture",
    "exact_objective",
    "allowed_paths",
    "forbidden_paths",
    "protected_paths",
    "required_tests",
    "visible_acceptance_criteria",
    "critical_failure_rules",
    "cleanup_contract",
    "risk_tier",
    "estimated_difficulty",
    "maximum_scope",
    "expected_owner_approvals",
    "internet_research_permitted",
    "external_apis_prohibited",
    "evaluator_version",
)

EXECUTOR_NOTICE = (
    "This packet is the complete task statement. Hidden evaluator material "
    "exists for this task and is deliberately not included. Do not search the "
    "repository, git history, or any vault for evaluator answers, hidden "
    "tests, or canaries; doing so is a contamination event under "
    "CONTAMINATION_POLICY.md and voids the run."
)


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")


# Minimum length of a hidden-material string before leak-scanning it. Very
# short strings ("canary") occur legitimately in visible policy text — a task
# may and should tell its executor "do not exfiltrate the canary" — so scanning
# them produces false positives that teach reviewers to ignore this check.
LEAK_SCAN_MIN_LEN = 12


def leak_scan_corpus(manifest):
    """Hidden strings whose appearance in a packet would be a real leak.

    Deliberately excludes hidden_evaluator_reference.required_future_evidence:
    that field holds a fixed vocabulary of category labels ("hidden tests",
    "answer key") describing what a vault custodian must supply later. It is
    not hidden content — no hidden content exists in this repository — and the
    labels are generic English that legitimately recurs in visible policy text.
    """
    corpus = list(manifest.get("hidden_evaluator_checks") or [])
    corpus += list((manifest.get("scoring_rubric") or {}).values())
    ref = manifest.get("hidden_evaluator_reference") or {}
    pointer = ref.get("vault_pointer")
    if pointer:
        corpus.append(pointer)
    return [t for t in corpus if isinstance(t, str) and len(t) >= LEAK_SCAN_MIN_LEN]


def assert_packet_clean(packet, manifest=None):
    """Fail loudly if any evaluator-side material reached the packet."""
    leaked = EXCLUDED_KEYS.intersection(packet)
    if leaked:
        raise AssertionError("executor packet leaked hidden keys: %s"
                             % sorted(leaked))
    blob = canonical(packet).decode("utf-8")
    for marker in ("vault://", "SEALED_PLACEHOLDER"):
        if marker in blob:
            raise AssertionError("executor packet contains evaluator marker %r"
                                 % marker)
    if manifest is not None:
        for text in leak_scan_corpus(manifest):
            if text in blob:
                raise AssertionError(
                    "executor packet reproduces hidden evaluator text: %r" % text)
    return True


def build_packet(manifest):
    packet = {"_notice": EXECUTOR_NOTICE}
    for key in PACKET_KEYS:
        if key in manifest:
            packet[key] = manifest[key]
    packet["packet_hash"] = hashlib.sha256(canonical(
        {k: v for k, v in packet.items() if k != "_notice"}
    )).hexdigest()
    assert_packet_clean(packet, manifest)
    return packet


def out_dir_for(manifest):
    return {
        "CALIBRATION": os.path.join(V5, "public", "calibration"),
        "HELD_OUT": os.path.join(V5, "public", "heldout"),
        "ADVERSARIAL": os.path.join(V5, "public", "adversarial"),
    }[manifest["task_class"]]


def write_packet(manifest_path, out_dir=None):
    with open(manifest_path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    packet = build_packet(manifest)
    target_dir = out_dir or out_dir_for(manifest)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, manifest["task_id"] + ".packet.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(packet, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return path


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest")
    ap.add_argument("--out")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args(argv)

    if args.all:
        mdir = os.path.join(V5, "manifests")
        written = []
        for name in sorted(os.listdir(mdir)):
            if name.endswith(".json"):
                written.append(write_packet(os.path.join(mdir, name)))
        for path in written:
            print(os.path.relpath(path, V5))
        print("packets written: %d" % len(written))
        return 0

    if not args.manifest:
        ap.error("--manifest or --all is required")
    print(os.path.relpath(write_packet(args.manifest, args.out), V5))
    return 0


if __name__ == "__main__":
    sys.exit(main())
