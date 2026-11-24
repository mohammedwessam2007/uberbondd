"""Bounded-loss human preference (G11): play Maia3's predicted human move when V8's own search rates it within
`margin` cp of V8's best (both at 20k nodes). No scripted errors: the loss bound is enforced by our own search, and
every chosen move is re-scored by Stockfish 16 (depth 12) for an independent cp-loss. Positions: the 800 held-out
human positions in evidence/v9/human_match_lichess2013.json (Lichess 2013-01, CC0).
Usage: python tools/humanizer_pareto.py /tmp/lichess/2013-01.pgn.zst out.json"""
import json
import sys

import chess
import chess.engine

ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from chimera.maia import MaiaPolicy  # noqa: E402
from tools.human_match import sample  # noqa: E402

MARGINS = [0, 10, 25, 50, 100, 200]


def score(info):
    return info["score"].relative.score(mate_score=100000)


def main(src, out, n=800):
    pos = sample(src, n)
    maia = MaiaPolicy()
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    sf.configure({"Threads": 1, "Hash": 16})
    rows = []
    for p in pos:
        b = chess.Board()
        for u in p["history"]:
            b.push_uci(u)
        probs, _ = maia.predict(b, min(max(p["mover_elo"], 1100), 2600), min(max(p["opp_elo"], 1100), 2600))
        mh = chess.Move.from_uci(max(probs, key=probs.get))
        i_best = me.analyse(b, chess.engine.Limit(nodes=20000))
        best = i_best["pv"][0]
        s_best = score(i_best)
        s_h = s_best if mh == best else score(me.analyse(b, chess.engine.Limit(nodes=20000), root_moves=[mh]))
        sf_best = sf.analyse(b, chess.engine.Limit(depth=12))
        sfb = score(sf_best)

        def sfloss(m):
            v = score(sf.analyse(b, chess.engine.Limit(depth=12), root_moves=[m]))
            return 0 if abs(sfb) >= 90000 and v >= 90000 else max(0, min(1000, sfb - v))
        loss_best, loss_h = sfloss(best), (sfloss(mh) if mh != best else None)
        rows.append({"site": p["site"], "human": p["human"], "v8": best.uci(), "maia": mh.uci(),
                     "v8_gap_cp": s_best - s_h, "sf_loss_v8": loss_best, "sf_loss_maia": loss_h if loss_h is not None else loss_best})
    me.quit(); sf.quit()
    curve = []
    for mg in MARGINS:
        pick = [(r["maia"] if r["v8_gap_cp"] <= mg else r["v8"], r) for r in rows]
        hm = sum(m == r["human"] for m, r in pick) / len(rows)
        loss = sum((r["sf_loss_maia"] if m == r["maia"] else r["sf_loss_v8"]) for m, r in pick) / len(rows)
        curve.append({"margin_cp": mg, "human_match": round(hm, 4), "mean_sf_cp_loss": round(loss, 1),
                      "share_maia_move": round(sum(m == r["maia"] for m, r in pick) / len(rows), 4)})
    base = {"pure_v8_human_match": round(sum(r["v8"] == r["human"] for r in rows) / len(rows), 4),
            "pure_maia_human_match": round(sum(r["maia"] == r["human"] for r in rows) / len(rows), 4),
            "pure_maia_sf_loss": round(sum(r["sf_loss_maia"] for r in rows) / len(rows), 1),
            "human_players_sf_loss_not_measured": True}
    json.dump({"baselines": base, "curve": curve, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps({"baselines": base, "curve": curve}, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
