"""Deterministic re-scoring: Stockfish 16 Threads 1, 'ucinewgame' (fresh hash) before EVERY analysis, fixed nodes.
Same (fen, move) -> same score, so identical decisions get identical losses. Usage:
python tools/rescore_deterministic.py in.json out.json key1,key2,... [nodes]"""
import json, math, sys
import chess, chess.engine
def main(src, out, keys, nodes=2_000_000):
    d = json.load(open(src)); rows = d["rows"]
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); sf.configure({"Threads": 1, "Hash": 64})
    cache = {}
    def sc(fen, mv=None):
        k = (fen, mv)
        if k not in cache:
            sf.protocol.send_line("ucinewgame")
            b = chess.Board(fen)
            info = sf.analyse(b, chess.engine.Limit(nodes=nodes), root_moves=[chess.Move.from_uci(mv)] if mv else None, game=object())
            cache[k] = info["score"].relative.score(mate_score=100000)
        return cache[k]
    for r in rows:
        bs = sc(r["fen"])
        for k in keys:
            v = sc(r["fen"], r[k])
            r["det_loss_" + k] = 0 if bs >= 90000 and v >= 90000 else max(0, min(1000, bs - v))
    sf.quit()
    m = len(rows); s = {"positions": m, "nodes": nodes}
    for k in keys:
        s["mean_det_loss_" + k] = round(sum(r["det_loss_" + k] for r in rows) / m, 1)
    for i, a in enumerate(keys):
        for b2 in keys[i + 1:]:
            dd = [r["det_loss_" + a] - r["det_loss_" + b2] for r in rows]; mu = sum(dd) / m
            sd = math.sqrt(sum((x - mu) ** 2 for x in dd) / (m - 1)) if m > 1 else 0
            s[f"paired_{a}_minus_{b2}"] = {"mean": round(mu, 1), "t": round(mu / (sd / math.sqrt(m)), 2) if sd else None, "differing_decisions": sum(r[a] != r[b2] for r in rows)}
    d["deterministic_rescore"] = s; json.dump(d, open(out, "w"), indent=1); print(json.dumps(s, indent=1))
if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3].split(","), int(sys.argv[4]) if len(sys.argv) > 4 else 2_000_000)
