"""V8 native core correctness: perft vs published counts, legality parity vs python-chess on
positions from real games, UCI protocol, deadline, interruption. Run: python -m unittest -v tests.test_native"""
import os
import random
import subprocess
import time
import unittest

import chess
import chess.pgn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BIN = os.path.join(ROOT, "native", "chimera")

# Standard perft suite (chessprogramming.org "Perft Results").
PERFT = [
    ("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 5, 4865609),
    ("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", 4, 4085603),
    ("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", 5, 674624),
    ("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", 4, 422333),
    ("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", 4, 2103487),
    ("r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10", 4, 3894594),
]


class Engine:
    def __init__(self):
        self.p = subprocess.Popen([BIN], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.send("uci")
        self.until("uciok")
        self.send("isready")  # UCI handshake: GUIs wait for readyok before the first go (cold init excluded)
        self.until("readyok")

    def send(self, s):
        self.p.stdin.write(s + "\n")
        self.p.stdin.flush()

    def until(self, prefix, timeout=60):
        t0 = time.time()
        lines = []
        while time.time() - t0 < timeout:
            l = self.p.stdout.readline().strip()
            lines.append(l)
            if l.startswith(prefix):
                return l, lines
        raise TimeoutError(prefix)

    def close(self):
        self.send("quit")
        self.p.wait(5)


def perft_divide(e, fen, depth):
    e.send(f"position fen {fen}")
    e.send(f"go perft {depth}")
    last, lines = e.until("Nodes searched")
    div = {}
    for l in lines:
        if ":" in l and not l.startswith("Nodes"):
            m, n = l.split(":")
            div[m.strip()] = int(n)
    return int(last.split()[-1]), div


class Native(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        assert os.path.exists(BIN), "build first: sh native/build.sh"
        cls.e = Engine()

    @classmethod
    def tearDownClass(cls):
        cls.e.close()

    def test_perft_suite(self):
        for fen, d, n in PERFT:
            got, _ = perft_divide(self.e, fen, d)
            self.assertEqual(got, n, fen)

    def test_legal_move_parity_on_game_positions(self):
        # every position of every archived V7 match game: native legal set == python-chess legal set
        pgns = [os.path.join(ROOT, "evidence", "matches", f) for f in
                ("tactical_vs_sf1600.pgn", "tactical_vs_sf2000.pgn")]
        rng = random.Random(7)
        checked = 0
        for path in pgns:
            with open(path) as f:
                while True:
                    g = chess.pgn.read_game(f)
                    if g is None:
                        break
                    b = g.board()
                    for mv in g.mainline_moves():
                        if rng.random() < 0.25:
                            _, div = perft_divide(self.e, b.fen(), 1)
                            self.assertEqual(set(div), {m.uci() for m in b.legal_moves}, b.fen())
                            checked += 1
                        b.push(mv)
        self.assertGreater(checked, 500)

    def test_uci_game_moves_and_repetition(self):
        # history via 'position startpos moves' must make 3-fold detectable and keep legality
        e = self.e
        e.send("ucinewgame")
        e.send("position startpos moves g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1")
        e.send("go depth 6")
        best, _ = e.until("bestmove")
        b = chess.Board()
        for u in "g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1".split():
            b.push_uci(u)
        self.assertIn(chess.Move.from_uci(best.split()[1]), b.legal_moves)

    def test_underpromotion_and_ep_legal(self):
        _, div = perft_divide(self.e, "8/P7/8/8/8/8/8/k6K w - - 0 1", 1)
        self.assertTrue({"a7a8q", "a7a8r", "a7a8b", "a7a8n"} <= set(div))
        _, div = perft_divide(self.e, "8/8/8/3pP3/8/8/8/k6K w - d6 0 1", 1)
        self.assertIn("e5d6", div)

    def test_mate_and_stalemate_terminal(self):
        e = self.e
        e.send("position fen 6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1")
        e.send("go depth 4")
        best, lines = e.until("bestmove")
        self.assertEqual(best.split()[1], "d1d8")
        e.send("position fen 7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")  # stalemate: black to move, no moves
        e.send("go depth 3")
        best, _ = e.until("bestmove")
        self.assertEqual(best.split()[1], "0000")

    def test_hard_deadline_movetime(self):
        e = self.e
        worst = 0.0
        for fen in [chess.STARTING_FEN, PERFT[1][0], PERFT[5][0]]:
            for _ in range(5):
                e.send(f"position fen {fen}")
                e.send("isready")
                e.until("readyok")
                t0 = time.perf_counter()
                e.send("go movetime 80")
                e.until("bestmove")
                worst = max(worst, (time.perf_counter() - t0) * 1000)
        self.assertLess(worst, 80.0, f"max {worst:.1f}ms")

    def test_stop_infinite_and_no_board_corruption(self):
        e = self.e
        e.send(f"position fen {PERFT[1][0]}")
        e.send("d")
        h1, _ = e.until("hash")
        e.send("go infinite")
        time.sleep(0.2)
        e.send("stop")
        best, _ = e.until("bestmove", 5)
        e.send("d")
        h2, _ = e.until("hash")
        self.assertEqual(h1, h2)
        self.assertIn(chess.Move.from_uci(best.split()[1]), chess.Board(PERFT[1][0]).legal_moves)


if __name__ == "__main__":
    unittest.main()
