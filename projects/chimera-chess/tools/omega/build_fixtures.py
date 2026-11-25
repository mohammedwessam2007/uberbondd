"""Mine per-motif test fixtures from REAL WHOLE_MIND game traces (evidence/omega/**/trace*.jsonl).
For every executable motif: up to 3 positive candidates (motif fired with the evidence the runtime actually had) and up to 3
matched negatives (a different candidate in the SAME position where it did not fire). Each record carries the full game
history, the searched evals, the Maia/reply evidence and the match-state snapshot, so tests replay the exact predicate.
Usage: python tools/omega/build_fixtures.py 'evidence/omega/**/trace*.jsonl' tests/fixtures/omega_fixtures.json"""
import glob, json, sys
sys.path.insert(0, ".")
from chimera.omega import motifs as M


def main(pat, out):
    pos, neg = {n: [] for n in M.REGISTRY}, {n: [] for n in M.REGISTRY}
    files = [f for f in sorted(glob.glob(pat, recursive=True)) if "NO_MOTIFS" not in f]   # ablation with motifs disabled: no valid negatives
    for f in files:
        for line in open(f):
            t = json.loads(line)
            if "candidates" not in t:
                continue
            cand = dict(t.get("root", {}))
            cand.update({c["move"]: c["eval"] for c in t["candidates"]})
            best = max(cand.values())
            for c in t["candidates"]:
                rec = {"src": f, "start_fen": t["start_fen"], "history": t["history"], "move": c["move"], "eval": c["eval"], "best": best,
                       "cand": cand, "evidence": c.get("evidence"), "state": t.get("state", {}), "traced": c["bd"]}
                for n in M.REGISTRY:
                    if n == 50 and "opp_cp_drops_after" not in rec["state"]:
                        continue   # older traces snapshot opp_cp_drops before this move's drop was added (fixed in mind.py)
                    k = f"#{n}"
                    if k in c["bd"] and c["bd"][k] != 0 and len(pos[n]) < 3:
                        pos[n].append(rec)
                    elif k not in c["bd"] and len(neg[n]) < 3 and (M.REGISTRY[n].needs <= {"eval", "history", "clock"} or c.get("evidence")):
                        if any(p["history"] == rec["history"] for p in pos[n]):
                            neg[n].append(rec)
    json.dump({"sources": files, "positives": pos, "negatives": neg}, open(out, "w"))
    print(len(files), "trace files;", sum(1 for n in pos if pos[n]), "motifs with positives;", sum(1 for n in neg if neg[n]), "with matched negatives")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
