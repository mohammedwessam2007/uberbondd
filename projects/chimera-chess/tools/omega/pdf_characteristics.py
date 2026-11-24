"""PDF characteristic benchmark (document A §6.1 'Dominant Motif Output', §6.3, manual §6.2) measured on REAL games.
Counts motif events on the moves CHIMERA actually PLAYED (trace 'chosen' breakdown), per game, against the PDF's figures:
  4.2 Tal sacrifices/game (v1-3) | 3.8 Maia-3 panic traps/game (v4-7) | 5.1 multi-pin & battery nets/game (v8-11)
  2.4 underpromotions / fake-outs per game (v12-15) | 3.1 zero-retreat / e.p.# setups per game (v16-17)
  2.8 Judas / Zombie / 0-check mates per game (v18) | draw rate ~17% | score vs Stockfish UCI_Elo 2685 4.8/10.
The mapping of PDF categories to CODEX220 motif IDs is explicit below (engineering interpretation, recorded).
Usage: python tools/omega/pdf_characteristics.py out.json trace.jsonl [summary.json ...]"""
import json, sys

CATS = {
    "tal_sacrifices": ({11, 14, 24, 34, 104, 145, 147, 175, 184, 188, 190, 204, 213, 217}, 4.2),   # counted once per played real sacrifice
    "maia_panic_traps": ({40, 48, 131, 216}, 3.8),
    "multipin_battery_nets": ({9, 59, 97, 98, 146, 211}, 5.1),
    "underpromotion_fakeouts": ({186, 194, 203, 197}, 2.4),
    "zero_retreat_ep_setups": ({209, 201, 172}, 3.1),
    "judas_zombie_0check": ({215, 217, 220}, 2.8),
}
THRESH = {9: 2.2, 97: 0.0, 209: 1.6, 172: 0.49, 215: 0.0, 217: 3.81}   # event = strong enough instance (2+ new pins, 2+ ring attackers, streak >= 2)   # minimum weighted value for an event (constant baselines excluded)


def events(bd, ids, delta_ok):
    n = 0
    for k, v in bd.items():
        i = int(k[1:])
        if i in ids and v > THRESH.get(i, 0.0) and (i != 215 or delta_ok):
            n += 1
    return n


def main(out, trace, *summaries):
    G = {}
    for l in open(trace):
        t = json.loads(l)
        if "chosen" not in t:
            continue
        key = (t["start_fen"], tuple(t["history"][:6]), t["ply"] % 2)    # opening line x colour (parallel games interleave)
        cur = G.get(key)
        if cur is None or t["ply"] < cur["last_ply"]:
            cur = {"key": key, "last_ply": -1, "counts": {c: 0 for c in CATS}, "moves": 0, "judas_prev": None}
            G[key + (len(G),)] = cur; G[key] = cur
        cur["last_ply"] = t["ply"]
        cur["moves"] += 1
        bd = t["chosen"].get("bd", {})
        j = bd.get("#215", 0.0)
        delta_ok = cur["judas_prev"] is not None and j > cur["judas_prev"]   # entombment that INCREASED this move
        cur["judas_prev"] = j
        for c, (ids, _) in CATS.items():
            if c == "tal_sacrifices":
                cur["counts"][c] += 1 if t["chosen"].get("sac") and any(int(k[1:]) in ids for k in bd) else 0
            else:
                cur["counts"][c] += min(1, events(bd, ids, delta_ok))    # at most one event of a category per played move
    games = list({id(g): g for g in G.values()}.values())
    n = len(games)
    per_game = {c: round(sum(g["counts"][c] for g in games) / max(1, n), 2) for c in CATS}
    res = {"trace": trace, "games": n, "per_game": per_game, "pdf_target": {c: t for c, (_, t) in CATS.items()},
           "ratio_to_pdf": {c: round(per_game[c] / CATS[c][1], 2) for c in CATS}}
    for s in summaries:
        d = json.load(open(s))
        res.setdefault("matches", []).append({"file": s, "b": d["b"], "games": d["games"], "W-D-L": [d["a_wins"], d["draws"], d["a_losses"]],
                                               "score": d["a_score"], "draw_rate": round(d["draws"] / d["games"], 3)})
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps(res, indent=0))


if __name__ == "__main__":
    main(*sys.argv[1:])
