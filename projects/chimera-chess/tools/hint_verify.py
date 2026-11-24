"""Single-candidate focused verification (Wave B1): plain native search vs native search with RootHint = Maia3-5M top-1
(searched first, +1 ply), identical wall clock per position. Every chosen move is re-scored by Stockfish 16 d16.
Decomposes recall (is Maia top-1 the solution?) from selection (did the engine end up playing it?).
Usage: python tools/hint_verify.py suite.json out.json ms [split]"""
import json, sys, time
import chess, chess.engine
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from chimera.maia import MaiaPolicy
def rel(i): return i["score"].relative.score(mate_score=100000)
def main(suite, out, ms, split=None):
    items = [i for i in json.load(open(suite))["items"] if split is None or i.get("split") == split]
    maia = MaiaPolicy()
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); sf.configure({"Threads": 1, "Hash": 64})
    rows = []
    for it in items:
        b = chess.Board(it["fen"])
        t0 = time.perf_counter(); probs, _ = maia.predict(b, 2200); tm = time.perf_counter() - t0
        top = max(probs, key=probs.get)
        me.protocol.send_line("ucinewgame")
        plain = me.play(b, chess.engine.Limit(time=ms / 1000)).move.uci()
        me.protocol.send_line("ucinewgame")
        me.configure({"RootHint": top})
        hinted = me.play(b, chess.engine.Limit(time=max(0.01, ms / 1000 - tm))).move.uci()   # Maia time is charged
        bs = rel(sf.analyse(b, chess.engine.Limit(depth=16)))
        def loss(u):
            v = rel(sf.analyse(b, chess.engine.Limit(depth=16), root_moves=[chess.Move.from_uci(u)]))
            return 0 if bs >= 90000 and v >= 90000 else max(0, min(1000, bs - v))
        rows.append({"id": it["id"], "solution": it["solution"], "maia_top1": top, "maia_p": round(probs[top], 3),
                     "plain": plain, "hinted": hinted, "plain_ok": plain == it["solution"], "hinted_ok": hinted == it["solution"],
                     "recall": top == it["solution"], "plain_loss": loss(plain), "hinted_loss": loss(hinted), "maia_ms": round(tm * 1000, 1)})
        print(it["id"], "plain", plain, "hinted", hinted, "maia", top, "sol", it["solution"], flush=True)
    me.quit(); sf.quit()
    n = len(rows)
    summ = {"n": n, "ms": ms, "split": split, "plain_solved": sum(r["plain_ok"] for r in rows), "hinted_solved": sum(r["hinted_ok"] for r in rows),
            "maia_top1_recall": sum(r["recall"] for r in rows),
            "selected_when_recalled": sum(r["hinted_ok"] for r in rows if r["recall"]),
            "only_hinted": sum(r["hinted_ok"] and not r["plain_ok"] for r in rows), "only_plain": sum(r["plain_ok"] and not r["hinted_ok"] for r in rows),
            "plain_mean_loss": round(sum(r["plain_loss"] for r in rows) / n, 1), "hinted_mean_loss": round(sum(r["hinted_loss"] for r in rows) / n, 1)}
    json.dump({"summary": summ, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summ, indent=1))
if __name__ == "__main__":
    a = sys.argv; main(a[1], a[2], int(a[3]), a[4] if len(a) > 4 else None)
