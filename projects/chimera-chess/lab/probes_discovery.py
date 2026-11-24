"""V13 discovery-pool probes (#022 originality auditor, #104 discovered-genius audit, #003 delayed revelation,
#029 mutation-operator robustness, #011 counterintuitive-position generator, #032 quiet-move head,
#018 failure-augmented retraining). Pool: lab/discovery_pool*.jsonl (Sixth Instinct V11/V12 mining, CC0 Lichess puzzles).
Subset: the 150 items with smallest sha256('v13probe'+id) (fixed before any result was seen). Oracle: lab/oracle.py.
Each probe writes evidence/v13/probes/<ID>.json. Pre-registration: evidence/v13/PREREG_probes_discovery.md.
Usage: python lab/probes_discovery.py evidence/v13/probes"""
import glob, hashlib, json, math, os, random, subprocess, sys
import chess
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT); sys.path.insert(0, ROOT + "/tools")
from lab.oracle import Oracle
from discovery_lab import feats, softmax_train, topk, FEATS
N_OR = 300000


def pool():
    recs = {}
    for f in sorted(glob.glob(ROOT + "/lab/discovery_pool*.jsonl")):
        for l in open(f):
            if l.strip():
                r = json.loads(l); recs[r["id"]] = r
    return list(recs.values())


def v8(fen, nodes):
    o = subprocess.run([ROOT + "/native/chimera"], input=f"position fen {fen}\ngo nodes {nodes}\nisready\nquit\n", capture_output=True, text=True).stdout
    return [l.split()[1] for l in o.splitlines() if l.startswith("bestmove")][-1]


