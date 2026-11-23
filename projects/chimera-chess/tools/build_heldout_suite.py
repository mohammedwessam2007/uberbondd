"""Held-out V8 suite from the same CC0 Lichess slice, disjoint from evidence/creative/bench.json.
Selection runs in DESCENDING PuzzleId order (the V7 bench used ascending order) and excludes every
V7 bench id. Each item's first solution move is confirmed best by Stockfish 16 depth 18.
Themes: defensiveMove, quietMove, sacrifice, zugzwang, plus 'crushing' controls (ordinary tactics).
Usage: python tools/build_heldout_suite.py /tmp/puzzles_head.csv evidence/v8/heldout_suite.json"""
import csv
import json
import sys

import chess
import chess.engine

WANT = {"defensiveMove": 30, "quietMove": 20, "sacrifice": 30, "zugzwang": 10, "crushing": 20}


def main(src, out):
    v7 = {i["id"].replace("-neg", "") for i in json.load(open("evidence/creative/bench.json"))["items"]}
    rows = sorted(csv.DictReader(open(src)), key=lambda r: r["PuzzleId"], reverse=True)
    eng = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    eng.configure({"Threads": 1, "Hash": 64})
    got = {k: 0 for k in WANT}
    items = []
    for r in rows:
        if r["PuzzleId"] in v7:
            continue
        th = r["Themes"].split()
        theme = next((t for t in WANT if t in th and got[t] < WANT[t]), None)
        if theme is None or not (1300 <= int(r["Rating"]) <= 2600):
            continue
        moves = r["Moves"].split()
        if len(moves) < 2:
            continue
        b = chess.Board(r["FEN"])
        b.push_uci(moves[0])
        info = eng.analyse(b, chess.engine.Limit(depth=18))
        if info["pv"][0].uci() != moves[1]:
            continue
        items.append({"id": r["PuzzleId"], "theme": theme, "themes": r["Themes"], "rating": int(r["Rating"]),
                      "fen": b.fen(), "solution": moves[1],
                      "sf_score": info["score"].pov(b.turn).score(mate_score=100000)})
        got[theme] += 1
        if all(got[k] >= WANT[k] for k in WANT):
            break
    eng.quit()
    json.dump({"source": "Lichess puzzle DB (CC0), byte range 0-4000000, sha256 859a76f7ad9829c8c2d63fb4073bccb4afb588ccf75e709b7584702e351c0513",
               "split": "held-out: descending PuzzleId, excludes all V7 bench ids", "counts": got,
               "validator": "Stockfish 16 depth 18", "items": items}, open(out, "w"), indent=1)
    print(got, len(items))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
