"""A1 factorial diagnosis: evaluator x pruning margins. For each configuration and each of N fixed game positions:
(a) search to fixed depth D -> nodes, statistics (TT hit rate, null-move cut rate, LMR re-search rate, first-move cutoff rate,
    qnode share, RFP/futility prunes); (b) decision at fixed nodes -> deterministic oracle loss (lab/oracle.py).
Positions: every 13th ply of the archived V9 match PGNs (not tuning data for anything else).
Usage: python tools/eval_search_factorial.py out.json N depth decision_nodes"""
import glob, json, subprocess, sys
import chess, chess.pgn
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from lab.oracle import Oracle
NET = ROOT + "/nnue/v12/eval_v4_residual.bin"
EVALS = {"EvalV2": (2, 100), "residual_full": (3, 100), "residual_x0.5": (3, 50)}
MARGINS = {"default_120_150": (120, 150), "narrow_80_100": (80, 100), "wide_180_225": (180, 225)}


def positions(n):
    out = []
    for path in sorted(glob.glob(ROOT + "/evidence/v9/matches/*.pgn")):
        f = open(path)
        while len(out) < n:
            g = chess.pgn.read_game(f)
            if g is None:
                break
            b = g.board()
            for ply, mv in enumerate(g.mainline_moves()):
                b.push(mv)
                if ply % 13 == 6 and not b.is_game_over() and b.legal_moves.count() > 3:
                    out.append(b.fen())
        if len(out) >= n:
            break
    return out[:n]


def run(cfg, fen, depth, dnodes):
    ev, sc, rfp, fut = cfg
    cmd = (f"setoption name EvalFile value {NET}\nsetoption name EvalVersion value {ev}\nsetoption name NNResidualScale value {sc}\n"
           f"setoption name RFPMargin value {rfp}\nsetoption name FutilityMargin value {fut}\nsetoption name SearchStats value true\n"
           f"ucinewgame\nposition fen {fen}\ngo depth {depth}\nisready\nucinewgame\nposition fen {fen}\ngo nodes {dnodes}\nisready\nquit\n")
    o = subprocess.run([ROOT + "/native/chimera"], input=cmd, capture_output=True, text=True).stdout.splitlines()
    stats = [l for l in o if l.startswith("info string stats")]
    best = [l.split()[1] for l in o if l.startswith("bestmove")]
    t = stats[0].split()
    st = {t[i]: float(t[i + 1]) for i in range(3, len(t) - 1, 2)}
    return st, best[1]


def main(out, n, depth, dnodes):
    o = Oracle()
    pos = positions(n)
    res = {}
    for en, (ev, sc) in EVALS.items():
        for mn, (rfp, fut) in MARGINS.items():
            rows = []
            for fen in pos:
                st, mv = run((ev, sc, rfp, fut), fen, depth, dnodes)
                st["loss"] = o.loss(fen, mv, 300000)
                rows.append(st)
            k = f"{en}|{mn}"
            agg = {m: round(sum(r[m] for r in rows) / len(rows), 4) for m in rows[0]}
            agg["median_nodes"] = sorted(r["nodes"] for r in rows)[len(rows) // 2]
            res[k] = agg
            print(k, {x: agg[x] for x in ("nodes", "median_nodes", "tt_hit_rate", "null_cut_rate", "lmr_research_rate", "first_move_cut_rate", "loss")}, flush=True)
    o.close()
    json.dump({"positions": len(pos), "depth": depth, "decision_nodes": dnodes, "oracle_nodes": 300000, "configs": res}, open(out, "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]))
