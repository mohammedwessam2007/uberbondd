"""#050 Petrosian-Tal transform (V13, state-conditioned, NOT turn-count based). On fresh positions (lab/human_v13.jsonl, never
used for tuning) compare at equal nodes the StyleProfile heads: none / attack-only / restraint-only / transform (restraint until
opponent mobility <= 28 or attack pressure >= 6, then attack). 'averaged' = the attack head's choice when attack and restraint
agree, else the plain choice (a non-sequential blend). Metrics: deterministic oracle loss (soundness), opponent mobility after the
move (restriction), king-zone pressure after the move (attack), and for transform the mode actually used.
H (pre-registered evidence/v13/PREREG_transform.md): transform loss <= attack-only loss, and in low-mobility states transform
attacks while in high-mobility states it restricts more than attack-only. Usage: python tools/transform_style.py in.jsonl out.json N depth  (V13 fix: fixed DEPTH, because under a node limit the post-search style probes abort immediately -- style never acts in node-limited search)"""
import json, subprocess, sys
import chess
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from lab.oracle import Oracle


def run(fen, nodes, prof):
    cmd = (f"setoption name StyleProfile value {prof}\nsetoption name StyleMarginCp value 30\n" if prof != "none" else "") + f"position fen {fen}\ngo depth {nodes}\nisready\nquit\n"
    o = subprocess.run([ROOT + "/native/chimera"], input=cmd, capture_output=True, text=True).stdout.splitlines()
    mode = next((l.split()[3] for l in o if l.startswith("info string style")), None)
    return [l.split()[1] for l in o if l.startswith("bestmove")][-1], mode


def feats(fen, u):
    b = chess.Board(fen); us = b.turn; b.push_uci(u)
    mob = b.legal_moves.count(); ek = b.king(not us)
    press = sum(1 for z in chess.SquareSet(chess.BB_KING_ATTACKS[ek]) if b.attackers(us, z)) if ek is not None else 0
    return mob, press


def main(src, out, n, nodes):
    rows = [json.loads(l) for l in open(src)][:n]; o = Oracle(); res = []
    for r in rows:
        fen = r["fen"]; b = chess.Board(fen)
        nb = chess.Board(fen); nb.push(chess.Move.null()) if not nb.is_check() else None
        opp_mob_now = nb.legal_moves.count() if not b.is_check() else None
        row = {"fen": fen, "opp_mobility_now": opp_mob_now}
        for p in ("none", "attack", "restraint", "transform"):
            mv, mode = run(fen, nodes, p); mob, press = feats(fen, mv)
            row[p] = {"move": mv, "mode": mode, "loss": o.loss(fen, mv, 300000), "opp_mob_after": mob, "king_press_after": press}
        av = row["attack"]["move"] if row["attack"]["move"] == row["restraint"]["move"] else row["none"]["move"]
        mob, press = feats(fen, av); row["averaged"] = {"move": av, "loss": o.loss(fen, av, 300000), "opp_mob_after": mob, "king_press_after": press}
        res.append(row); print(len(res), {p: (row[p]["move"], row[p]["loss"]) for p in ("none", "attack", "restraint", "transform", "averaged")}, flush=True)
    o.close()
    P = ("none", "attack", "restraint", "transform", "averaged")
    m = lambda rs, p, k: round(sum(x[p][k] for x in rs) / max(1, len(rs)), 2)
    lo = [x for x in res if x["opp_mobility_now"] is not None and x["opp_mobility_now"] <= 28]
    hi = [x for x in res if x["opp_mobility_now"] is not None and x["opp_mobility_now"] > 28]
    S = {"n": len(res), "nodes": nodes, "mean_loss": {p: m(res, p, "loss") for p in P},
         "low_mobility_states": {"n": len(lo), "king_press": {p: m(lo, p, "king_press_after") for p in P}},
         "high_mobility_states": {"n": len(hi), "opp_mob_after": {p: m(hi, p, "opp_mob_after") for p in P}},
         "transform_mode_counts": {k: sum(x["transform"]["mode"] == k for x in res) for k in ("transform:attack", "transform:restraint", None)},
         "decision_differs_from_none": {p: sum(x[p]["move"] != x["none"]["move"] for x in res) for p in P}}
    json.dump({"summary": S, "rows": res}, open(out, "w"), indent=1); print(json.dumps(S, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))