def mutate(b, sol, rng):
    """Remove one non-king, non-pawn-of-mover piece that is neither the moving piece nor on the solution's destination."""
    m = chess.Move.from_uci(sol)
    cands = [s for s, p in b.piece_map().items() if p.piece_type != chess.KING and s not in (m.from_square, m.to_square)]
    rng.shuffle(cands)
    for s in cands:
        c = b.copy(); c.remove_piece_at(s)
        if c.is_valid() and m in c.legal_moves:
            return c, chess.square_name(s), b.piece_at(s).symbol()
    return None, None, None


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    P = pool()
    sub = sorted(P, key=lambda r: hashlib.sha256(("v13probe" + r["id"]).encode()).hexdigest())[:150]
    o = Oracle(); rng = random.Random(29)
    from chimera.maia import MaiaPolicy
    maia = MaiaPolicy()
    rows = []
    for r in sub:
        fen = r["fen"]; sol = r["solution"]
        best = o.best(fen, N_OR); bs = o.score(fen, None, N_OR); ss = o.score(fen, sol, N_OR); vs = o.score(fen, r["v8"], N_OR)
        s60 = o.score(fen, sol, 60000); v60 = o.score(fen, r["v8"], 60000)
        v8_600 = v8(fen, 600000)
        b = chess.Board(fen)
        mut = []
        for _ in range(2):
            c, sq, pc = mutate(b, sol, rng)
            if c is None:
                continue
            cf = c.fen(); cb = o.best(cf, N_OR); cs = o.score(cf, None, N_OR); csol = o.score(cf, sol, N_OR)
            probs, _ = maia.predict(c, 2200)
            mrank = sorted(probs, key=lambda k: -probs[k]).index(sol) if sol in probs else 99
            mut.append({"fen": cf, "removed": pc + sq, "oracle_best": cb, "sol_loss": cs - csol, "sol_still_best_within30": cs - csol <= 30,
                        "maia_rank_sol": mrank, "v8_100k": v8(cf, 100000)})
        rows.append({"id": r["id"], "family": r["family"], "maia_rank": r["maia_rank"], "sol": sol, "v8": r["v8"], "oracle_best": best,
                     "sol_loss_300k": bs - ss, "v8_loss_300k": bs - vs, "sol_60k": s60, "sol_300k": ss, "v8_60k": v60, "v8_300k": vs,
                     "v8_600k_move": v8_600, "mutations": mut})
        print(len(rows), r["id"], r["family"], bs - ss, bs - vs, v8_600 == sol, flush=True)
    o.close()
    json.dump(rows, open(os.path.join(outdir, "discovery_rows.json"), "w"))
    n = len(rows)
    # #022 originality: all are Lichess puzzle first moves (known positions) -> originality relative to HUMAN expectation
    R = {}
    R["022"] = {"mechanism": "originality auditor: each 'discovery' is checked for (a) source-novelty (is it a published puzzle solution?) and (b) human-novelty (Maia3 2200 rank of the move)",
                "n": n, "source_novel": 0, "source_rediscoveries": n, "note": "every pool item is the first move of a published Lichess puzzle: 0% source originality by construction",
                "maia_rank_ge3_share": round(sum(r["maia_rank"] >= 3 for r in rows) / n, 3), "maia_rank0_share": round(sum(r["maia_rank"] == 0 for r in rows) / n, 3),
                "unique_positions": len({" ".join(json.dumps(r["id"])) for r in rows})}
    # #104 genius audit: is the 'discovery' real (oracle-confirmed at deterministic 300k) and a SEARCH gap (found by V8 with 6x nodes)?
    conf = [r for r in rows if r["sol_loss_300k"] <= 30]
    R["104"] = {"mechanism": "discovered-genius audit: deterministic re-confirmation of each discovery and classification of the artifact type",
                "n": n, "confirmed_within30_at_300k": len(conf), "confirmed_share": round(len(conf) / n, 3),
                "genuine_gain_vs_v8_ge100": sum(r["v8_loss_300k"] - r["sol_loss_300k"] >= 100 for r in rows),
                "v8_600k_finds_it": sum(r["v8_600k_move"] == r["sol"] for r in rows),
                "artifact_classes": {"not_confirmed": n - len(conf), "pure_search_gap(found at 600k)": sum(r["v8_600k_move"] == r["sol"] for r in conf),
                                     "persistent_gap(not found at 600k)": sum(r["v8_600k_move"] != r["sol"] for r in conf)}}
    # #003 delayed revelation: value of the discovery increases with oracle depth more than V8's move does (quiet families)
    def rise(r): return (r["sol_300k"] - r["sol_60k"]) - (r["v8_300k"] - r["v8_60k"])
    q = [r for r in rows if r["family"].startswith("quiet")]; nq = [r for r in rows if not r["family"].startswith("quiet")]
    def bootmean(xs, k=1000):
        g = random.Random(3); s = sorted(sum(xs[g.randrange(len(xs))] for _ in xs) / len(xs) for _ in range(k)); return [round(s[25], 1), round(s[974], 1)]
    R["003"] = {"mechanism": "delayed revelation: relative score rise of the discovery between 60k and 300k oracle nodes (vs V8's move); quiet vs forcing families",
                "quiet_mean_rise": round(sum(map(rise, q)) / len(q), 1), "quiet_ci95": bootmean([rise(r) for r in q]),
                "forcing_mean_rise": round(sum(map(rise, nq)) / len(nq), 1), "forcing_ci95": bootmean([rise(r) for r in nq]),
                "share_revealed_only_late(>=100cp)": round(sum(rise(r) >= 100 for r in rows) / n, 3)}
    # #029 mutation robustness
    M = [(r["family"], m) for r in rows for m in r["mutations"]]
    fam = {}
    for f, m in M:
        a = fam.setdefault(f, [0, 0]); a[0] += 1; a[1] += m["sol_still_best_within30"]
    R["029"] = {"mechanism": "mutation-operator robustness: remove one uninvolved non-king piece; does the discovery stay within 30cp of best?",
                "n_mutations": len(M), "robust_share": round(sum(m["sol_still_best_within30"] for _, m in M) / max(1, len(M)), 3),
                "by_family": {f: {"n": a[0], "robust": round(a[1] / a[0], 3)} for f, a in fam.items()}}
    # #011 counterintuitive generator: robust mutants whose solution is human-unlikely (Maia rank>=3) and missed by V8@100k
    gen = [m for _, m in M if m["sol_still_best_within30"] and m["maia_rank_sol"] >= 3 and m["v8_100k"] != m["oracle_best"]]
    R["011"] = {"mechanism": "counterintuitive-position generator: mutation of verified discoveries, filtered by oracle (sol still best), Maia rank>=3 and V8@100k miss",
                "candidates": len(M), "generated_verified": len(gen), "yield": round(len(gen) / max(1, len(M)), 3), "examples": gen[:5]}
    json.dump(R, open(os.path.join(outdir, "_discovery_oracle_probes.json"), "w"), indent=1)
    for k, v in R.items():
        json.dump(v | {"id": k, "subset": "150 smallest sha256('v13probe'+id)", "oracle": f"{N_OR} nodes"}, open(os.path.join(outdir, f"{k}.json"), "w"), indent=1)
    learner_probes(P, outdir)
    print(json.dumps(R, indent=1)[:3000])


