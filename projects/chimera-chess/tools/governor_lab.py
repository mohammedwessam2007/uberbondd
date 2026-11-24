"""Learned value-of-computation governor (Wave G). Data: positions sampled every 7th ply from archived V8 match PGNs
(game-disjoint split by game). For each: native search with GovernorTrace for 4T; the decision point is the first
iteration finishing after the default soft limit (0.55*(T-10ms)); label = 1 if the 4T best move differs AND Stockfish 16
d12 rates it >= 20cp better than the decision-point move. Model: 6-feature logistic regression (numpy).
Usage: python tools/governor_lab.py data out_data.jsonl T_ms N
       python tools/governor_lab.py fit out_data.jsonl evidence/v11/governor_fit.json"""
import glob
import hashlib
import json
import sys

import chess
import chess.engine
import chess.pgn
import numpy as np

ROOT = __file__.rsplit("/tools/", 1)[0]


def run_trace(p, fen, ms):
    p.stdin.write(f"position fen {fen}\ngo movetime {ms}\n"); p.stdin.flush()
    gov = []
    while True:
        l = p.stdout.readline()
        if l.startswith("info string gov"):
            t = l.split()
            gov.append({"depth": int(t[4]), "time": int(t[6]), "best": t[8], "score": int(t[10]), "f": [float(x) for x in t[12:18]]})
        if l.startswith("bestmove"):
            return gov, l.split()[1]


def data(out, T, n):
    import subprocess
    p = subprocess.Popen([ROOT + "/native/chimera"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
    p.stdin.write("setoption name GovernorTrace value true\nisready\n"); p.stdin.flush()
    while not p.stdout.readline().startswith("readyok"):
        pass
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); sf.configure({"Threads": 1, "Hash": 32})
    soft = 0.55 * (T - 10)
    k = 0
    with open(out, "w") as fo:
        for path in sorted(glob.glob(ROOT + "/evidence/v8/matches/*.pgn") + glob.glob(ROOT + "/evidence/v9/matches/*.pgn")):
            f = open(path); gi = 0
            while k < n:
                g = chess.pgn.read_game(f)
                if g is None:
                    break
                gi += 1; gid = f"{path.rsplit('/', 1)[-1]}#{gi}"; b = g.board()
                for ply, mv in enumerate(g.mainline_moves()):
                    b.push(mv)
                    if ply % 7 != 3 or b.is_game_over() or b.legal_moves.count() < 2:
                        continue
                    p.stdin.write("ucinewgame\n"); p.stdin.flush()
                    gov, final = run_trace(p, b.fen(), 4 * T)
                    dp = next((x for x in gov if x["time"] > soft and x["depth"] >= 4), None)
                    if dp is None or not gov:
                        continue
                    lab = 0
                    if final != dp["best"]:
                        s_f = sf.analyse(b, chess.engine.Limit(depth=12), root_moves=[chess.Move.from_uci(final)])["score"].relative.score(mate_score=100000)
                        s_d = sf.analyse(b, chess.engine.Limit(depth=12), root_moves=[chess.Move.from_uci(dp["best"])])["score"].relative.score(mate_score=100000)
                        lab = int(s_f - s_d >= 20)
                    fo.write(json.dumps({"game": gid, "fen": b.fen(), "f": dp["f"], "dp_time": dp["time"], "dp_best": dp["best"],
                                         "final": final, "label": lab}) + "\n")
                    k += 1
                    if k >= n:
                        break
            if k >= n:
                break
    sf.quit(); p.stdin.write("quit\n"); p.stdin.flush()
    print("rows", k)


def fit(path, out):
    rows = [json.loads(l) for l in open(path)]
    X = np.array([[1.0] + r["f"] for r in rows]); y = np.array([r["label"] for r in rows], float)
    ho = np.array([int(hashlib.sha256(r["game"].encode()).hexdigest(), 16) % 4 == 0 for r in rows])
    w = np.zeros(X.shape[1])
    for _ in range(4000):
        p = 1 / (1 + np.exp(-X[~ho] @ w))
        w -= 0.1 * (X[~ho].T @ (p - y[~ho]) / (~ho).sum() + 1e-3 * np.r_[0, w[1:]])
    pt = 1 / (1 + np.exp(-X[ho] @ w))

    def auc(s, t):
        pos, neg = s[t == 1], s[t == 0]
        if len(pos) == 0 or len(neg) == 0:
            return None
        return float(np.mean([(a > b) + 0.5 * (a == b) for a in pos for b in neg]))
    # baseline: "best move changed at last iteration" alone (a common hand rule)
    res = {"rows": len(rows), "positive_rate": float(y.mean()), "train": int((~ho).sum()), "holdout": int(ho.sum()),
           "weights": w.tolist(), "holdout_auc_logistic": auc(pt, y[ho]), "holdout_auc_changed_flag": auc(X[ho][:, 3], y[ho]),
           "holdout_auc_stability": auc(-X[ho][:, 1], y[ho])}
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    if sys.argv[1] == "data":
        data(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
    else:
        fit(sys.argv[2], sys.argv[3])
