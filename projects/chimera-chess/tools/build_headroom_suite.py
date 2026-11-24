"""Fresh headroom suite (see evidence/v11/PREREG_artist_union.md). Usage: python tools/build_headroom_suite.py /tmp/puzzles16.csv out.json N"""
import csv, hashlib, json, os, sys
import chess, chess.engine
ROOT = __file__.rsplit("/tools/", 1)[0]
def gid(u):
    p = [x for x in u.split("lichess.org/")[-1].split("#")[0].split("/") if x and x != "game"]; return p[0] if p else ""
NODES = 600_000


def main(src, out, n=80, salt=""):
    used = set()
    for f in ("evidence/creative/bench.json", "evidence/v8/heldout_suite.json", "evidence/v8/hard_sac_suite.json", "evidence/v11/headroom_suite.json"):
        if not os.path.exists(f): continue
        used |= {i["id"].replace("-neg", "") for i in json.load(open(f))["items"]}
    rows = list(csv.DictReader(open(src)))
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); sf.configure({"Threads": 1, "Hash": 64})
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    items = []; scanned = 0
    try:
        import glob as _g
        for fp in _g.glob("lab/discovery_pool*.jsonl"):
            used |= {json.loads(l)["id"] for l in open(fp) if l.strip()}
    except Exception:
        pass
    used_games = {gid(r["GameUrl"]) for r in rows if r["PuzzleId"] in used}
    for r in sorted(rows, key=lambda r: hashlib.sha256((salt + r["PuzzleId"]).encode()).hexdigest()):
        if r["PuzzleId"] in used or gid(r["GameUrl"]) in used_games or int(r["Rating"]) < 1800: continue
        mv = r["Moves"].split(); b = chess.Board(r["FEN"]); b.push_uci(mv[0]); scanned += 1
        res = me.analyse(b, chess.engine.Limit(nodes=NODES), multipv=3)  # V12: fixed nodes (contention-proof)
        top3 = {x["pv"][0] for x in res if "pv" in x}; v8 = res[0]["pv"][0]
        info = sf.analyse(b, chess.engine.Limit(depth=20)); best = info["pv"][0]
        if best in top3: continue
        bs = info["score"].pov(b.turn).score(mate_score=100000)
        vs = sf.analyse(b, chess.engine.Limit(depth=20), root_moves=[v8])["score"].pov(b.turn).score(mate_score=100000)
        if bs - vs < 100: continue
        split = "dev" if int(hashlib.sha256(r["PuzzleId"].encode()).hexdigest(), 16) % 2 == 0 else "fresh"
        items.append({"id": r["PuzzleId"], "split": split, "themes": r["Themes"], "rating": int(r["Rating"]), "fen": b.fen(),
                      "solution": best.uci(), "sf_score": bs, "v8_300ms": v8.uci(), "v8_sf_loss": bs - vs, "puzzle_solution": mv[1]})
        print(len(items), scanned, r["PuzzleId"], split, flush=True)
        if len(items) >= n: break
    sf.quit(); me.quit()
    json.dump({"source": "Lichess puzzles CC0 16MB slice sha 405fd7fa...", "scanned": scanned, "rule": f"V8 at {NODES} nodes misses SF16 d20 best by >=100cp; best not in V8 MultiPV-3 at {NODES} nodes", "salt": salt,
               "items": items}, open(out, "w"), indent=1)
if __name__ == "__main__": main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 80, sys.argv[4] if len(sys.argv) > 4 else "")
