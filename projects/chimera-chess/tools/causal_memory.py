"""V13 D2 causal-memory intervention test (equal nodes, TT cleared before the measured search).
For each position P (every 11th ply of archived V9 match games): a fresh engine searches P (N nodes) and records a plan;
the engine's own PV move m1 and predicted reply r1 are appended (so the plan is ON_TRACK), the TT is cleared
(setoption Hash), and the engine searches P+m1+r1 again at N nodes under five conditions:
  correct    PlanMemory + PlanBias (causal channel: interior ordering of plan target squares + root extension of plan move)
  disabled   PlanMemory only (identical plan state; channel off -> only root ordering)
  none       PlanMemory off
  wrong      PlanMemory + PlanBias + PlanCorrupt (mirrored targets, a different quiet move as 'next')
  irrelevant PlanMemory + PlanBias, but the first search was on a position from ANOTHER game (plan must reset)
Metrics: decision, oracle loss (lab/oracle.py, 300k nodes), whether the decision equals the channel's suggested move.
Prediction (pre-registered, evidence/v13/PREREG_causal_memory.md): correct changes decisions vs disabled in >=10% of
positions; wrong increases mean loss vs disabled; irrelevant behaves like none. Usage: python tools/causal_memory.py out.json N nodes"""
import glob, json, subprocess, sys, random
import chess, chess.pgn
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from lab.oracle import Oracle

COND = {"correct": (1, 1, 0), "disabled": (1, 0, 0), "none": (0, 0, 0), "wrong": (1, 1, 1), "irrelevant": (1, 1, 0)}


def positions(n):
    out = []
    for path in sorted(glob.glob(ROOT + "/evidence/v9/matches/*.pgn")):
        f = open(path)
        while True:
            g = chess.pgn.read_game(f)
            if g is None:
                break
            b = g.board()
            for ply, mv in enumerate(g.mainline_moves()):
                b.push(mv)
                if ply % 11 == 7 and not b.is_game_over() and b.legal_moves.count() > 5 and ply < 80:
                    out.append(b.fen())
    random.Random(13).shuffle(out)
    return out[:n]


def session(cmds):
    o = subprocess.run([ROOT + "/native/chimera"], input="\n".join(cmds) + "\nquit\n", capture_output=True, text=True).stdout
    return o.splitlines()


def lastpv(lines):
    pv = []
    for l in lines:
        t = l.split()
        if l.startswith("info") and " pv " in l:
            pv = t[t.index("pv") + 1:]
    return pv


def run(fen, other, cond, nodes):
    pm, pb, pc = COND[cond]
    opts = [f"setoption name PlanMemory value {'true' if pm else 'false'}", f"setoption name PlanBias value {'true' if pb else 'false'}",
            f"setoption name PlanCorrupt value {'true' if pc else 'false'}", "isready"]
    first = other if cond == "irrelevant" else fen
    l1 = session(opts + [f"position fen {first}", f"go nodes {nodes}", "isready"])
    pv = lastpv(l1)
    if len(pv) < 2:
        return None
    # reproduce first search inside the measured session (deterministic: same options, fresh engine)
    seq = opts + [f"position fen {first}", f"go nodes {nodes}", "isready"]
    if cond == "irrelevant":
        b = chess.Board(fen); pv0 = lastpv(session(opts + [f"position fen {fen}", f"go nodes {nodes}", "isready"]))
        if len(pv0) < 2:
            return None
        m1, r1 = pv0[0], pv0[1]
    else:
        m1, r1 = pv[0], pv[1]
    pos2 = f"position fen {fen} moves {m1} {r1}" if cond != "irrelevant" else f"position fen {fen} moves {m1} {r1}"
    lines = session(seq + ["setoption name Hash value 16", pos2, f"go nodes {nodes}", "isready"])
    best = [l.split()[1] for l in lines if l.startswith("bestmove")][-1]
    plan = [l for l in lines if l.startswith("info string plan ")]
    pbias = [l for l in lines if l.startswith("info string planbias")]
    b = chess.Board(fen); b.push_uci(m1); b.push_uci(r1)
    return {"fen2": b.fen(), "best": best, "status": plan[-1].split()[4].split("=")[1] if plan else "", "bias_next": pbias[-1].split()[4] if pbias else None,
            "m1": m1, "r1": r1}


def main(out, n, nodes):
    o = Oracle(); pos = positions(n + 1); rows = []
    for i, fen in enumerate(pos[:n]):
        other = pos[(i + 1) % len(pos)]
        row = {"fen": fen}
        for c in COND:
            r = run(fen, other, c, nodes)
            if r is None:
                row = None; break
            r["loss"] = o.loss(r["fen2"], r["best"], 300000)
            row[c] = r
        if row:
            rows.append(row); print(i, {c: (row[c]["best"], row[c]["loss"], row[c]["status"]) for c in COND}, flush=True)
    o.close()
    def rate(a, b): return sum(r[a]["best"] != r[b]["best"] for r in rows) / len(rows)
    def ml(c): return sum(r[c]["loss"] for r in rows) / len(rows)
    import random as R
    def boot(a, b, k=2000):
        d = [r[a]["loss"] - r[b]["loss"] for r in rows]; rng = R.Random(1); s = []
        for _ in range(k):
            x = [d[rng.randrange(len(d))] for _ in d]; s.append(sum(x) / len(x))
        s.sort(); return [round(sum(d) / len(d), 2), round(s[int(.025 * k)], 2), round(s[int(.975 * k)], 2)]
    summ = {"n": len(rows), "nodes": nodes, "on_track_rate_correct": sum(r["correct"]["status"] == "ON_TRACK" for r in rows) / len(rows),
            "decision_change": {"correct_vs_disabled": rate("correct", "disabled"), "wrong_vs_disabled": rate("wrong", "disabled"),
                                "irrelevant_vs_none": rate("irrelevant", "none"), "disabled_vs_none": rate("disabled", "none")},
            "mean_loss": {c: round(ml(c), 2) for c in COND},
            "loss_diff_ci95": {"correct-disabled": boot("correct", "disabled"), "wrong-disabled": boot("wrong", "disabled"),
                               "correct-none": boot("correct", "none")},
            "followed_bias": {c: sum(r[c]["bias_next"] is not None and r[c]["best"] == r[c]["bias_next"] for r in rows) for c in ("correct", "wrong")}}
    json.dump({"summary": summ, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
