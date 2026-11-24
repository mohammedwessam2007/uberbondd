"""Interaction matrix (mandate §18) from real WHOLE_MIND traces: per motif its producer (evidence needs), consumer (arbitration),
activation count, mean contribution, and per group pair: co-firing on candidates, and conflict outcomes in arbitration overrides
(group present for the winner but not for the objective best = 'won'; present for the objective best but not the winner = 'lost').
Also Skeptic vetoes per group (Artist+Skeptic) and the evidence cost (deep candidates). Usage: python tools/omega/interactions.py out.json 'traces glob'"""
import glob, itertools, json, sys
sys.path.insert(0, ".")
from chimera.omega import motifs as M


def g(k):
    return M.REGISTRY[int(k[1:])].group


def main(out, pat):
    co, won, lost, veto, act, contrib = {}, {}, {}, {}, {}, {}
    n_over = n_moves = 0
    for f in sorted(glob.glob(pat)):
        for l in open(f):
            t = json.loads(l)
            if "candidates" not in t:
                continue
            n_moves += 1
            for c in t["candidates"]:
                gs = sorted({g(k) for k in c["bd"]})
                for a, b in itertools.combinations(gs, 2):
                    co[f"{a}+{b}"] = co.get(f"{a}+{b}", 0) + 1
                for k, v in c["bd"].items():
                    act[k] = act.get(k, 0) + 1; contrib[k] = contrib.get(k, 0.0) + v
            vet = {v["move"] for v in t.get("vetoed", [])}
            for c in t["candidates"]:
                if c["move"] in vet:
                    for gg in {g(k) for k in c["bd"]}:
                        veto[gg] = veto.get(gg, 0) + 1
            arb = t.get("arbitration", {})
            if arb.get("result", "").startswith("motif"):
                n_over += 1
                W = {g(k) for k in (arb.get("winner_motifs") or {})}; L = {g(k) for k in (arb.get("loser_motifs") or {})}
                for x in W - L:
                    won[x] = won.get(x, 0) + 1
                for x in L - W:
                    lost[x] = lost.get(x, 0) + 1
    per = {k: {"group": g(k), "needs": sorted(M.REGISTRY[int(k[1:])].needs) or ["board"], "level": M.REGISTRY[int(k[1:])].level,
               "activations": act[k], "mean_contribution": round(contrib[k] / act[k], 3)} for k in sorted(act, key=lambda x: int(x[1:]))}
    res = {"moves": n_moves, "arbitration_overrides": n_over, "group_won_override": won, "group_lost_override": lost,
           "skeptic_vetoes_by_group": veto, "co_firing_top": dict(sorted(co.items(), key=lambda kv: -kv[1])[:40]), "per_motif": per}
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps({k: res[k] for k in ("moves", "arbitration_overrides", "group_won_override", "group_lost_override", "skeptic_vetoes_by_group")}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
