"""Human-position dataset for the V13 cognition/regret probes (resumable JSONL).
Source: lichess_db_standard_rated_2013-01.pgn.zst (CC0, sha aa40b367...1635). Sampling seed 13 (V9 used seed 9): games with
both players >= 1500, base >= 180 s, >= 30 plies; one position per game at a uniform ply in [10, plies-4].
Per position: fen, history, human move, ratings, game result (mover POV), Maia3 top-5 probs, native V8 move at 2k/20k/200k
nodes, oracle (lab/oracle.py) score of EVERY legal move at 60k nodes (fragility) and of the position/best at 300k nodes.
Usage: python lab/human_dataset.py /tmp/lichess/2013-01.pgn.zst lab/human_v13.jsonl N"""
import io, json, os, random, sys
import chess, chess.engine, chess.pgn, zstandard
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from lab.oracle import Oracle
from chimera.maia import MaiaPolicy


def sample(path, n, seed=13):
    rng = random.Random(seed); out = []
    with open(path, "rb") as fh:
        text = io.TextIOWrapper(zstandard.ZstdDecompressor().stream_reader(fh), encoding="utf-8", errors="ignore")
        while len(out) < n:
            g = chess.pgn.read_game(text)
            if g is None:
                break
            h = g.headers
            try:
                we, be = int(h.get("WhiteElo", 0)), int(h.get("BlackElo", 0)); base = int(h.get("TimeControl", "0+0").split("+")[0])
            except ValueError:
                continue
            if min(we, be) < 1500 or base < 180 or h.get("Result") not in ("1-0", "0-1", "1/2-1/2"):
                continue
            mv = list(g.mainline_moves())
            if len(mv) < 30:
                continue
            k = rng.randint(10, len(mv) - 4)
            b = g.board()
            for m in mv[:k]:
                b.push(m)
            res = {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5}[h["Result"]]
            out.append({"site": h.get("Site"), "fen": b.fen(), "history": [m.uci() for m in mv[:k]], "human": mv[k].uci(),
                        "next2": [m.uci() for m in mv[k:k + 3]], "mover_elo": we if b.turn else be, "opp_elo": be if b.turn else we,
                        "result_mover": res if b.turn else 1 - res})
    return out


def main(src, out, n):
    done = set()
    if os.path.exists(out):
        done = {json.loads(l)["site"] for l in open(out) if l.strip()}
    pos = [p for p in sample(src, n) if p["site"] not in done]
    o = Oracle(); maia = MaiaPolicy()
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    with open(out, "a") as fo:
        for p in pos:
            b = chess.Board()
            for u in p["history"]:
                b.push_uci(u)
            probs, wdl = maia.predict(b, min(max(p["mover_elo"], 1100), 2600), min(max(p["opp_elo"], 1100), 2600))
            p["maia_top5"] = sorted(probs.items(), key=lambda kv: -kv[1])[:5]
            p["maia_wdl"] = wdl
            v8 = {}
            for nn in (2000, 20000, 200000):
                me.protocol.send_line("ucinewgame")
                v8[str(nn)] = me.play(b, chess.engine.Limit(nodes=nn)).move.uci()
            p["v8"] = v8
            fen = b.fen()
            p["oracle_best"] = o.best(fen, 300000); p["oracle_score"] = o.score(fen, None, 300000)
            p["move_scores_60k"] = {m.uci(): o.score(fen, m.uci(), 60000) for m in b.legal_moves}
            for key in ("human",):
                p["oracle_" + key] = o.score(fen, p[key], 300000)
            for nn, mv in v8.items():
                p[f"oracle_v8_{nn}"] = o.score(fen, mv, 300000)
            p["oracle_maia_top1"] = o.score(fen, p["maia_top5"][0][0], 300000)
            fo.write(json.dumps(p) + "\n"); fo.flush()
    me.quit(); o.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
