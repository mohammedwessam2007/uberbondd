"""Sixth Instinct discovery lab, first functioning slice (Wave E).
mine   : CC0 Lichess puzzle positions (16MB slice) disjoint from every evaluation suite/game; a 'discovery' is the
         puzzle's first solution move when Stockfish 16 d14 confirms it within 30cp of best AND native V8 at 100 ms
         does NOT play it (a search-gap idea). Negatives are all other legal moves of the same position.
archive: MAP-Elites grid, cell = (motif family, horizon bucket); quality = SF gain of the discovery over V8's move.
student: listwise-softmax linear ranker over interpretable move features (+ Maia3 log-prior), trained with numpy.
transfer: leave-one-family-out top-k recall vs (a) Maia3 prior ranking, (b) uniform random, on unseen families.
Usage: python tools/discovery_lab.py mine /tmp/puzzles16.csv lab/discovery_pool.jsonl N
       python tools/discovery_lab.py train lab/discovery_pool.jsonl lab/student_prior.json evidence/v11/discovery_report.json"""
import hashlib
import json
import math
import sys

import chess
import chess.engine
import numpy as np

ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
VAL = {1: 1, 2: 3, 3: 3, 4: 5, 5: 9, 6: 0}


def family(b, m):
    p = b.piece_type_at(m.from_square)
    if m.promotion:
        return "promotion"
    if p == chess.KING:
        return "king-move"
    cap = b.is_capture(m)
    b.push(m)
    chk = b.is_check()
    hang = bool(b.attackers(b.turn, m.to_square)) and (not cap or VAL[p] > VAL.get(b.piece_type_at(m.to_square) or 1, 1))
    b.pop()
    if hang and not cap:
        return "quiet-offer"
    if cap and hang:
        return "capture-sacrifice"
    if chk:
        return "check"
    if cap:
        return "capture"
    return "quiet"


def feats(b, m, logp):
    us = b.turn
    p = b.piece_type_at(m.from_square)
    ek = b.king(not us)
    cap = b.piece_type_at(m.to_square) if b.is_capture(m) else 0
    f = [1.0 if p == t else 0.0 for t in range(1, 7)]
    f += [VAL.get(cap, 1 if b.is_en_passant(m) else 0) / 9.0, 1.0 if m.promotion else 0.0]
    b.push(m)
    chk = 1.0 if b.is_check() else 0.0
    attacked = 1.0 if b.attackers(b.turn, m.to_square) else 0.0
    defended = 1.0 if b.attackers(us, m.to_square) else 0.0
    opp_moves = b.legal_moves.count()
    zone = chess.SquareSet(chess.BB_KING_ATTACKS[ek]) if ek is not None else chess.SquareSet()
    press = sum(1 for z in zone if b.attackers(us, z))
    b.pop()
    dist = chess.square_distance(m.to_square, ek) / 7 if ek is not None else 0
    rank = (chess.square_rank(m.to_square) if us else 7 - chess.square_rank(m.to_square)) / 7
    f += [chk, attacked, attacked * (1 - defended), attacked * VAL[p] / 9.0, dist, rank, press / 8, math.log1p(opp_moves) / 4,
          1.0 if (cap == 0 and not chk) else 0.0, logp]
    return f


FEATS = ["P", "N", "B", "R", "Q", "K", "capture_value", "promotion", "check", "dest_attacked", "dest_hanging",
         "offer_value", "dist_enemy_king", "dest_rank", "king_zone_pressure", "log_opp_moves", "quiet", "maia_logp"]


def gid(u):
    p = [x for x in u.split("lichess.org/")[-1].split("#")[0].split("/") if x and x != "game"]
    return p[0] if p else ""


def mine(src, out, n, shard=0, nshards=1):
    import csv
    from chimera.maia import MaiaPolicy
    used = set()
    for f in ("evidence/creative/bench.json", "evidence/v8/heldout_suite.json", "evidence/v8/hard_sac_suite.json",
              "evidence/v11/headroom_suite.json"):
        try:
            used |= {i["id"].replace("-neg", "") for i in json.load(open(f))["items"]}
        except FileNotFoundError:
            pass
    rows = list(csv.DictReader(open(src)))
    used_games = {gid(r["GameUrl"]) for r in rows if r["PuzzleId"] in used}
    maia = MaiaPolicy()
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    sf.configure({"Threads": 1, "Hash": 32})
    kept = scanned = 0
    import glob as _g
    have = set()
    for fp in _g.glob(out.rsplit("/", 1)[0] + "/discovery_pool*.jsonl"):
        have |= {json.loads(l)["id"] for l in open(fp) if l.strip()}
    with open(out, "a") as fo:
        for r in sorted(rows, key=lambda r: hashlib.sha256(("mine" + r["PuzzleId"]).encode()).hexdigest()):
            if kept >= n:
                break
            if r["PuzzleId"] in used or gid(r["GameUrl"]) in used_games or r["PuzzleId"] in have:
                continue
            if int(hashlib.sha256(("shard" + r["PuzzleId"]).encode()).hexdigest(), 16) % nshards != shard:
                continue
            mv = r["Moves"].split()
            b = chess.Board(r["FEN"])
            b.push_uci(mv[0])
            sol = chess.Move.from_uci(mv[1])
            scanned += 1
            v8 = me.play(b, chess.engine.Limit(time=0.1)).move
            if v8 == sol:
                continue
            best = sf.analyse(b, chess.engine.Limit(depth=14))
            bs = best["score"].pov(b.turn).score(mate_score=100000)
            ss = sf.analyse(b, chess.engine.Limit(depth=14), root_moves=[sol])["score"].pov(b.turn).score(mate_score=100000)
            vs = sf.analyse(b, chess.engine.Limit(depth=14), root_moves=[v8])["score"].pov(b.turn).score(mate_score=100000)
            if ss < bs - 30 or ss - vs < 50:
                continue
            probs, _ = maia.predict(b, 2200)
            legal = list(b.legal_moves)
            X = [feats(b, m, math.log(max(probs.get(m.uci(), 1e-6), 1e-6)) / 10) for m in legal]
            fo.flush() if False else None
            fo.write(json.dumps({"id": r["PuzzleId"], "game": gid(r["GameUrl"]), "fen": b.fen(), "solution": sol.uci(),
                                 "family": family(b, sol), "horizon": min(len(mv) - 1, 7), "gain_vs_v8": ss - vs,
                                 "v8": v8.uci(), "legal": [m.uci() for m in legal], "X": X,
                                 "maia_rank": sorted(probs, key=lambda u: -probs[u]).index(sol.uci()) if sol.uci() in probs else 999}) + "\n")
            kept += 1
            if kept % 25 == 0:
                print(kept, scanned, flush=True)
    me.quit(); sf.quit()
    print("kept", kept, "scanned", scanned)