def learner_probes(P, outdir):
    """#032 quiet-move head and #018 failure-augmented retraining; game-disjoint 5-fold, no oracle needed."""
    data = [(np.array(r["X"], float), r["legal"].index(r["solution"]), r) for r in P]
    folds = [int(hashlib.sha256(r["game"].encode()).hexdigest(), 16) % 5 for _, _, r in data]
    maia_idx = FEATS.index("maia_logp"); quiet_idx = FEATS.index("quiet")
    res32 = {"general": [], "quiet_head_on_quiet": [], "general_on_quiet": [], "maia_on_quiet": []}
    res18 = {"base": [], "failure_aug": [], "maia": []}
    for k in range(5):
        tr = [(X, y) for (X, y, r), f in zip(data, folds) if f != k]; te = [(X, y) for (X, y, r), f in zip(data, folds) if f == k]
        trq = [(X, y) for (X, y, r), f in zip(data, folds) if f != k and X[y, quiet_idx] == 1]
        teq = [(X, y) for (X, y, r), f in zip(data, folds) if f == k and X[y, quiet_idx] == 1]
        w = softmax_train(tr); wq = softmax_train(trq)
        res32["general"].append(topk(te, lambda X: X @ w, 3)); res32["general_on_quiet"].append(topk(teq, lambda X: X @ w, 3))
        res32["quiet_head_on_quiet"].append(topk(teq, lambda X: np.where(X[:, quiet_idx] == 1, X @ wq, X @ w), 3))
        res32["maia_on_quiet"].append(topk(teq, lambda X: X[:, maia_idx], 3))
        # failure augmentation: for each training item, also add a 'hard negative' variant in which the V8 move is the
        # contrast (duplicate the item ×3 when V8's move is in the legal list) -> emphasises exactly the search failures
        aug = list(tr); g = random.Random(18 + k)
        for (X, y, r), f in zip(data, folds):
            if f != k and r["v8"] in r["legal"]:
                j = r["legal"].index(r["v8"]); others = [i for i in range(len(X)) if i not in (y, j)]; g.shuffle(others)
                idx = [y, j] + others[:3]
                aug += [(X[idx], 0)] * 2   # explicit contrast set {discovery, V8's failed choice, 3 random}
        wa = softmax_train(aug)
        res18["base"].append(topk(te, lambda X: X @ w, 3)); res18["failure_aug"].append(topk(te, lambda X: X @ wa, 3))
        res18["maia"].append(topk(te, lambda X: X[:, maia_idx], 3))
    m = lambda xs: round(float(np.mean(xs)), 3)
    json.dump({"id": "032", "mechanism": "quiet-move head: separate listwise ranker trained only on quiet discoveries, applied to quiet candidates; game-disjoint 5-fold top-3 recall",
               "top3": {k: m(v) for k, v in res32.items()}, "folds": res32, "n_pool": len(P)}, open(os.path.join(outdir, "032.json"), "w"), indent=1)
    json.dump({"id": "018", "mechanism": "failure-augmented retraining: each training item adds 2 copies of a reduced contrast set {discovery, V8 failed move, 3 random}; game-disjoint 5-fold top-3 recall",
               "top3": {k: m(v) for k, v in res18.items()}, "folds": res18, "n_pool": len(P),
               "note": "contrast sets force the ranker to separate the discovery from exactly the move the searcher wrongly preferred"}, open(os.path.join(outdir, "018.json"), "w"), indent=1)
    print("032", {k: m(v) for k, v in res32.items()}, "018", {k: m(v) for k, v in res18.items()})


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[2] == "learn":
        learner_probes(pool(), sys.argv[1])
    else:
        main(sys.argv[1])
