"""Build an unseen creative benchmark from the CC0 Lichess puzzle database.

Positives: puzzles themed sacrifice / quietMove / zugzwang whose first solution move is
confirmed best by Stockfish 16. Negatives (near-identical counterexamples): the same
sacrifice position with ONE attacking piece of the solver removed, kept only when
Stockfish 16 confirms the original sacrifice now loses >=150cp versus the best move.
The selection is deterministic (sorted by PuzzleId, first N passing per theme).

Source: https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0), first 4,000,001
bytes (HTTP range 0-4000000), SHA-256 of that byte range recorded in the output.
"""
from __future__ import annotations

import csv
import json
import sys

import chess
import chess.engine

SF = "/usr/games/stockfish"
DEPTH = 18


def sf_scores(eng, board, moves=None):
    info = eng.analyse(board, chess.engine.Limit(depth=DEPTH), multipv=1,
                       root_moves=moves)
    return info[0]["score"].pov(board.turn).score(mate_score=100000), info[0]["pv"][0]


def main(src, out, n_sac=24, n_quiet=12, n_zug=6):
    rows = sorted(csv.DictReader(open(src)), key=lambda r: r["PuzzleId"])
    eng = chess.engine.SimpleEngine.popen_uci(SF)
    eng.configure({"Threads": 1, "Hash": 64})
    want = {"sacrifice": n_sac, "quietMove": n_quiet, "zugzwang": n_zug}
    got = {k: 0 for k in want}
    items = []
    for r in rows:
        themes = r["Themes"].split()
        theme = next((t for t in ("zugzwang", "quietMove", "sacrifice") if t in themes and got[t] < want[t]), None)
        if theme is None:
            continue
        rating = int(r["Rating"])
        moves = r["Moves"].split()
        if not (1400 <= rating <= 2500) or len(moves) < 4:
            continue
        b = chess.Board(r["FEN"])
        b.push_uci(moves[0])
        sol = chess.Move.from_uci(moves[1])
        best_score, best = sf_scores(eng, b)
        if best != sol:
            continue
        item = {"id": r["PuzzleId"], "theme": theme, "rating": rating, "fen": b.fen(),
                "solution": moves[1], "line": moves[1:], "sf_best": best.uci(),
                "sf_score": best_score, "kind": "positive", "url": r["GameUrl"]}
        items.append(item)
        got[theme] += 1
        if theme == "sacrifice":
            us = b.turn
            mover_sq = sol.from_square
            ek = b.king(not us)
            cand = [sq for sq in chess.scan_forward(b.occupied_co[us])
                    if b.piece_type_at(sq) not in (chess.KING, chess.PAWN) and sq != mover_sq]
            cand.sort(key=lambda s: chess.square_distance(s, ek))
            for sq in cand:
                nb = b.copy()
                nb.remove_piece_at(sq)
                if not nb.is_valid() or sol not in nb.legal_moves:
                    continue
                nbest_score, nbest = sf_scores(eng, nb)
                sac_score, _ = sf_scores(eng, nb, [sol])
                if nbest != sol and sac_score <= nbest_score - 150:
                    items.append({"id": r["PuzzleId"] + "-neg", "theme": "sacrifice-counterexample",
                                  "rating": rating, "fen": nb.fen(), "removed": chess.square_name(sq),
                                  "forbidden": sol.uci(), "sf_best": nbest.uci(),
                                  "sf_score": nbest_score, "sf_score_of_forbidden": sac_score,
                                  "kind": "negative", "url": r["GameUrl"]})
                    break
        print(theme, r["PuzzleId"], got, flush=True)
        if all(got[k] >= want[k] for k in want):
            break
    eng.quit()
    json.dump({"source": "https://database.lichess.org/lichess_db_puzzle.csv.zst",
               "license": "CC0 (Lichess puzzle database)",
               "byte_range": "0-4000000",
               "byte_range_sha256": "859a76f7ad9829c8c2d63fb4073bccb4afb588ccf75e709b7584702e351c0513",
               "validator": "Stockfish 16 (Ubuntu 16-1build1), depth 18, Threads 1",
               "items": items}, open(out, "w"), indent=1)
    print("positives", sum(i["kind"] == "positive" for i in items),
          "negatives", sum(i["kind"] == "negative" for i in items))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
