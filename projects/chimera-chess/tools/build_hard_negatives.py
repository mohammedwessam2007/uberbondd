"""Near-identical counterexamples of evidence/v8/hard_sac_suite.json: remove ONE non-pawn, non-king piece of the solver
(not the sacrificing piece), keep only if the sacrifice is still legal and SF16 depth 18 says it now loses >= 150cp
against the best move. Same rule as V7's tools/build_creative_bench.py. Usage: python tools/build_hard_negatives.py out.json"""
import json, sys
import chess, chess.engine
def sc(e, b, mv=None):
    i = e.analyse(b, chess.engine.Limit(depth=18), root_moves=mv)
    return i["score"].pov(b.turn).score(mate_score=100000), i["pv"][0]
def main(out):
    src = json.load(open("evidence/v8/hard_sac_suite.json"))["items"]
    e = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); e.configure({"Threads": 1, "Hash": 64})
    items = []
    for it in src:
        b = chess.Board(it["fen"]); sol = chess.Move.from_uci(it["solution"]); us = b.turn; ek = b.king(not us)
        cand = sorted([s for s in chess.scan_forward(b.occupied_co[us]) if b.piece_type_at(s) not in (chess.KING, chess.PAWN) and s != sol.from_square],
                      key=lambda s: chess.square_distance(s, ek))
        for s in cand:
            nb = b.copy(); nb.remove_piece_at(s)
            if not nb.is_valid() or sol not in nb.legal_moves: continue
            bs, bm = sc(e, nb); ss, _ = sc(e, nb, [sol])
            if bm != sol and ss <= bs - 150:
                items.append({"id": it["id"] + "-neg", "kind": "negative", "theme": "hard_sacrifice_counterexample", "rating": it["rating"],
                              "fen": nb.fen(), "removed": chess.square_name(s), "forbidden": sol.uci(), "sf_best": bm.uci(),
                              "sf_score": bs, "sf_score_of_forbidden": ss})
                print(len(items), it["id"], flush=True); break
    e.quit()
    json.dump({"source": "derived from evidence/v8/hard_sac_suite.json", "validator": "Stockfish 16 depth 18", "items": items}, open(out, "w"), indent=1)
if __name__ == "__main__": main(sys.argv[1])
