"""Loss-by-loss diagnosis: for every game CHIMERA lost, find its largest Stockfish-measured
error (depth 12, 1 thread) and classify it. Usage: python tools/loss_analysis.py <match.pgn> <out.json>"""
import json
import sys

import chess
import chess.engine
import chess.pgn

SF = "/usr/games/stockfish"


def cp(info, color):
    return info["score"].pov(color).score(mate_score=10000)


def main(pgn_path, out):
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({"Threads": 1, "Hash": 32})
    rows = []
    f = open(pgn_path)
    while True:
        g = chess.pgn.read_game(f)
        if g is None:
            break
        res = g.headers["Result"]
        cw = g.headers["White"].startswith("chimera")
        lost = (res == "0-1" and cw) or (res == "1-0" and not cw)
        if not lost:
            continue
        us = chess.WHITE if cw else chess.BLACK
        b = g.board()
        worst = None
        for mv in g.mainline_moves():
            if b.turn == us and b.ply() >= 8:
                before = cp(eng.analyse(b, chess.engine.Limit(depth=12)), us)
                mat_before = _material(b, us)
                b.push(mv)
                after = cp(eng.analyse(b, chess.engine.Limit(depth=12)), us)
                drop = before - after
                if before > -300 and (worst is None or drop > worst["drop_cp"]):  # decisive error: position not yet lost
                    worst = {"ply": b.ply(), "move": mv.uci(), "fen_before": None, "before_cp": before,
                             "after_cp": after, "drop_cp": drop, "material_before": mat_before}
                    b.pop()
                    worst["fen_before"] = b.fen()
                    best = eng.analyse(b, chess.engine.Limit(depth=12))
                    worst["sf_best"] = best["pv"][0].uci()
                    b2 = b.copy()
                    b2.push(mv)
                    pv = eng.analyse(b2, chess.engine.Limit(depth=12)).get("pv", [])
                    for m in pv[:4]:
                        b2.push(m)
                    worst["material_after_sf_pv4"] = _material(b2, us)
                    b.push(mv)
            else:
                b.push(mv)
        if worst:
            mloss = worst["material_before"] - worst["material_after_sf_pv4"]
            if worst["after_cp"] <= -9000:
                cls = "allowed forced mate (tactical blindness / king safety)"
            elif mloss >= 250:
                cls = "material loss within 4 plies (hanging piece / missed tactic)"
            elif worst["drop_cp"] >= 150:
                cls = "positional or horizon misjudgement (no immediate material loss)"
            else:
                cls = "gradual: no single move lost >=150cp"
            worst["class"] = cls
        rows.append({"round": g.headers["Round"], "opening": g.headers["Opening"], "white": g.headers["White"],
                     "termination": g.headers.get("Termination"), "plies": b.ply(), "worst": worst})
        print(g.headers["Round"], worst and worst["class"], worst and worst["drop_cp"], flush=True)
    eng.quit()
    from collections import Counter
    summary = Counter(r["worst"]["class"] for r in rows if r["worst"])
    json.dump({"games_lost": len(rows), "classes": summary, "rows": rows}, open(out, "w"), indent=1)
    print(dict(summary))


def _material(b, color):
    v = {1: 100, 2: 320, 3: 330, 4: 500, 5: 950, 6: 0}
    s = 0
    for p in b.piece_map().values():
        s += v[p.piece_type] * (1 if p.color == color else -1)
    return s


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
