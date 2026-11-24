"""Run a position suite through UCI engines at a fixed movetime; re-score every chosen move with
Stockfish 16 depth 16. Usage:
  python tools/suite_run.py evidence/v8/heldout_suite.json out.json 1000 native:2 chimera:Tactical"""
import json
import sys
from collections import defaultdict

import chess
import chess.engine

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0])
from tools.match import open_player  # noqa: E402


def main(suite, out, ms, specs):
    items = json.load(open(suite))["items"]
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    sf.configure({"Threads": 1, "Hash": 64})
    rows = []
    engines = {s: open_player(s) for s in specs}
    for it in items:
        b = chess.Board(it["fen"])
        best = sf.analyse(b, chess.engine.Limit(depth=16))
        bs = best["score"].pov(b.turn).score(mate_score=100000)
        neg = it.get("kind") == "negative"
        row = {"id": it["id"], "theme": it["theme"], "kind": "negative" if neg else "positive",
               "solution": it.get("solution"), "forbidden": it.get("forbidden")}
        for s, e in engines.items():
            e.protocol.send_line("ucinewgame")
            mv = e.play(b, chess.engine.Limit(time=ms / 1000)).move
            sc = sf.analyse(b, chess.engine.Limit(depth=16), root_moves=[mv])["score"].pov(b.turn).score(mate_score=100000)
            loss = max(0, bs - sc) if abs(bs) < 90000 else (0 if sc >= 90000 else 9999)
            ok = (mv.uci() != it["forbidden"]) if neg else (mv.uci() == it["solution"])
            row[s] = {"move": mv.uci(), "solved": ok, "cp_loss": loss}
            if neg:
                row[s]["false_sacrifice"] = mv.uci() == it["forbidden"]
        rows.append(row)
        print(it["id"], it["theme"], *[f"{s}={row[s]['move']}{'*' if row[s]['solved'] else ''}" for s in specs], flush=True)
    for e in engines.values():
        e.quit()
    sf.quit()
    summary = {"movetime_ms": ms, "positions": len(rows)}
    for s in specs:
        by = defaultdict(lambda: [0, 0])
        for r in rows:
            by[r["theme"]][0] += r[s]["solved"]
            by[r["theme"]][1] += 1
        summary[s] = {"solved": f"{sum(r[s]['solved'] for r in rows)}/{len(rows)}",
                      "by_theme": {k: f"{a}/{n}" for k, (a, n) in by.items()},
                      "mean_cp_loss_capped_1000": round(sum(min(r[s]["cp_loss"], 1000) for r in rows) / len(rows), 1),
                      "positives_solved": f"{sum(r[s]['solved'] for r in rows if r['kind'] == 'positive')}/{sum(r['kind'] == 'positive' for r in rows)}",
                      "false_sacrifices": f"{sum(r[s].get('false_sacrifice', False) for r in rows)}/{sum(r['kind'] == 'negative' for r in rows)}"}
    # paired comparison of first two engines
    if len(specs) >= 2:
        a, b2 = specs[0], specs[1]
        summary["paired"] = {"only_" + a: sum(r[a]["solved"] and not r[b2]["solved"] for r in rows),
                             "only_" + b2: sum(r[b2]["solved"] and not r[a]["solved"] for r in rows)}
    json.dump({"summary": summary, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:])
