"""Counterfactual Blacksmith (#008 / #052 / #027): make a failed combination possible.
Input: evidence/v9/hard_sac_negatives.json - sound sacrifices S whose position was altered by removing ONE attacking
piece (the known missing ingredient), so S now loses >= 150cp (SF16 d18).
For every legal preparatory move P != S: opponent replies with native V8's best move R (fixed 20k nodes); if S is still
legal, Stockfish 16 depth 14 scores S and the best move in the resulting position.
 'restores' = S is within 30cp of the SF best move AND S scores >= +100 for us (i.e. the sacrifice is again sound & winning).
Blacksmith selection = the preparation chosen by native V8 search restricted to preparations that keep S legal
(go searchmoves P1..Pk, 20k nodes per... ) - we score both:
 (a) oracle coverage: share of failed sacrifices for which ANY legal preparation restores S;
 (b) Blacksmith pick: share where the engine-chosen preparation (ranked by native eval of the position after P,R,S)
     restores S; compared with (c) the random-preparation rate (mean over all P) - the control.
 (d) causal check: does the successful preparation interact with the removed ingredient's square (moves to it, or
     attacks it / the enemy king zone it covered)?
Usage: python tools/blacksmith.py out.json [limit]"""
import json
import sys

import chess
import chess.engine

ROOT = __file__.rsplit("/tools/", 1)[0]


def rel(info):
    return info["score"].relative.score(mate_score=100000)


def main(out, limit=37):
    items = json.load(open(ROOT + "/evidence/v9/hard_sac_negatives.json"))["items"][:limit]
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    sf.configure({"Threads": 1, "Hash": 32})
    rows = []
    for it in items:
        b0 = chess.Board(it["fen"])
        S = chess.Move.from_uci(it["forbidden"])
        removed = chess.parse_square(it["removed"])
        us = b0.turn
        preps = []
        for P in list(b0.legal_moves):
            if P == S:
                continue
            b = b0.copy()
            b.push(P)
            if b.is_game_over():
                continue
            R = me.play(b, chess.engine.Limit(nodes=20000)).move
            b.push(R)
            if S not in b.legal_moves:
                continue
            # engine's own (cheap) view: native eval after S at 20k nodes, used only for the Blacksmith ranking
            bs = b.copy(); bs.push(S)
            own = -rel(me.analyse(bs, chess.engine.Limit(nodes=20000))) if not bs.is_game_over() else (100000 if bs.is_checkmate() else 0)
            preps.append({"P": P.uci(), "R": R.uci(), "own": own, "board": b.fen()})
        # verify each surviving preparation with Stockfish (independent)
        for p in preps:
            b = chess.Board(p["board"])
            best = sf.analyse(b, chess.engine.Limit(depth=14))
            sc_best = rel(best)
            sc_S = rel(sf.analyse(b, chess.engine.Limit(depth=14), root_moves=[S]))
            p["sf_S"], p["sf_best"] = sc_S, sc_best
            p["restores"] = sc_S >= sc_best - 30 and sc_S >= 100
            Pm = chess.Move.from_uci(p["P"])
            bb = b0.copy()
            bb.push(Pm)
            p["touches_missing_square"] = Pm.to_square == removed or bool(bb.attacks(Pm.to_square) & chess.BB_SQUARES[removed])
        pick = max(preps, key=lambda p: p["own"]) if preps else None
        row = {"id": it["id"], "removed": it["removed"], "sacrifice": it["forbidden"], "n_preparations": len(preps),
               "n_restoring": sum(p["restores"] for p in preps), "random_rate": (sum(p["restores"] for p in preps) / len(preps)) if preps else 0.0,
               "blacksmith_pick": pick["P"] if pick else None, "blacksmith_restores": bool(pick and pick["restores"]),
               "restoring_touch_missing": sum(p["restores"] and p["touches_missing_square"] for p in preps),
               "nonrestoring_touch_missing": sum((not p["restores"]) and p["touches_missing_square"] for p in preps),
               "preparations": preps}
        rows.append(row)
        print(it["id"], "preps", len(preps), "restoring", row["n_restoring"], "pick", row["blacksmith_pick"], row["blacksmith_restores"], flush=True)
    me.quit(); sf.quit()
    n = len(rows)
    rest = [r for r in rows if r["n_restoring"]]
    tr = sum(r["restoring_touch_missing"] for r in rows); tn = sum(r["n_restoring"] for r in rows)
    nr = sum(r["nonrestoring_touch_missing"] for r in rows); nn = sum(r["n_preparations"] - r["n_restoring"] for r in rows)
    summ = {"positions": n, "oracle_any_restoring": len(rest),
            "blacksmith_pick_restores": sum(r["blacksmith_restores"] for r in rows),
            "expected_random_pick_restores": round(sum(r["random_rate"] for r in rows), 2),
            "touch_missing_rate_among_restoring": round(tr / max(tn, 1), 3),
            "touch_missing_rate_among_nonrestoring": round(nr / max(nn, 1), 3)}
    json.dump({"summary": summ, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 37)
