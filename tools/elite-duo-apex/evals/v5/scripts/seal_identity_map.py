#!/usr/bin/env python3
"""Seal the anon_run_id -> config_hash map so judging stays blind.

Lifecycle:
  1. `--add`    while runs are being created: records the mapping in the
                working map (anonymization/identity_map.json).
  2. `--seal`   once, before any judging: writes a commitment file
                (anonymization/SEALED_IDENTITY_MAP.json) containing only a
                sha256 over the canonical mapping, plus counts. After sealing,
                `--add` is refused.
  3. `--verify` after judging: re-hashes the working map and compares it to the
                commitment. A mismatch means the mapping changed while runs were
                being judged, which invalidates the comparison.

The commitment lets the owner prove afterwards that nobody re-labelled runs to
flatter one configuration, without exposing the mapping during judging.
"""

import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
V5 = os.path.dirname(HERE)
ANON = os.path.join(V5, "anonymization")
MAP_PATH = os.path.join(ANON, "identity_map.json")
SEAL_PATH = os.path.join(ANON, "SEALED_IDENTITY_MAP.json")


def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")


def load_map():
    if not os.path.exists(MAP_PATH):
        return {"sealed": False, "entries": {}}
    with open(MAP_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def save_map(data):
    os.makedirs(ANON, exist_ok=True)
    with open(MAP_PATH, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")


def commitment(entries):
    return hashlib.sha256(canonical(entries)).hexdigest()


def add(anon_run_id, config_hash):
    data = load_map()
    if data.get("sealed"):
        raise SystemExit("REFUSED: identity map is sealed; no run may be added "
                         "or re-labelled after sealing")
    if anon_run_id in data["entries"]:
        raise SystemExit("REFUSED: %s already mapped; labels are never reused"
                         % anon_run_id)
    data["entries"][anon_run_id] = config_hash
    save_map(data)
    return data


def seal():
    data = load_map()
    if data.get("sealed"):
        raise SystemExit("REFUSED: already sealed")
    if not data["entries"]:
        raise SystemExit("REFUSED: refusing to seal an empty identity map")
    data["sealed"] = True
    save_map(data)
    seal_doc = {
        "commitment_algorithm": "sha256",
        "commitment": commitment(data["entries"]),
        "run_count": len(data["entries"]),
        "distinct_config_count": len(set(data["entries"].values())),
        "note": "Contains no mapping. Judges receive anon_run_id only; the "
                "mapping is revealed after all judge results are recorded.",
    }
    os.makedirs(ANON, exist_ok=True)
    with open(SEAL_PATH, "w", encoding="utf-8") as fh:
        json.dump(seal_doc, fh, indent=2, sort_keys=True)
        fh.write("\n")
    return seal_doc


def verify():
    if not os.path.exists(SEAL_PATH):
        raise SystemExit("REFUSED: no commitment file; the map was never sealed")
    with open(SEAL_PATH, encoding="utf-8") as fh:
        seal_doc = json.load(fh)
    data = load_map()
    actual = commitment(data["entries"])
    ok = actual == seal_doc["commitment"]
    return ok, actual, seal_doc["commitment"]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--add", nargs=2, metavar=("ANON_RUN_ID", "CONFIG_HASH"))
    ap.add_argument("--seal", action="store_true")
    ap.add_argument("--verify", action="store_true")
    args = ap.parse_args(argv)

    if args.add:
        data = add(*args.add)
        print("entries: %d" % len(data["entries"]))
        return 0
    if args.seal:
        doc = seal()
        print("SEALED commitment=%s runs=%d configs=%d"
              % (doc["commitment"], doc["run_count"], doc["distinct_config_count"]))
        return 0
    if args.verify:
        ok, actual, expected = verify()
        print("VERIFIED" if ok else "MISMATCH")
        if not ok:
            print("  expected %s\n  actual   %s" % (expected, actual))
        return 0 if ok else 1
    ap.error("one of --add / --seal / --verify is required")


if __name__ == "__main__":
    sys.exit(main())
