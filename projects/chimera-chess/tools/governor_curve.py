"""Governor learning curves (Wave H1/H2), deterministic and contention-proof.
For each position (every 5th ply of archived V8-V11 match games, game-sharded): native search at fixed node budgets
B = 25k, 50k, 100k, 200k, 400k with GovernorTrace; record the move and the last-iteration features at each budget.
Decision quality = deterministic Stockfish 16 score (ucinewgame before each analysis, 300k nodes) of the chosen move.
Label for budget B: gain(B -> 4B) = score(move@4B) - score(move@B) >= 25cp ("more computation meaningfully helps").
Usage: python tools/governor_curve.py data out.jsonl N shard nshards
       python tools/governor_curve.py fit evidence/v12/governor/curve_fit.json data1.jsonl data2.jsonl ..."""
import glob, hashlib, json, math, subprocess, sys
import chess, chess.engine, chess.pgn
import numpy as np
ROOT = __file__.rsplit("/tools/", 1)[0]
BUD = [25000, 50000, 100000, 200000, 400000]


def search(p, fen, nodes):
    p.stdin.write(f"ucinewgame\nposition fen {fen}\ngo nodes {nodes}\n"); p.stdin.flush()
    feats = None
    while True:
        l = p.stdout.readline()
        if l.startswith("info string gov"):
            t = l.split(); feats = [float(x) for x in t[12:18]] + [int(t[4]), int(t[10])]
        if l.startswith("bestmove"):
            return l.split()[1], feats


def data(out, n, shard, nshards):
    p = subprocess.Popen([ROOT + "/native/chimera"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
    p.stdin.write("setoption name GovernorTrace value true\nisready\n"); p.stdin.flush()
    while not p.stdout.readline().startswith("readyok"):
        pass
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); sf.configure({"Threads": 1, "Hash": 32})
    cache = {}

    def det(fen, mv):
        if (fen, mv) not in cache:
            sf.protocol.send_line("ucinewgame")
            cache[(fen, mv)] = sf.analyse(chess.Board(fen), chess.engine.Limit(nodes=300000), root_moves=[chess.Move.from_uci(mv)],
                                          game=object())["score"].relative.score(mate_score=100000)
        return cache[(fen, mv)]
    k = 0
    with open(out, "w") as fo:
        for path in sorted(glob.glob(ROOT + "/evidence/v*/matches/*.pgn")):
            f = open(path); gi = 0
            while k < n:
                g = chess.pgn.read_game(f)
                if g is None:
                    break
                gi += 1; gid = f"{path.rsplit('/', 2)[-2]}/{path.rsplit('/', 1)[-1]}#{gi}"
                if int(hashlib.sha256(gid.encode()).hexdigest(), 16) % nshards != shard:
                    continue
                b = g.board()
                for ply, mv in enumerate(g.mainline_moves()):
                    b.push(mv)
                    if ply % 5 != 2 or b.is_game_over() or b.legal_moves.count() < 2:
                        continue
                    fen = b.fen()
                    res = [search(p, fen, nb) for nb in BUD]
                    if any(r[1] is None for r in res):
                        continue
                    sc = [max(-3000, min(3000, det(fen, r[0]))) for r in res]
                    fo.write(json.dumps({"game": gid, "fen": fen, "moves": [r[0] for r in res], "feats": [r[1] for r in res], "sf": sc}) + "\n")
                    k += 1
                    if k >= n:
                        break
            if k >= n:
                break
    sf.quit(); p.stdin.write("quit\n"); p.stdin.flush()
    print("rows", k)


def fit(out, files):
    rows = [json.loads(l) for f in files for l in open(f) if l.strip()]
    X, y, gids = [], [], []
    for r in rows:
        for i in range(len(BUD) - 2):  # budget B=BUD[i], compare with 4B = BUD[i+2]
            f = r["feats"][i]
            X.append([1.0] + f[:6] + [math.log(BUD[i]) / 13, min(1.0, abs(f[7]) / 1000)])
            y.append(int(r["sf"][i + 2] - r["sf"][i] >= 25)); gids.append(r["game"])
    X = np.array(X); y = np.array(y, float)
    ho = np.array([int(hashlib.sha256(g.encode()).hexdigest(), 16) % 4 == 0 for g in gids])
    w = np.zeros(X.shape[1])
    pos_w = (1 - y[~ho].mean()) / max(y[~ho].mean(), 1e-6)  # class reweighting
    for _ in range(6000):
        pr = 1 / (1 + np.exp(-X[~ho] @ w)); wt = np.where(y[~ho] == 1, pos_w, 1.0)
        w -= 0.1 * (X[~ho].T @ ((pr - y[~ho]) * wt) / wt.sum() + 1e-3 * np.r_[0, w[1:]])
    pt = 1 / (1 + np.exp(-X[ho] @ w))

    def auc(s, t):
        pos, neg = s[t == 1], s[t == 0]
        if len(pos) == 0 or len(neg) == 0:
            return None
        order = np.argsort(np.r_[pos, neg]); ranks = np.empty(len(order)); ranks[order] = np.arange(1, len(order) + 1)
        return float((ranks[:len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))
    res = {"positions": len(rows), "examples": int(len(y)), "positive_rate": round(float(y.mean()), 4), "holdout_n": int(ho.sum()),
           "holdout_positives": int(y[ho].sum()), "weights": np.round(w, 4).tolist(),
           "feature_names": ["bias", "stable/depth", "dscore", "changed", "log_root_moves", "abs_score", "changes/depth", "log_budget", "abs_score_last"],
           "holdout_auc_logistic": auc(pt, y[ho]), "holdout_auc_changed_flag": auc(X[ho][:, 3], y[ho]),
           "holdout_auc_dscore": auc(X[ho][:, 2], y[ho]), "holdout_auc_instability(1-stable)": auc(1 - X[ho][:, 1], y[ho])}
    json.dump(res, open(out, "w"), indent=1); print(json.dumps(res, indent=1))


if __name__ == "__main__":
    if sys.argv[1] == "data":
        data(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
    else:
        fit(sys.argv[2], sys.argv[3:])
