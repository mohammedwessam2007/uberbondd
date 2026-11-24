"""Resumable, sharded headroom miner (V13; replaces the restart-only tools/build_headroom_suite.py).
Every scanned puzzle position is appended as one JSONL record (eligible or rejected, with reason), so an interrupted
worker resumes by skipping recorded ids. Oracle = lab/oracle.py (deterministic, cached). Baseline = native V8 at fixed
nodes (contention-proof). 'freeze' writes a suite JSON from the records with a dev/confirmation split by sha256(id).
Usage: python tools/headroom_miner.py mine /tmp/puzzles16.csv lab/headroom/v13_s<k>.jsonl <shard> <nshards> <max_eligible>
       python tools/headroom_miner.py freeze 'lab/headroom/v13_s*.jsonl' evidence/v13/headroom_v13.json"""
import csv, glob, hashlib, json, os, sys
import chess, chess.engine
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from lab.oracle import Oracle
NODES_V8, NODES_ORACLE, SALT = 600_000, 1_500_000, "v13headroom"
USED_SUITES = ["evidence/creative/bench.json", "evidence/v8/heldout_suite.json", "evidence/v8/hard_sac_suite.json", "evidence/v11/headroom_suite.json"]


def gid(u):
    p = [x for x in u.split("lichess.org/")[-1].split("#")[0].split("/") if x and x != "game"]
    return p[0] if p else ""


def mine(src, out, shard, nshards, max_elig):
    used = set()
    for f in USED_SUITES:
        if os.path.exists(os.path.join(ROOT, f)):
            used |= {i["id"].replace("-neg", "") for i in json.load(open(os.path.join(ROOT, f)))["items"]}
    for fp in glob.glob(os.path.join(ROOT, "lab/discovery_pool*.jsonl")):
        used |= {json.loads(l)["id"] for l in open(fp) if l.strip()}
    rows = list(csv.DictReader(open(src)))
    used_games = {gid(r["GameUrl"]) for r in rows if r["PuzzleId"] in used}
    done = set(); elig = 0
    if os.path.exists(out):
        for l in open(out):
            if l.strip():
                r = json.loads(l); done.add(r["id"]); elig += r["eligible"]
    o = Oracle()
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    with open(out, "a") as fo:
        for r in sorted(rows, key=lambda r: hashlib.sha256((SALT + r["PuzzleId"]).encode()).hexdigest()):
            if elig >= max_elig:
                break
            pid = r["PuzzleId"]
            if pid in done or int(hashlib.sha256(("shard" + pid).encode()).hexdigest(), 16) % nshards != shard:
                continue
            rec = {"id": pid, "rating": int(r["Rating"]), "themes": r["Themes"], "eligible": False}
            if pid in used or gid(r["GameUrl"]) in used_games:
                rec["reason"] = "used-by-earlier-suite-or-game"
            elif int(r["Rating"]) < 1800:
                rec["reason"] = "rating<1800"
            else:
                b = chess.Board(r["FEN"]); b.push_uci(r["Moves"].split()[0]); fen = b.fen(); rec["fen"] = fen
                me.protocol.send_line("ucinewgame")
                res = me.analyse(b, chess.engine.Limit(nodes=NODES_V8), multipv=3)
                top3 = [x["pv"][0].uci() for x in res if "pv" in x]
                v8 = top3[0]; best = o.best(fen, NODES_ORACLE)
                bs = o.score(fen, None, NODES_ORACLE); vs = o.score(fen, v8, NODES_ORACLE)
                rec.update({"v8": v8, "v8_top3": top3, "oracle_best": best, "oracle_score": bs, "v8_loss": bs - vs,
                            "baseline": f"native V8 {NODES_V8} nodes", "oracle": f"{o.id} {NODES_ORACLE} nodes"})
                if best in top3:
                    rec["reason"] = "oracle-best-in-V8-top3"
                elif bs - vs < 100:
                    rec["reason"] = "V8-loss<100"
                else:
                    rec["eligible"] = True; rec["reason"] = "headroom"; elig += 1
            fo.write(json.dumps(rec) + "\n"); fo.flush()
    me.quit(); o.close()
    print("eligible", elig)


def freeze(pattern, out):
    recs = [json.loads(l) for f in sorted(glob.glob(pattern)) for l in open(f) if l.strip()]
    items = []
    for r in recs:
        if r["eligible"]:
            sp = "dev" if int(hashlib.sha256(("split" + r["id"]).encode()).hexdigest(), 16) % 2 == 0 else "confirm"
            items.append({"id": r["id"], "split": sp, "fen": r["fen"], "solution": r["oracle_best"], "v8": r["v8"],
                          "v8_loss": r["v8_loss"], "rating": r["rating"], "themes": r["themes"]})
    from collections import Counter
    json.dump({"scanned": len(recs), "reasons": Counter(r["reason"] for r in recs), "items": items,
               "frozen_from": sorted(glob.glob(pattern))}, open(out, "w"), indent=1)
    print(len(recs), len(items), Counter(i["split"] for i in items))


if __name__ == "__main__":
    if sys.argv[1] == "mine":
        mine(sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]))
    else:
        freeze(sys.argv[2], sys.argv[3])
