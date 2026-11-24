"""Game-disjoint, Stockfish-labelled position dataset for the trained evaluator (see evidence/v9/PREREG_nnue.md).
Usage: python tools/build_eval_dataset.py /tmp/puzzles16.csv nnue/dataset_v1.tsv.gz [max_positions]"""
import csv, glob, gzip, hashlib, json, subprocess, sys
import chess, chess.pgn

def game_id(url):
    # https://lichess.org/game/<id>/black#48  (V9 fix: earlier version returned "game" for every url)
    if not url: return ""
    parts = [p for p in url.split("lichess.org/")[-1].split("#")[0].split("/") if p and p != "game"]
    return parts[0] if parts else ""

def split_of(gid):
    return "val" if int(hashlib.sha256(gid.encode()).hexdigest(), 16) % 10 == 0 else "train"

class SF:
    def __init__(self):
        self.p = subprocess.Popen(["/usr/games/stockfish"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.w("uci"); self.r("uciok"); self.w("setoption name Threads value 1"); self.w("setoption name Hash value 16"); self.w("isready"); self.r("readyok")
    def w(self, s): self.p.stdin.write(s + "\n"); self.p.stdin.flush()
    def r(self, pre):
        while True:
            l = self.p.stdout.readline()
            if l.startswith(pre): return l
    def score(self, fen, depth=7):
        self.w("position fen " + fen); self.w(f"go depth {depth}")
        last = None
        while True:
            l = self.p.stdout.readline()
            if l.startswith("info") and " score " in l: last = l
            if l.startswith("bestmove"): break
        t = last.split(); i = t.index("score")
        if t[i + 1] == "cp": return max(-2000, min(2000, int(t[i + 2])))
        m = int(t[i + 2]); return 2000 if m > 0 else -2000

def main(src, out, cap=150000):
    bench_games = set()
    for f in ("evidence/creative/bench.json", "evidence/v8/heldout_suite.json", "evidence/v8/hard_sac_suite.json"):
        for it in json.load(open(f))["items"]:
            bench_games.add(game_id(it.get("url", "")))
    bench_ids = set()
    for f in ("evidence/creative/bench.json", "evidence/v8/heldout_suite.json", "evidence/v8/hard_sac_suite.json"):
        bench_ids |= {it["id"].replace("-neg", "") for it in json.load(open(f))["items"]}
    rows = list(csv.DictReader(open(src)))
    # heldout/hard suites did not store urls: exclude by puzzle id -> their GameUrl from the source csv
    for r in rows:
        if r["PuzzleId"] in bench_ids: bench_games.add(game_id(r["GameUrl"]))
    bench_games.discard("")
    sf = SF(); n = 0; seen = set(); excluded = 0
    with gzip.open(out, "wt") as fo:
        fo.write("fen\tscore_stm_cp\tsplit\tsource\tgame\n")
        for r in rows:
            gid = game_id(r["GameUrl"])
            if gid in bench_games: excluded += 1; continue
            b = chess.Board(r["FEN"])
            # two positions per puzzle: the stored position and the one after the first (human) move
            for k in range(2):
                if not b.is_check() and not b.is_game_over():
                    key = b.board_fen() + (" w" if b.turn else " b")
                    if key not in seen:
                        seen.add(key)
                        fo.write(f"{b.fen()}\t{sf.score(b.fen())}\t{split_of(gid)}\tlichess_puzzle\t{gid}\n"); n += 1
                if k == 0: b.push_uci(r["Moves"].split()[0])
            if n >= cap * 0.8: break
        for path in sorted(glob.glob("evidence/matches/*.pgn") + glob.glob("evidence/v8/matches/*.pgn")):
            with open(path) as f:
                gi = 0
                while True:
                    g = chess.pgn.read_game(f)
                    if g is None: break
                    gi += 1; gid = f"{path}#{gi}"; b = g.board()
                    for ply, mv in enumerate(g.mainline_moves()):
                        b.push(mv)
                        if ply % 3 or b.is_check() or b.is_game_over(): continue
                        key = b.board_fen() + (" w" if b.turn else " b")
                        if key in seen: continue
                        seen.add(key)
                        fo.write(f"{b.fen()}\t{sf.score(b.fen())}\t{split_of(gid)}\tmatch_pgn\t{gid}\n"); n += 1
                        if n >= cap: break
                    if n >= cap: break
            if n >= cap: break
    print(json.dumps({"positions": n, "excluded_puzzles_from_benchmark_games": excluded, "benchmark_games": len(bench_games)}))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 150000)
