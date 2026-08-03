#!/usr/bin/env python3
"""Prove the committed factory contains no evaluator material, and audit judging.

Two jobs:

  --repo    (default) Structural audit of this tree. Held-out and adversarial
            tasks must be sealed placeholders; no answer key, hidden test,
            fixture mutation, or canary may exist under version control. This is
            the check that keeps the benchmark meaningful after the repository
            is cloned into an executing session.

  --judging Audit a set of judge results: any judge that claims it identified
            the configuration with confidence >= 0.7 must be quarantined, and a
            quarantined result must not be counted toward a promotion decision.

Exit code 0 means clean; 1 means a contamination finding; findings are printed
one per line so a failure names the file rather than just failing.
"""

import argparse
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from build_executor_packet import assert_packet_clean, build_packet  # noqa: E402

IDENTITY_INFERENCE_QUARANTINE_THRESHOLD = 0.7

SEALED_CLASSES = ("HELD_OUT", "ADVERSARIAL")

# Keys that would indicate real hidden material was committed.
FORBIDDEN_SEALED_KEYS = (
    "answer_key", "hidden_tests", "fixture_mutation", "canary",
    "expected_output", "solution", "reference_patch",
)


def findings_repo():
    findings = []
    manifest_paths = sorted(glob.glob(os.path.join(V5, "manifests", "*.json")))
    if not manifest_paths:
        return ["no manifests found; the factory is empty"]

    for path in manifest_paths:
        with open(path, encoding="utf-8") as fh:
            manifest = json.load(fh)
        task_id = manifest["task_id"]
        ref = manifest["hidden_evaluator_reference"]

        if manifest["task_class"] in SEALED_CLASSES:
            if ref["mode"] != "SEALED_PLACEHOLDER" or not ref["sealed"]:
                findings.append("%s: %s task is not sealed"
                                % (task_id, manifest["task_class"]))
            if manifest.get("hidden_evaluator_checks"):
                findings.append("%s: sealed task discloses hidden checks" % task_id)
            if not ref.get("vault_pointer", "").startswith("vault://"):
                findings.append("%s: sealed task has no vault pointer" % task_id)
            if not ref.get("required_future_evidence"):
                findings.append("%s: sealed task does not say what the vault "
                                "custodian must supply" % task_id)

            sealed_dir = "heldout" if manifest["task_class"] == "HELD_OUT" else "adversarial"
            sealed_path = os.path.join(V5, sealed_dir, task_id + ".sealed.json")
            if not os.path.exists(sealed_path):
                findings.append("%s: missing sealed contract %s"
                                % (task_id, sealed_path))
            else:
                with open(sealed_path, encoding="utf-8") as fh:
                    contract = json.load(fh)
                if contract.get("hidden_material_present_in_repository") is not False:
                    findings.append("%s: sealed contract does not assert absence "
                                    "of hidden material" % task_id)
                for key in FORBIDDEN_SEALED_KEYS:
                    if key in contract:
                        findings.append("%s: sealed contract carries %r — hidden "
                                        "material must never be committed"
                                        % (task_id, key))

        # The packet on disk must equal the packet the builder derives now.
        entry_dir = {"CALIBRATION": "calibration", "HELD_OUT": "heldout",
                     "ADVERSARIAL": "adversarial"}[manifest["task_class"]]
        packet_path = os.path.join(V5, "public", entry_dir, task_id + ".packet.json")
        if not os.path.exists(packet_path):
            findings.append("%s: missing executor packet" % task_id)
            continue
        with open(packet_path, encoding="utf-8") as fh:
            on_disk = json.load(fh)
        try:
            assert_packet_clean(on_disk, manifest)
        except AssertionError as exc:
            findings.append("%s: %s" % (task_id, exc))
        if on_disk != build_packet(manifest):
            findings.append("%s: committed packet does not match its manifest; "
                            "rebuild with build_executor_packet.py --all" % task_id)

    return findings


def findings_judging(paths):
    findings = []
    for path in paths:
        with open(path, encoding="utf-8") as fh:
            result = json.load(fh)
        inference = result.get("identity_inference") or {}
        confidence = inference.get("confidence")
        if confidence is None:
            continue
        if confidence >= IDENTITY_INFERENCE_QUARANTINE_THRESHOLD and not inference.get("quarantined"):
            findings.append(
                "%s: judge reported identity confidence %.2f (>= %.2f) but the "
                "result is not quarantined"
                % (result.get("anon_run_id", path), confidence,
                   IDENTITY_INFERENCE_QUARANTINE_THRESHOLD))
    return findings


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", action="store_true")
    ap.add_argument("--judging", nargs="*", metavar="RESULT_JSON")
    args = ap.parse_args(argv)

    findings = []
    if args.judging is not None:
        paths = args.judging or sorted(
            glob.glob(os.path.join(V5, "reports", "*.result.json")))
        findings += findings_judging(paths)
    if args.repo or args.judging is None:
        findings += findings_repo()

    for finding in findings:
        print("CONTAMINATION: " + finding)
    if findings:
        print("contamination findings: %d" % len(findings))
        return 1
    print("contamination check clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
