"""Memory controls (Wave D2/D3) at EQUAL NODES (so only memory can change the decision).
Positions: from archived V8/V9 match games, positions where the native engine (PlanMemory on) had predicted the
opponent's actual reply on its previous move (i.e. a live, ON_TRACK plan exists). For each position three conditions:
  correct   : full game history up to the position, PlanMemory on (plan state = the engine's own prediction)
  reset     : FEN restore only (memoryless; identical legal state incl. castling/EP; repetition history absent)
  wrong     : the engine first plays a DIFFERENT game prefix (from another game) so its plan state is irrelevant/incorrect,
              then the position is sent by FEN -> plan must RESET (resists irrelevant narrative)
Metrics: decision differs?, Stockfish 16 d14 cp-loss of each decision, plan status reported by the engine.
Usage: python tools/memory_controls.py out.json N nodes"""
import glob
import json
import subprocess
import sys

import chess
import chess.engine
import chess.pgn

ROOT = __file__.rsplit("/tools/", 1)[0]


class E:
    def __init__(self, plan=True):
        self.p = subprocess.Popen([ROOT + "/native/chimera"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.w(f"setoption name PlanMemory value {'true' if plan else 'false'}"); self.w("isready"); self.r("readyok")

    def w(self, s):
        self.p.stdin.write(s + "\n"); self.p.stdin.flush()

    def r(self, pre):
        lines = []
        while True:
            l = self.p.stdout.readline(); lines.append(l)
            if l.startswith(pre):
                return l, lines

    def go(self, pos, nodes):
        self.w(pos); self.w(f"go nodes {nodes}")
        best, lines = self.r("bestmove")
        plan = next((l for l in reversed(lines) if l.startswith("info string plan")), "")
        st = next((t.split("=")[1] for t in plan.split() if t.startswith("status=")), "?")
        pred = next((t.split("=")[1] for t in plan.split() if t.startswith("pred_reply=")), None)
        return best.split()[1], st, pred


def main(out, n, nodes):
    games = []
    for path in sorted(glob.glob(ROOT + "/evidence/v9/matches/*.pgn"))[:6]:
        with open(path) as f:
            while True:
                g = chess.pgn.read_game(f)
                if g is None:
                    break
                games.append([m.uci() for m in g.mainline_moves()])
    e = E(); e_off = E(plan=False)
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); sf.configure({"Threads": 1, "Hash": 32})
    rows = []
    gi = 0
    while len(rows) < n and gi < len(games):
        mv = games[gi]; other = games[(gi + 7) % len(games)]; gi += 1
        # walk the game as the engine's own side would see it; find ply k where engine's prediction came true
        e.w("ucinewgame")
        for k in range(12, min(len(mv) - 2, 80), 2):
            prefix = " ".join(mv[:k])
            m0, _, pred = e.go(f"position startpos moves {prefix}", nodes)
            if k + 1 < len(mv) and m0 == mv[k] and pred == mv[k + 1]:
                # engine to move again at ply k+2 with the predicted reply played (we replay the game's actual moves)
                hist = " ".join(mv[:k + 2])
                b = chess.Board()
                for u in mv[:k + 2]:
                    b.push_uci(u)
                if b.is_game_over():
                    break
                # correct: continuation of the engine's own plan requires its own move at ply k to equal the game move
                e.w("ucinewgame"); e.go(f"position startpos moves {' '.join(mv[:k])}", nodes)
                c_move, c_st, _ = e.go(f"position startpos moves {hist}", nodes)
                e_off.w("ucinewgame"); e_off.go(f"position startpos moves {' '.join(mv[:k])}", nodes)
                o_move, _, _ = e_off.go(f"position startpos moves {hist}", nodes)
                e.w("ucinewgame"); r_move, r_st, _ = e.go(f"position fen {b.fen()}", nodes)
                e.w("ucinewgame"); e.go(f"position startpos moves {' '.join(other[:20])}", nodes)
                w_move, w_st, _ = e.go(f"position fen {b.fen()}", nodes)
                best = sf.analyse(b, chess.engine.Limit(depth=14)); bs = best["score"].relative.score(mate_score=100000)
                def loss(u):
                    v = sf.analyse(b, chess.engine.Limit(depth=14), root_moves=[chess.Move.from_uci(u)])["score"].relative.score(mate_score=100000)
                    return 0 if bs >= 90000 and v >= 90000 else max(0, min(1000, bs - v))
                rows.append({"game": gi, "ply": k + 2, "fen": b.fen(), "correct": c_move, "correct_status": c_st, "reset": r_move, "reset_status": r_st,
                             "wrong": w_move, "wrong_status": w_st, "correct_planoff": o_move,
                             "loss_correct": loss(c_move), "loss_reset": loss(r_move), "loss_wrong": loss(w_move), "loss_correct_planoff": loss(o_move)})
                print(len(rows), c_st, r_st, w_st, c_move, r_move, w_move, flush=True)
                break
    e.w("quit"); e_off.w("quit"); sf.quit()
    m = len(rows)
    summ = {"positions": m, "nodes": nodes,
            "correct_status_counts": {s: sum(r["correct_status"] == s for r in rows) for s in set(r["correct_status"] for r in rows)},
            "wrong_status_counts": {s: sum(r["wrong_status"] == s for r in rows) for s in set(r["wrong_status"] for r in rows)},
            "decision_differs_correct_vs_reset": sum(r["correct"] != r["reset"] for r in rows),
            "decision_differs_wrong_vs_reset": sum(r["wrong"] != r["reset"] for r in rows),
            "mean_loss_correct": round(sum(r["loss_correct"] for r in rows) / max(m, 1), 1),
            "mean_loss_reset": round(sum(r["loss_reset"] for r in rows) / max(m, 1), 1),
            "mean_loss_wrong": round(sum(r["loss_wrong"] for r in rows) / max(m, 1), 1),
            "mean_loss_correct_planoff": round(sum(r["loss_correct_planoff"] for r in rows) / max(m, 1), 1),
            "decision_differs_correct_vs_planoff": sum(r["correct"] != r["correct_planoff"] for r in rows)}
    import math
    for a, b2 in (("loss_correct", "loss_reset"), ("loss_correct", "loss_correct_planoff"), ("loss_correct_planoff", "loss_reset")):
        d = [r[a] - r[b2] for r in rows]
        if m > 1:
            mu = sum(d) / m; sd = math.sqrt(sum((x - mu) ** 2 for x in d) / (m - 1))
            summ[f"paired_{a}_minus_{b2}"] = {"mean": round(mu, 1), "t": round(mu / (sd / math.sqrt(m)), 2) if sd > 0 else None}
    json.dump({"summary": summ, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
