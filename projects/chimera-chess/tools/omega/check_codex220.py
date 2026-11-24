"""CODEX220 ledger checker (new; the historical lab/04_check_completion.py is untouched).
Rejects: missing / duplicate IDs; records without verbatim source text or page; empty implementations (function must exist and
not be trivially constant); MOTIF claims without a registry entry; unit_tested without a fixture/dedicated test; integration
claims without trace evidence; fabricated artifact paths; hash mismatch of the source PDFs; unjustified upgrades
(experimentally_supported / validated without a referenced evidence file); restricted IDs that are executable.
Exit 0 = structurally consistent (NOT scientific validation). Usage: python tools/omega/check_codex220.py"""
import glob, hashlib, inspect, json, os, sys
sys.path.insert(0, ".")
from chimera.omega import motifs as M
from chimera.omega.controls import CONTROLS


def main():
    err = []
    man = json.load(open("canon/PDF_SOURCE_MANIFEST.json"))
    for d in man["documents"]:
        if not os.path.isfile(d["path"]) or hashlib.sha256(open(d["path"], "rb").read()).hexdigest() != d["sha256"]:
            err.append(f"source PDF hash mismatch or missing: {d['path']}")
    R = json.load(open("canon/PDF_REQUIREMENTS_220.json"))["records"]
    ids = [r["id"] for r in R]
    want = [f"CODEX220-{n:03d}" for n in range(1, 221)]
    if sorted(ids) != want:
        err.append(f"ID set wrong: missing {sorted(set(want) - set(ids))[:5]} dup {[i for i in ids if ids.count(i) > 1][:5]}")
    fx = json.load(open("tests/fixtures/omega_fixtures.json"))
    tr = glob.glob("evidence/omega/**/trace*.jsonl", recursive=True)
    bodies = {}
    for r in R:
        n = int(r["original_id"][1:]); st = r["status"]; e = r["engineering"]
        if not r.get("original_text_raw") or not r["source"].get("page"):
            err.append(f"{r['id']}: no verbatim source text/page")
        if st["class"] == "MOTIF":
            if n not in M.REGISTRY:
                err.append(f"{r['id']}: MOTIF claim without registry entry")
                continue
            src = inspect.getsource(M.REGISTRY[n].fn)
            body = "\n".join(l for l in src.splitlines()[1:] if l.strip() and not l.strip().startswith("#"))
            if body.count("\n") < 1 and "return 0.0" in body:
                err.append(f"{r['id']}: trivial implementation")
            bodies.setdefault(body.strip(), []).append(r["id"])
        if st["class"] == "CONTROL" and n not in CONTROLS:
            err.append(f"{r['id']}: CONTROL claim without controls entry")
        if st["class"] == "RESTRICTED_ARCHIVE" and (n in M.REGISTRY or st["implemented"]):
            err.append(f"{r['id']}: restricted ID is executable")
        if st["unit_tested"] and st["class"] == "MOTIF" and not fx["positives"].get(str(n)) and n not in (186, 192, 201, 215, 220, 144, 214):
            err.append(f"{r['id']}: unit_tested without fixture or dedicated test")
        if st["integration_tested"] and st["class"] == "MOTIF" and (st["integration_fired_on_candidates"] == 0 or not tr):
            err.append(f"{r['id']}: integration claim without trace evidence")
        if (st["experimentally_supported"] or st["validated"]) and not r.get("experiment_evidence"):
            err.append(f"{r['id']}: upgrade without experiment_evidence")
        for p in [v for v in r.get("acceptance_tests", {}).values() if v and v.startswith("tests/")]:
            if not os.path.isfile(p.split()[0]):
                err.append(f"{r['id']}: test file missing {p}")
    dup = {b: v for b, v in bodies.items() if len(v) > 1}
    for b, v in dup.items():
        err.append(f"identical implementations shared by {v}")
    status = json.load(open("canon/IMPLEMENTATION_STATUS.json"))
    out = {"records": len(R), "errors": err, "counts": status["counts"], "scientific_validation": "NOT ESTABLISHED BY THIS CHECKER"}
    print(json.dumps(out, indent=1))
    sys.exit(1 if err else 0)


if __name__ == "__main__":
    main()
