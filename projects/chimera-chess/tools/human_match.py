"""Human move-matching benchmark (G11 humanization baseline; not a strength test).
Source: lichess_db_standard_rated_2013-01.pgn.zst (CC0), SHA-256 aa40b367...1635. Never used for training.
Sampling (deterministic, seed 9): games with both players rated >= 1600, base time >= 300 s, >= 30 plies;
one position per game at a uniformly random ply in [10, plies-4]; first N games passing the filter.
Engines: Maia3-5M (elo = mover rating, opponent rating), CHIMERA V8 native EvalV2 at fixed nodes,
Stockfish 16 at depth 10. Metric: top-1 agreement with the human's actual move, by mover-rating band.
Usage: python tools/human_match.py /tmp/lichess/2013-01.pgn.zst out.json N"""
import io
import json
import random
import sys

import chess
import chess.engine
import chess.pgn
import zstandard

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0])
from chimera.maia import MaiaPolicy  # noqa: E402


def sample(path, n, seed=9):
    rng = random.Random(seed)
    out = []
    with open(path, "rb") as fh:
        text = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(fh), encoding="utf-8", errors="ignore")
        while len(out) < n:
            g = chess.pgn.read_game(text)
            if g is None:
                break
            h = g.headers
            try:
                we, be = int(h.get("WhiteElo", 0)), int(h.get("BlackElo", 0))
                base = int(h.get("TimeControl", "0+0").split("+")[0])
            except ValueError:
                continue
            if min(we, be) < 1600 or base < 300:
                continue
            moves = list(g.mainline_moves())
            if len(moves) < 30:
                continue
            k = rng.randint(10, len(moves) - 4)
            b = g.board()
            for m in moves[:k]:
                b.push(m)
            mover = we if b.turn == chess.WHITE else be
            other = be if b.turn == chess.WHITE else we
            out.append({"site": h.get("Site"), "fen": b.fen(), "history": [m.uci() for m in moves[:k]],
                        "human": moves[k].uci(), "mover_elo": mover, "opp_elo": other})
    return out


def main(path, out, n):
    pos = sample(path, n)
    maia = MaiaPolicy()
    me = chess.engine.SimpleEngine.popen_uci(__file__.rsplit("/tools/", 1)[0] + "/native/chimera")
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    sf.configure({"Threads": 1, "Hash": 16})
    rows = []
    for p in pos:
        b = chess.Board()
        for u in p["history"]:
            b.push_uci(u)  # full history: Maia uses 8 prior boards
        probs, _ = maia.predict(b, min(max(p["mover_elo"], 1100), 2600), min(max(p["opp_elo"], 1100), 2600))
        maia_mv = max(probs, key=probs.get)
        v8 = me.play(b, chess.engine.Limit(nodes=20000)).move.uci()
        sfm = sf.play(b, chess.engine.Limit(depth=10)).move.uci()
        rows.append({**{k: p[k] for k in ("site", "mover_elo", "human")}, "maia3": maia_mv, "v8": v8, "sf16_d10": sfm,
                     "maia3_p_human": round(probs.get(p["human"], 0.0), 4)})
    me.quit(); sf.quit()
    bands = [(1600, 1800), (1800, 2000), (2000, 3000)]
    summ = {"positions": len(rows), "source_sha256": "aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635"}
    for eng in ("maia3", "v8", "sf16_d10"):
        summ[eng] = {"all": round(sum(r[eng] == r["human"] for r in rows) / len(rows), 4)}
        for lo, hi in bands:
            sub = [r for r in rows if lo <= r["mover_elo"] < hi]
            if sub:
                summ[eng][f"{lo}-{hi}"] = f"{sum(r[eng] == r['human'] for r in sub)}/{len(sub)}"
    summ["v8_agrees_with_maia3"] = round(sum(r["v8"] == r["maia3"] for r in rows) / len(rows), 4)
    json.dump({"summary": summ, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1000)
