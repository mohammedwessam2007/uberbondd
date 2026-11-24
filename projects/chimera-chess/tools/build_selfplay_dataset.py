"""Quiet-position dataset from native self-play (attempt 2, evidence/v9/PREREG_nnue.md).
Each game: 6 uniformly random legal plies (seeded), then native EvalV2 at 3000 nodes/move until end or ply 160.
Every 2nd position after ply 8 is labelled by Stockfish 16 depth 7; kept only if not in check and SF's best move
is not a capture (quiet). Also emits the EvalV2 static eval for residual training.
Usage: python tools/build_selfplay_dataset.py out.tsv.gz n_games seed"""
import gzip, hashlib, random, subprocess, sys
import chess

class UCI:
    def __init__(self, cmd, init=()):
        self.p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        for c in ("uci",) + tuple(init) + ("isready",): self.w(c)
        self.r("readyok")
    def w(self, s): self.p.stdin.write(s + "\n"); self.p.stdin.flush()
    def r(self, pre):
        while True:
            l = self.p.stdout.readline()
            if l.startswith(pre): return l
    def go(self, fen, arg):
        self.w("position fen " + fen); self.w("go " + arg); last = None
        while True:
            l = self.p.stdout.readline()
            if l.startswith("info") and " score " in l: last = l
            if l.startswith("bestmove"): return l.split()[1], last

def score(info):
    t = info.split(); i = t.index("score")
    if t[i + 1] == "cp": return max(-2000, min(2000, int(t[i + 2])))
    return 2000 if int(t[i + 2]) > 0 else -2000

def main(out, n_games, seed):
    rng = random.Random(seed)
    me = UCI(["native/chimera"], ["setoption name EvalVersion value 2"])
    sf = UCI(["/usr/games/stockfish"], ["setoption name Threads value 1", "setoption name Hash value 16"])
    ev = subprocess.Popen(["native/chimera"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
    kept = 0
    with gzip.open(out, "wt") as fo:
        fo.write("fen\tscore_stm_cp\tevalv2_static\tsplit\tsource\tgame\n")
        for g in range(n_games):
            gid = f"selfplay-s{seed}-g{g}"
            split = "val" if int(hashlib.sha256(gid.encode()).hexdigest(), 16) % 10 == 0 else "train"
            b = chess.Board()
            for _ in range(6):
                ms = list(b.legal_moves)
                if not ms: break
                b.push(rng.choice(ms))
            while not b.is_game_over(claim_draw=True) and b.ply() < 160:
                if b.ply() >= 8 and (b.ply() + g) % 2 == 0 and not b.is_check():  # V11 fix: both sides to move (was white-only)
                    bm, info = sf.go(b.fen(), "depth 7")
                    if info and not b.is_capture(chess.Move.from_uci(bm)):
                        ev.stdin.write(f"position fen {b.fen()}\neval\n"); ev.stdin.flush()
                        e2 = int(ev.stdout.readline().split()[1])
                        fo.write(f"{b.fen()}\t{score(info)}\t{e2}\t{split}\tselfplay\t{gid}\n"); kept += 1
                mv, _ = me.go(b.fen(), "nodes 3000")
                if mv == "0000": break
                b.push_uci(mv)
            if g % 50 == 0: print(g, kept, flush=True)
    print("kept", kept)

if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
