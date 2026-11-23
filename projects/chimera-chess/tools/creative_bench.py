"""Run the unseen creative benchmark: Tactical (search only) vs Creative (AAS) ablation.

Each position gets the same wall-clock budget in both modes. Every chosen move is
re-scored by Stockfish 16 (depth 16) as an independent oracle; we report strict
solution matches, SF-equivalent choices (<=30cp from SF best, or mate preserved),
the false-sacrifice rate on counterexamples, and the creative layer's own
accept/reject log including refutations (#052 counterfactual records).
"""
from __future__ import annotations

import json
import sys
import time

import chess
import chess.engine

sys.path.insert(0, __file__.rsplit("/tools/", 1)[0])
from chimera.creative import CreativeEngine  # noqa: E402

SF = "/usr/games/stockfish"


def sf_move_score(eng, board, move):
    info = eng.analyse(board, chess.engine.Limit(depth=16), root_moves=[move])
    return info["score"].pov(board.turn).score(mate_score=100000)


def main(bench, out, movetime=2.0, modes=("Tactical", "Creative")):
    data = json.load(open(bench))
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({"Threads": 1, "Hash": 64})
    rows = []
    for it in data["items"]:
        board = chess.Board(it["fen"])
        best = eng.analyse(board, chess.engine.Limit(depth=16))
        best_score = best["score"].pov(board.turn).score(mate_score=100000)
        row = {"id": it["id"], "kind": it["kind"], "theme": it["theme"], "rating": it["rating"],
               "sf_best_d16": best["pv"][0].uci(), "sf_best_score": best_score}
        for mode in modes:
            ce = CreativeEngine("chimera", enabled=(mode != "Tactical"), maia=(mode == "CreativeMaia"))
            t0 = time.perf_counter()
            mv = ce.choose(board, movetime)
            el = time.perf_counter() - t0
            sc = sf_move_score(eng, board, mv)
            loss = max(0, best_score - sc) if abs(best_score) < 90000 else (0 if sc >= 90000 else 9999)
            r = {"move": mv.uci(), "elapsed": round(el, 3), "sf_score": sc, "cp_loss": loss,
                 "sf_equivalent": loss <= 30}
            if it["kind"] == "positive":
                r["strict_solved"] = mv.uci() == it["solution"]
            else:
                r["false_sacrifice"] = mv.uci() == it["forbidden"]
            if mode != "Tactical" and ce.log:
                d = ce.log[-1]
                r["source"] = d.source
                r["candidates"] = d.candidates
                r["witness"] = d.witness
            row[mode] = r
        rows.append(row)
        print(row["id"], row["kind"], *[f"{md}:{row[md]['move']}" for md in modes],
              "sol/forbid:", it.get("solution", it.get("forbidden")), flush=True)
    eng.quit()

    def agg(kind, mode, key):
        xs = [r[mode][key] for r in rows if r["kind"] == kind]
        return f"{sum(bool(x) for x in xs)}/{len(xs)}"
    summary = {"movetime_s": movetime, "positions": len(rows)}
    for mode in modes:
        summary[mode] = {
            "positive_strict_solved": agg("positive", mode, "strict_solved"),
            "positive_sf_equivalent": agg("positive", mode, "sf_equivalent"),
            "negative_false_sacrifice": agg("negative", mode, "false_sacrifice"),
            "negative_sf_equivalent": agg("negative", mode, "sf_equivalent"),
            "mean_cp_loss_capped_1000": round(sum(min(r[mode]["cp_loss"], 1000) for r in rows) / len(rows), 1),
        }
    for md in modes[1:]:
        summary[f"{md}_artist_picks"] = sum(1 for r in rows if r[md].get("source") == "artist")
        summary[f"{md}_rejections_logged"] = sum(
            1 for r in rows for c in r[md].get("candidates", []) if not c["accepted"])
    for theme in ("sacrifice", "quietMove", "zugzwang"):
        for mode in modes:
            xs = [r[mode]["strict_solved"] for r in rows if r["theme"] == theme]
            summary[f"{theme}_{mode}_strict"] = f"{sum(xs)}/{len(xs)}"
    json.dump({"summary": summary, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 2.0,
         tuple(sys.argv[4].split(",")) if len(sys.argv) > 4 else ("Tactical", "Creative"))
