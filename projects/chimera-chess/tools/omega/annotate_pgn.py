"""#160 PGN motif exporter: merges a WHOLE_MIND trace (JSONL) into a PGN as move comments (motifs on the chosen move,
arbitration result, Skeptic vetoes). Usage: python tools/omega/annotate_pgn.py games.pgn trace.jsonl out.pgn"""
import json, sys
import chess, chess.pgn


def main(pgn, trace, out):
    T = {}
    for l in open(trace):
        t = json.loads(l)
        if "move" in t:
            T[(t["start_fen"], tuple(t["history"]))] = t
    n = 0
    with open(pgn) as f, open(out, "w") as o:
        while (g := chess.pgn.read_game(f)) is not None:
            node = g
            while node.variations:
                nxt = node.variations[0]
                b = node.board()
                t = T.get((b.root().fen(), tuple(m.uci() for m in b.move_stack)))
                if t and t["move"] == nxt.move.uci():
                    bd = t.get("chosen", {}).get("bd", {})
                    nxt.comment = ("motifs " + " ".join(f"{k}={v}" for k, v in sorted(bd.items(), key=lambda kv: -abs(kv[1]))[:6])
                                   + f"; {t['arbitration']['result']}" + (f"; vetoed {[v['move'] for v in t['vetoed']]}" if t.get("vetoed") else ""))
                    n += 1
                node = nxt
            print(g, file=o, end="\n\n")
    print("annotated moves", n)


if __name__ == "__main__":
    main(*sys.argv[1:4])
