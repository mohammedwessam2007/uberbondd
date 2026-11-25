"""Restore CHIMERA runtime assets from recovery/phoenix/assets into the project tree, verifying every SHA-256.
Joins chunk lists in order (all current assets are single chunks), refuses missing/corrupt input, never overwrites a
differing existing file unless --force. Usage (from projects/chimera-chess): python3 recovery/phoenix/restore.py [--force]"""
import hashlib, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
M = json.load(open(os.path.join(HERE, "MANIFEST.json")))
force = "--force" in sys.argv
bad = 0
for f in M["runtime_assets"]:
    parts = [os.path.join(ROOT, c) for c in f["chunks"]]
    if not all(os.path.isfile(p) for p in parts):
        print("MISSING", f["asset"]); bad += 1; continue
    data = b"".join(open(p, "rb").read() for p in parts)
    if len(data) != f["size"] or hashlib.sha256(data).hexdigest() != f["sha256"]:
        print("CORRUPT", f["asset"]); bad += 1; continue
    out = os.path.join(ROOT, f["restore_to"])
    if os.path.isfile(out) and hashlib.sha256(open(out, "rb").read()).hexdigest() != f["sha256"] and not force:
        print("EXISTS-DIFFERENT (use --force)", out); bad += 1; continue
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "wb").write(data)
    if out.endswith(("native/chimera", "chimera-v8-ref")):
        os.chmod(out, 0o755)
    print("OK", f["restore_to"])
sys.exit(1 if bad else 0)