def softmax_train(data, epochs=60, lr=0.05, l2=1e-3, seed=0):
    rng = np.random.default_rng(seed)
    w = np.zeros(len(FEATS))
    for _ in range(epochs):
        for i in rng.permutation(len(data)):
            X, y = data[i]
            z = X @ w
            p = np.exp(z - z.max()); p /= p.sum()
            g = X.T @ p - X[y]
            w -= lr * (g + l2 * w)
    return w


def topk(data, scorer, k):
    hit = 0
    for X, y in data:
        s = scorer(X)
        hit += y in np.argsort(-s)[:k]
    return hit / max(1, len(data))


def train(pool, out_student, report):
    recs = [json.loads(l) for l in open(pool)]
    data, fams = [], []
    for r in recs:
        X = np.array(r["X"], float)
        data.append((X, r["legal"].index(r["solution"])))
        fams.append(r["family"])
    rng = np.random.default_rng(1)
    archive = {}
    for r in recs:
        cell = f'{r["family"]}|h{r["horizon"]}'
        a = archive.setdefault(cell, {"count": 0, "elite": None, "elite_gain": -1})
        a["count"] += 1
        if r["gain_vs_v8"] > a["elite_gain"]:
            a["elite_gain"], a["elite"] = r["gain_vs_v8"], {"id": r["id"], "fen": r["fen"], "move": r["solution"]}
    maia_idx = FEATS.index("maia_logp")
    res = {"pool": len(recs), "families": {f: fams.count(f) for f in sorted(set(fams))}, "archive_cells": len(archive),
           "archive": archive, "leave_one_family_out": {}}
    for f in sorted(set(fams)):
        tr = [d for d, ff in zip(data, fams) if ff != f]
        te = [d for d, ff in zip(data, fams) if ff == f]
        if len(te) < 5 or len(tr) < 20:
            continue
        w = softmax_train(tr)
        res["leave_one_family_out"][f] = {
            "n_test": len(te),
            "student_top1": round(topk(te, lambda X: X @ w, 1), 3), "student_top3": round(topk(te, lambda X: X @ w, 3), 3),
            "maia_top1": round(topk(te, lambda X: X[:, maia_idx], 1), 3), "maia_top3": round(topk(te, lambda X: X[:, maia_idx], 3), 3),
            "random_top3": round(float(np.mean([min(3, len(X)) / len(X) for X, _ in te])), 3)}
    # game-disjoint holdout for the shipped student
    ho = [int(hashlib.sha256(r["game"].encode()).hexdigest(), 16) % 5 == 0 for r in recs]
    tr = [d for d, h in zip(data, ho) if not h]
    te = [d for d, h in zip(data, ho) if h]
    w = softmax_train(tr)
    res["game_disjoint_holdout"] = {"n_train": len(tr), "n_test": len(te),
                                    "student_top1": round(topk(te, lambda X: X @ w, 1), 3), "student_top3": round(topk(te, lambda X: X @ w, 3), 3),
                                    "maia_top1": round(topk(te, lambda X: X[:, maia_idx], 1), 3), "maia_top3": round(topk(te, lambda X: X[:, maia_idx], 3), 3)}
    res["student_weights"] = dict(zip(FEATS, [round(float(x), 4) for x in w]))
    json.dump({"features": FEATS, "weights": w.tolist(), "trained_on": pool,
               "pool_sha256": hashlib.sha256(open(pool, "rb").read()).hexdigest()}, open(out_student, "w"), indent=1)
    json.dump(res, open(report, "w"), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != "archive"}, indent=1))


def load_student(path):
    from chimera.maia import MaiaPolicy
    spec = json.load(open(path))
    w = np.array(spec["weights"])
    maia = MaiaPolicy()

    def rank(b):
        probs, _ = maia.predict(b, 2200)
        legal = list(b.legal_moves)
        X = np.array([feats(b, m, math.log(max(probs.get(m.uci(), 1e-6), 1e-6)) / 10) for m in legal])
        return [legal[i] for i in np.argsort(-(X @ w))]
    return rank


if __name__ == "__main__":
    if sys.argv[1] == "mine":
        mine(sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]) if len(sys.argv) > 5 else 0, int(sys.argv[6]) if len(sys.argv) > 6 else 1)
    else:
        train(sys.argv[2], sys.argv[3], sys.argv[4])
