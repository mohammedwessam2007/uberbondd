"""Targeted integration campaign (mandate §9/§13/§18): drive EVERY executable motif through the real WHOLE_MIND decision process.
For each motif: find real positions where its predicate applies (CC0 Lichess puzzles filtered by theme, real game positions,
exact opening histories), then run WholeMind.choose() twice on the position:
  ON  : all motifs enabled           OFF : the same, with this one motif disabled (controlled intervention)
Recorded per motif: REACHED (fired on a runtime candidate with real evals/evidence), SELECTED (on the chosen move),
CAUSAL (disabling it changed the decision), plus the Skeptic verdicts. No predicate is forced: if the runtime's evidence
does not satisfy it, it is reported as not reached.
Usage: python tools/omega/integration_campaign.py /tmp/puzzles16.csv evidence/omega/integration_campaign.json [ids]"""
import csv, json, os, sys, time
import chess
sys.path.insert(0, ".")
from chimera.omega import motifs as M
from chimera.omega.config import make
from chimera.omega.mind import WholeMind

THEMES = {33: "smotheredMate", 99: "anastasiaMate", 100: "bodenMate", 105: "epauletteMate", 35: "doubleCheck", 186: "underPromotion",
          194: "underPromotion", 203: "underPromotion", 201: "enPassant", 192: "castling", 59: "discoveredAttack", 101: "mateIn1",
          102: "mateIn1", 103: "mateIn1", 144: "mateIn2", 200: "mateIn2", 104: "opening", 34: "sacrifice", 190: "sacrifice",
          145: "endgame", 125: "queenEndgame", 126: "pawnEndgame", 127: "endgame", 219: "endgame", 205: "endgame"}
OPENINGS = {27: ["e2e4 e7e5", "d2d4"], 61: ["d2d4 g8f6", "e2e4 e7e5"], 62: ["d2d4 d7d5 c1f4"], 63: ["e2e4 c7c5"], 64: ["e2e4 g7g6 d2d4 f8g7"],
            195: ["e2e4", "d2d4", "c2c4"], 44: ["e2e4 e7e5 g1f3 b8c6"], 218: ["a2a4 e7e5 h2h4"]}


def prefilter(board, n):
    """Moves for which motif n's predicate fires with optimistic eval evidence (geometry check only; the runtime decides)."""
    out = []
    for m in board.legal_moves:
        nb = board.copy(); nb.push(m)
        c = M.Ctx(board, m, nb, eval_cp=400.0 if not nb.is_checkmate() else 99999.0, best_cp=400.0, cand={})
        try:
            if M.REGISTRY[n].fn(c):
                out.append(m.uci())
        except Exception:
            pass
    return out


def positions_for(n, puzzles, games):
    if n in OPENINGS:
        for h in OPENINGS[n]:
            b = chess.Board()
            for u in h.split():
                b.push_uci(u)
            yield b
    th = THEMES.get(n)
    for r in puzzles:
        if th and th not in r["Themes"]:
            continue
        b = chess.Board(r["FEN"]); b.push_uci(r["Moves"].split()[0])
        yield b
    for b in games:
        yield b


def main(puzzle_csv, out, ids=None):
    puzzles = list(csv.DictReader(open(puzzle_csv)))[:60000]
    games = []
    import glob, chess.pgn
    for f in sorted(glob.glob("evidence/v9/matches/*.pgn"))[:6]:
        fh = open(f)
        while (g := chess.pgn.read_game(fh)) is not None and len(games) < 3000:
            b = g.board()
            for mv in g.mainline_moves():
                b.push(mv)
                if b.ply() % 3 == 0 and not b.is_game_over():
                    games.append(b.copy())
    status = json.load(open("canon/IMPLEMENTATION_STATUS.json"))["per_id"]
    todo = ids or [int(k[-3:]) for k, v in status.items() if v["class"] == "MOTIF" and v["integration_fired_on_candidates"] == 0]
    res = json.load(open(out)) if os.path.isfile(out) else {}
    cfg = make(profile="WHOLE_MIND_V2", root_nodes=150000, reply_nodes=15000)
    mind = WholeMind(cfg)
    try:
        for n in todo:
            if str(n) in res and res[str(n)].get("reached"):
                continue
            rec = {"motif": n, "name": M.REGISTRY[n].name, "attempts": []}
            tried = 0
            t0 = time.time()
            for b in positions_for(n, puzzles, games):
                if tried >= 6 or time.time() - t0 > 240:
                    break
                mv = prefilter(b, n)
                if not mv:
                    continue
                tried += 1
                mind.newgame(); mind.enabled = None
                m_on, tr_on = mind.choose(b.copy())
                fired = [c["move"] for c in tr_on.get("candidates", []) if f"#{n}" in c["bd"]]
                mind.newgame(); mind.enabled = set(M.REGISTRY) - {n}
                m_off, tr_off = mind.choose(b.copy())
                mind.enabled = None
                a = {"fen": b.fen(), "history": [x.uci() for x in b.move_stack], "prefilter_moves": mv[:5], "runtime_fired_on": fired,
                     "chosen_on": m_on.uci() if m_on else None, "chosen_off": m_off.uci() if m_off else None,
                     "selected": bool(m_on and f"#{n}" in tr_on.get("chosen", {}).get("bd", {})), "vetoed": tr_on.get("vetoed", []),
                     "gate_rule": tr_on.get("gate_rule")}
                rec["attempts"].append(a)
                if fired:
                    break
            rec["reached"] = any(a["runtime_fired_on"] for a in rec["attempts"])
            rec["selected"] = any(a["selected"] for a in rec["attempts"])
            rec["causal"] = any(a["chosen_on"] != a["chosen_off"] and a["selected"] for a in rec["attempts"])
            rec["status"] = "REACHED" if rec["reached"] else ("PREDICATE_FOUND_NOT_REACHED" if rec["attempts"] else "NO_POSITION_FOUND")
            res[str(n)] = rec
            json.dump(res, open(out, "w"), indent=1)
            print(n, rec["status"], "selected" if rec["selected"] else "", "causal" if rec["causal"] else "", flush=True)
    finally:
        mind.close()


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 else None)
