"""Hard held-out sacrifice suite for the ArtistExtension pre-registration (see evidence/v8/PREREG_artist_extension.md)."""
import csv, json, sys
import chess, chess.engine
def main(src, out, n=60):
    seen = {i["id"].replace("-neg", "") for i in json.load(open("evidence/creative/bench.json"))["items"]}
    seen |= {i["id"] for i in json.load(open("evidence/v8/heldout_suite.json"))["items"]}
    rows = sorted(csv.DictReader(open(src)), key=lambda r: r["PuzzleId"])
    eng = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); eng.configure({"Threads": 1, "Hash": 64})
    items = []
    for r in rows:
        if r["PuzzleId"] in seen or "sacrifice" not in r["Themes"].split(): continue
        mv = r["Moves"].split()
        if int(r["Rating"]) < 2000 or len(mv) < 6: continue
        b = chess.Board(r["FEN"]); b.push_uci(mv[0])
        info = eng.analyse(b, chess.engine.Limit(depth=20))
        if info["pv"][0].uci() != mv[1]: continue
        items.append({"id": r["PuzzleId"], "theme": "hard_sacrifice", "rating": int(r["Rating"]), "fen": b.fen(),
                      "solution": mv[1], "line": mv[1:], "themes": r["Themes"]})
        print(len(items), r["PuzzleId"], r["Rating"], flush=True)
        if len(items) >= n: break
    eng.quit()
    json.dump({"source": "Lichess puzzle DB (CC0), byte range 0-16000000, sha256 405fd7fa6a9d7f6855d1e2bea06e65cd6ac2f129f3c5a105ad338de10f1821ee",
               "selection": "ascending PuzzleId; sacrifice; rating>=2000; >=6 plies; SF16 d20 first-move confirmed; disjoint from earlier suites",
               "items": items}, open(out, "w"), indent=1)
if __name__ == "__main__": main(sys.argv[1], sys.argv[2])
