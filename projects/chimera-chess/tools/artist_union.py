"""Artist candidate union + focused verification vs plain search at equal wall clock (evidence/v11/PREREG_artist_union.md).
Candidate sources (each attributed): native MultiPV-3, Maia3-5M top-3 (elo 2200), V7 #047 sacrifice-grammar Artist,
optionally the discovery-lab student prior (--student file). Every candidate is verified by native 'go searchmoves <m>'.
Usage: python tools/artist_union.py evidence/v11/headroom_suite.json out.json 1000 [--student lab/student_prior.json]"""
import json
import sys
import time

import chess
import chess.engine

ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from chimera.creative import artist_candidates  # noqa: E402
from chimera.maia import MaiaPolicy  # noqa: E402


def sc(info):
    return info["score"].relative.score(mate_score=100000)


def union_choice(me, maia, b, T, student=None):
    t0 = time.perf_counter()
    res = me.analyse(b, chess.engine.Limit(time=0.35 * T), multipv=3)
    cands = {}
    for k, x in enumerate(res):
        if "pv" in x:
            cands.setdefault(x["pv"][0], []).append(f"multipv{k + 1}")
    probs, _ = maia.predict(b, 2200)
    for u, _p in sorted(probs.items(), key=lambda kv: -kv[1])[:3]:
        cands.setdefault(chess.Move.from_uci(u), []).append("maia3")
    root_scores = {x["pv"][0].uci(): sc(x) for x in res if "pv" in x}
    for m, tags in artist_candidates(b, root_scores, res[0]["pv"][0], limit=3):
        cands.setdefault(m, []).append("artist047:" + "+".join(tags))
    if student:
        for m in student(b)[:2]:
            cands.setdefault(m, []).append("student")
    left = max(0.0, T - (time.perf_counter() - t0))
    per = left / max(1, len(cands))
    verified = {}
    for m in cands:
        verified[m] = sc(me.analyse(b, chess.engine.Limit(time=per), root_moves=[m]))
    best = max(verified, key=verified.get)
    return best, {m.uci(): {"src": cands[m], "verified": verified[m]} for m in cands}, time.perf_counter() - t0


def conservative_choice(me, maia, b, T, student=None, margin=15):
    t0 = time.perf_counter()
    base = me.analyse(b, chess.engine.Limit(time=0.6 * T))
    bm, bsc = base["pv"][0], sc(base)
    cands = {}
    probs, _ = maia.predict(b, 2200)
    for u, _p in sorted(probs.items(), key=lambda kv: -kv[1])[:3]:
        cands.setdefault(chess.Move.from_uci(u), []).append("maia3")
    for m, tags in artist_candidates(b, {}, bm, limit=2):
        cands.setdefault(m, []).append("artist047:" + "+".join(tags))
    if student:
        for m in student(b)[:2]:
            cands.setdefault(m, []).append("student")
    cands.pop(bm, None)
    left = max(0.0, T - (time.perf_counter() - t0))
    per = left / max(1, len(cands))
    pick, detail = bm, {bm.uci(): {"src": ["base"], "verified": bsc}}
    best_v = bsc
    for m in cands:
        v = sc(me.analyse(b, chess.engine.Limit(time=per), root_moves=[m]))
        detail[m.uci()] = {"src": cands[m], "verified": v}
        if v >= best_v + margin:
            pick, best_v = m, v
    return pick, detail, time.perf_counter() - t0


def main(suite, out, ms, student_path=None, mode="union", only_split=None):
    T = ms / 1000
    items = json.load(open(suite))["items"]
    maia = MaiaPolicy()
    me = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish")
    sf.configure({"Threads": 1, "Hash": 64})
    student = None
    if student_path:
        from tools.discovery_lab import load_student
        student = load_student(student_path)
    rows = []
    for it in items:
        if only_split and it["split"] != only_split:
            continue
        b = chess.Board(it["fen"])
        me.protocol.send_line("ucinewgame")
        t0 = time.perf_counter()
        base = me.play(b, chess.engine.Limit(time=T)).move
        tb = time.perf_counter() - t0
        me.protocol.send_line("ucinewgame")
        pick, detail, tu = (conservative_choice if mode == "conservative" else union_choice)(me, maia, b, T, student)
        best = sf.analyse(b, chess.engine.Limit(depth=16))
        bs = sc(best)

        def loss(m):
            v = sc(sf.analyse(b, chess.engine.Limit(depth=16), root_moves=[m]))
            return 0 if bs >= 90000 and v >= 90000 else max(0, min(1000, bs - v))
        sol_src = detail.get(it["solution"], {}).get("src")
        rows.append({"id": it["id"], "split": it["split"], "solution": it["solution"],
                     "base": base.uci(), "union": pick.uci(), "base_ok": base.uci() == it["solution"],
                     "union_ok": pick.uci() == it["solution"], "base_loss": loss(base), "union_loss": loss(pick),
                     "solution_in_candidates": sol_src is not None, "solution_sources": sol_src,
                     "base_s": round(tb, 3), "union_s": round(tu, 3), "candidates": detail})
        print(it["id"], it["split"], "base", base.uci(), "union", pick.uci(), "sol", it["solution"], "in_cands", sol_src, flush=True)
    me.quit(); sf.quit()
    summ = {"ms": ms, "student": student_path, "mode": mode, "only_split": only_split}
    for sp in ("dev", "fresh"):
        r = [x for x in rows if x["split"] == sp]
        if not r:
            continue
        summ[sp] = {"n": len(r), "base_solved": sum(x["base_ok"] for x in r), "union_solved": sum(x["union_ok"] for x in r),
                    "solution_recall_in_candidates": sum(x["solution_in_candidates"] for x in r),
                    "base_mean_loss": round(sum(x["base_loss"] for x in r) / len(r), 1),
                    "union_mean_loss": round(sum(x["union_loss"] for x in r) / len(r), 1),
                    "mean_time_base_s": round(sum(x["base_s"] for x in r) / len(r), 3),
                    "mean_time_union_s": round(sum(x["union_s"] for x in r) / len(r), 3)}
    src = {}
    for x in rows:
        for s in (x["solution_sources"] or []):
            k = s.split(":")[0]
            src[k] = src.get(k, 0) + 1
    summ["solution_found_by_source"] = src
    json.dump({"summary": summ, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    a = sys.argv
    sp = a[a.index("--student") + 1] if "--student" in a else None
    mode = a[a.index("--mode") + 1] if "--mode" in a else "union"
    only = a[a.index("--split") + 1] if "--split" in a else None
    main(a[1], a[2], int(a[3]), sp, mode, only)
