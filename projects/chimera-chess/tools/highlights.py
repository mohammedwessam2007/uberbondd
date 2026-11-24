"""#167 offline highlight generator (V13). For each game of a match PGN: (1) score every position with the deterministic oracle
(lab/oracle.py, 200k nodes); (2) annotate 'turning points' (mover's move loses >= 150cp) and 'only moves' (the played move is the
oracle best and the second-best legal alternative is >= 150cp worse, checked at 60k for all moves then at 200k for the top two);
(3) link each turning point to the causally prior move (the opponent move immediately before) and the oracle's better move;
(4) FACTUAL FIDELITY: every claim is re-verified by an independent fresh oracle configuration (1M nodes); claims whose sign or
>=100cp margin does not survive are dropped and counted. Aesthetic proxy: only-moves that are quiet (no capture/check).
Writes annotated PGN + JSON receipt. No human usefulness claim (no raters). Usage: python tools/highlights.py games.pgn out_prefix max_games"""
import json, sys
import chess, chess.pgn
ROOT = __file__.rsplit("/tools/", 1)[0]
sys.path.insert(0, ROOT)
from lab.oracle import Oracle


def main(pgn, outp, maxg):
    o = Oracle(); f = open(pgn); games = []; stats = {"claims": 0, "verified": 0, "dropped": 0}
    while len(games) < maxg:
        g = chess.pgn.read_game(f)
        if g is None:
            break
        b = g.board(); node = g; prev = None; hl = []
        for mv in g.mainline_moves():
            fen = b.fen(); u = mv.uci()
            best = o.best(fen, 200000); bs = o.score(fen, None, 200000); ms = o.score(fen, u, 200000)
            claim = None
            if bs - ms >= 150 and abs(bs) < 90000:
                claim = {"type": "turning_point", "ply": b.ply(), "move": b.san(mv), "loss": bs - ms, "better": b.san(chess.Move.from_uci(best)), "prior_move": prev}
            elif u == best and len(list(b.legal_moves)) > 1:
                alts = sorted(((o.score(fen, m.uci(), 60000), m.uci()) for m in b.legal_moves if m.uci() != u), reverse=True)
                a2 = o.score(fen, alts[0][1], 200000)
                if bs - a2 >= 150 and abs(bs) < 90000:
                    claim = {"type": "only_move", "ply": b.ply(), "move": b.san(mv), "margin": bs - a2, "next_best": b.san(chess.Move.from_uci(alts[0][1])),
                             "quiet": not (b.is_capture(mv) or b.gives_check(mv))}
            if claim:
                stats["claims"] += 1
                vb = o.score(fen, None, 1000000); vm = o.score(fen, u, 1000000)
                ok = (vb - vm >= 100) if claim["type"] == "turning_point" else (vb - o.score(fen, alts[0][1], 1000000) >= 100)
                claim["verified_1M"] = ok
                if ok:
                    stats["verified"] += 1; hl.append(claim)
                else:
                    stats["dropped"] += 1
            prev = b.san(mv); b.push(mv)
        # annotate PGN
        node = g
        for mv in g.mainline_moves():
            nxt = node.variation(mv)
            for c in hl:
                if c["ply"] == node.board().ply():
                    nxt.comment = (f"TURNING POINT: loses {c['loss']}cp; {c['better']} was better (after {c['prior_move']})" if c["type"] == "turning_point"
                                   else f"ONLY MOVE{' (quiet)' if c['quiet'] else ''}: next best {c['next_best']} is {c['margin']}cp worse")
                    nxt.nags.add(chess.pgn.NAG_BLUNDER if c["type"] == "turning_point" else chess.pgn.NAG_BRILLIANT_MOVE)
            node = nxt
        games.append({"headers": dict(g.headers), "highlights": hl}); open(outp + ".pgn", "a").write(str(g) + "\n\n")
        print(len(games), len(hl), stats, flush=True)
    o.close()
    json.dump({"source": pgn, "oracle": "200k claims, 1M verification", "stats": stats, "games": games,
               "quiet_only_moves": sum(c["type"] == "only_move" and c["quiet"] for gg in games for c in gg["highlights"])}, open(outp + ".json", "w"), indent=1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))
