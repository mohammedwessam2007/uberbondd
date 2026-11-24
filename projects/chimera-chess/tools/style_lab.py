"""Trait-conditioned profile lab (Wave D, honest scope: trait profiles, NOT named-master models).
Positions: every 9th ply of archived V8/V9 match games (our own games), first N. Each position is searched at the same
fixed depth with StyleProfile none / attack / restraint (StyleMarginCp 30). Measured per profile: decision-change rate
vs none, trait values of chosen moves (computed independently here in python-chess), Stockfish 16 d12 cp loss.
Usage: python tools/style_lab.py out.json N depth"""
import glob
import json
import sys

import chess
import chess.engine
import chess.pgn

ROOT = __file__.rsplit("/tools/", 1)[0]
W = {chess.PAWN: 1, chess.KNIGHT: 2, chess.BISHOP: 2, chess.ROOK: 3, chess.QUEEN: 5, chess.KING: 0}


def traits(b, m):
    us = b.turn
    b.push(m)
    ek = b.king(not us)
    zone = chess.SquareSet(chess.BB_KING_ATTACKS[ek]) | chess.SquareSet([ek])
    attack = 0
    for sq, p in b.piece_map().items():
        if p.color == us and p.piece_type != chess.KING:
            attack += W[p.piece_type] * len(b.attacks(sq) & zone)
    if b.is_check():
        attack += 6
    ok = b.king(us)
    press = sum(len(b.attackers(not us, z)) for z in chess.SquareSet(chess.BB_KING_ATTACKS[ok]))
    restraint = -(b.legal_moves.count() + 3 * press)
    b.pop()
    return attack, restraint


def main(out, n, depth):
    pos = []
    for path in sorted(glob.glob(ROOT + "/evidence/v8/matches/*.pgn") + glob.glob(ROOT + "/evidence/v9/matches/*.pgn")):
        with open(path) as f:
            while len(pos) < n:
                g = chess.pgn.read_game(f)
                if g is None:
                    break
                b = g.board()
                for ply, mv in enumerate(g.mainline_moves()):
                    b.push(mv)
                    if ply % 9 == 4 and not b.is_game_over() and b.legal_moves.count() > 3:
                        pos.append(b.fen())
        if len(pos) >= n:
            break
    pos = pos[:n]
    engines = {}
    for prof in ("none", "attack", "restraint"):
        e = chess.engine.SimpleEngine.popen_uci(ROOT + "/native/chimera")
        e.configure({"StyleProfile": prof, "StyleMarginCp": 30})
        engines[prof] = e
    sf = chess.engine.SimpleEngine.popen_uci("/usr/games/stockfish"); sf.configure({"Threads": 1, "Hash": 32})
    rows = []
    for fen in pos:
        b = chess.Board(fen)
        best = sf.analyse(b, chess.engine.Limit(depth=12))
        bs = best["score"].relative.score(mate_score=100000)
        r = {"fen": fen}
        for prof, e in engines.items():
            e.protocol.send_line("ucinewgame")
            m = e.play(b, chess.engine.Limit(depth=depth)).move
            v = sf.analyse(b, chess.engine.Limit(depth=12), root_moves=[m])["score"].relative.score(mate_score=100000)
            a, rs = traits(b, m)
            r[prof] = {"move": m.uci(), "attack": a, "restraint": rs, "sf_loss": 0 if bs >= 90000 and v >= 90000 else max(0, min(1000, bs - v))}
        rows.append(r)
    for e in engines.values():
        e.quit()
    sf.quit()
    summ = {"positions": len(rows), "depth": depth, "margin_cp": 30}
    for prof in ("none", "attack", "restraint"):
        summ[prof] = {"changed_vs_none": round(sum(r[prof]["move"] != r["none"]["move"] for r in rows) / len(rows), 3),
                      "mean_attack_trait": round(sum(r[prof]["attack"] for r in rows) / len(rows), 2),
                      "mean_restraint_trait": round(sum(r[prof]["restraint"] for r in rows) / len(rows), 2),
                      "mean_sf_loss": round(sum(r[prof]["sf_loss"] for r in rows) / len(rows), 1)}
    # paired effect on positions where the profile changed the move
    for prof, key in (("attack", "attack"), ("restraint", "restraint")):
        ch = [r for r in rows if r[prof]["move"] != r["none"]["move"]]
        summ[prof]["changed_n"] = len(ch)
        if ch:
            summ[prof]["paired_trait_gain_on_changed"] = round(sum(r[prof][key] - r["none"][key] for r in ch) / len(ch), 2)
            summ[prof]["paired_sf_loss_delta_on_changed"] = round(sum(r[prof]["sf_loss"] - r["none"]["sf_loss"] for r in ch) / len(ch), 1)
    json.dump({"summary": summ, "rows": rows}, open(out, "w"), indent=1)
    print(json.dumps(summ, indent=1))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
