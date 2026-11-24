"""Artistic benchmark (mandate §17) from REAL games: traces + PGNs of the gauntlet.
Per motif: RECOGNIZED (fired on any candidate), INVESTIGATED (fired on a deep candidate with full evidence), SELECTED (on the
played move), REFUTED (on a Skeptic-vetoed candidate), CONSTRUCTED (a construction motif #170/#172/#176/#207 on a played move
followed later in the same game by a played terminal mate/cage motif). Comparison: board-only motifs recomputed on the moves
actually played by WHOLE_MIND and by its opponent in the same games (identical predicates, per 100 moves).
Usage: python tools/omega/artistry.py out.json 'evidence/omega/gauntlet/*_vs_*.pgn' 'evidence/omega/gauntlet/trace_*.jsonl'"""
import glob, json, sys
import chess, chess.pgn
sys.path.insert(0, ".")
from chimera.omega import motifs as M

BOARD_ONLY = sorted(n for n, m in M.REGISTRY.items() if not m.needs and m.weight != 0)
CONSTRUCT = {170, 172, 176, 207}
TERMINAL = {n for n, m in M.REGISTRY.items() if m.group in ("mate", "cage")} - CONSTRUCT


def main(out, pgn_pat, tr_pat):
    stats = {n: {"recognized": 0, "investigated": 0, "selected": 0, "refuted": 0, "constructed": 0} for n in M.REGISTRY}
    games = {}
    for f in sorted(glob.glob(tr_pat)):
        for l in open(f):
            t = json.loads(l)
            if "candidates" not in t:
                continue
            gid = (f, t["start_fen"], tuple(t["history"][:8]))
            games.setdefault(gid, []).append(t)
            vet = {v["move"] for v in t.get("vetoed", [])}
            for c in t["candidates"]:
                for k in c["bd"]:
                    n = int(k[1:]); stats[n]["recognized"] += 1
                    if c.get("deep"):
                        stats[n]["investigated"] += 1
                    if c["move"] in vet:
                        stats[n]["refuted"] += 1
            for k in t.get("chosen", {}).get("bd", {}):
                stats[int(k[1:])]["selected"] += 1
    for gid, ts in games.items():
        ts.sort(key=lambda t: t["ply"])
        for i, t in enumerate(ts):
            for k in t.get("chosen", {}).get("bd", {}):
                n = int(k[1:])
                if n in CONSTRUCT and any(int(k2[1:]) in TERMINAL for t2 in ts[i + 1:] for k2 in t2.get("chosen", {}).get("bd", {})):
                    stats[n]["constructed"] += 1
    # matched comparison on played moves
    cmp = {"omega": {n: 0 for n in BOARD_ONLY}, "opponent": {n: 0 for n in BOARD_ONLY}}
    moves = {"omega": 0, "opponent": 0}
    sacs = {"omega": 0, "opponent": 0}
    for f in sorted(glob.glob(pgn_pat)):
        fh = open(f)
        while (g := chess.pgn.read_game(fh)) is not None:
            omega_white = g.headers.get("White", "").startswith("omega")
            b = g.board()
            for mv in g.mainline_moves():
                who = "omega" if (b.turn == chess.WHITE) == omega_white else "opponent"
                nb = b.copy(); nb.push(mv)
                c = M.Ctx(b, mv, nb)
                for n in BOARD_ONLY:
                    if M.REGISTRY[n].fn(c):
                        cmp[who][n] += 1
                if c.sac_value() >= 1:
                    sacs[who] += 1
                moves[who] += 1
                b.push(mv)
    per100 = {w: {f"#{n}": round(100 * v / max(1, moves[w]), 2) for n, v in cmp[w].items() if v} for w in cmp}
    res = {"games": len(games), "moves_played": moves, "static_sacrifices_per_100": {w: round(100 * sacs[w] / max(1, moves[w]), 2) for w in sacs},
           "per_motif_levels": {f"#{n}": v for n, v in stats.items() if any(v.values())},
           "never_recognized": [f"#{n}" for n, v in stats.items() if not v["recognized"]],
           "matched_comparison_board_only_per_100_moves": per100,
           "note": "opponent rows apply CHIMERA's own predicates to the opponent's played moves in the same games (matched openings, colours, clocks)"}
    json.dump(res, open(out, "w"), indent=1)
    print(json.dumps({k: res[k] for k in ("games", "moves_played", "static_sacrifices_per_100")}), "recognized motifs:", sum(1 for v in stats.values() if v["recognized"]),
          "selected:", sum(1 for v in stats.values() if v["selected"]), "constructed:", sum(1 for v in stats.values() if v["constructed"]), "refuted:", sum(1 for v in stats.values() if v["refuted"]))


if __name__ == "__main__":
    main(*sys.argv[1:4])
