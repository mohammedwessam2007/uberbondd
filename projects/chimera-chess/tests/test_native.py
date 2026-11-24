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


class PlanMemoryTests(unittest.TestCase):
    """V9 Architect plan state: persistence, continuation check, reset, history dependence."""

    def setUp(self):
        self.e = Engine()
        self.e.send("setoption name PlanMemory value true")
        self.e.send("ucinewgame")

    def tearDown(self):
        self.e.close()

    def go(self, pos, ms=300):
        self.e.send(pos)
        self.e.send(f"go movetime {ms}")
        best, lines = self.e.until("bestmove")
        plan = [l for l in lines if l.startswith("info string plan")][-1]
        nodes = [int(l.split(" nodes ")[1].split()[0]) for l in lines if " nodes " in l]
        kv = dict(t.split("=", 1) for t in plan.split() if "=" in t)
        return best.split()[1], kv, (nodes[-1] if nodes else 0)

    def test_on_track_then_reset_on_new_game(self):
        mv, kv, _ = self.go("position startpos")
        pred = kv["pred_reply"]
        self.assertNotEqual(pred, "0000")
        _, kv2, _ = self.go(f"position startpos moves {mv} {pred}")
        self.assertIn("status=ON_TRACK", self.last_plan_line(kv2))
        self.e.send("ucinewgame")
        _, kv3, _ = self.go(f"position startpos moves {mv} {pred}")
        self.assertIn(kv3["status"], ("NONE", "RESET"))

    def last_plan_line(self, kv):
        return "status=" + kv["status"]

    def test_surprise_detected(self):
        mv, kv, _ = self.go("position startpos")
        b = chess.Board(); b.push_uci(mv)
        other = next(m.uci() for m in b.legal_moves if m.uci() != kv["pred_reply"])
        _, kv2, _ = self.go(f"position startpos moves {mv} {other}")
        self.assertIn(kv2["status"], ("SURPRISED", "BROKEN"))
        self.assertEqual(int(kv2["surprises"]) + int(kv2["breaks"]), 1)

    def test_same_board_two_histories(self):
        # identical board/castling/ep reached (a) as continuation of the engine's own plan, (b) by FEN restore
        mv, kv, _ = self.go("position startpos")
        b = chess.Board(); b.push_uci(mv); b.push_uci(kv["pred_reply"])
        _, a, _ = self.go(f"position startpos moves {mv} {kv['pred_reply']}")
        self.e.send("ucinewgame")
        _, c, _ = self.go(f"position fen {b.fen()}")
        self.assertEqual(a["status"], "ON_TRACK")
        self.assertIn(c["status"], ("NONE", "RESET"))
        self.assertEqual(int(a["hits"]), 1)


class SearchMovesTests(unittest.TestCase):
    def test_searchmoves_before_limits(self):
        # regression: V9 parser swallowed 'nodes N' after searchmoves -> unbounded search
        e = Engine()
        e.send("position startpos")
        t0 = time.time()
        e.send("go searchmoves a2a3 h2h4 nodes 5000")
        best, _ = e.until("bestmove", 10)
        self.assertIn(best.split()[1], ("a2a3", "h2h4"))
        self.assertLess(time.time() - t0, 2.0)
        e.close()


class ForcedMoveTests(unittest.TestCase):
    def test_single_legal_move_reports_pv(self):
        e = Engine()
        e.send("position fen 7k/8/8/8/8/8/6q1/7K w - - 0 1")
        e.send("go nodes 100")
        best, lines = e.until("bestmove", 5)
        self.assertEqual(best.split()[1], "h1g2")
        self.assertTrue(any(" pv h1g2" in l for l in lines))
        e.close()


class V11FeatureTests(unittest.TestCase):
    def setUp(self):
        self.e = Engine()

    def tearDown(self):
        self.e.close()

    def test_incremental_accumulator_exact(self):
        nn = os.path.join(ROOT, "nnue", "chimera-nnue-v2r.bin")
        if not os.path.exists(nn):
            self.skipTest("no trained net present")
        self.e.send(f"setoption name EvalFile value {nn}")
        for fen, d in [(PERFT[1][0], 3), (PERFT[4][0], 3), ("8/P7/8/3pP3/8/8/8/k6K w - d6 0 1", 3)]:
            self.e.send(f"position fen {fen}")
            self.e.send(f"nncheck {d}")
            l, _ = self.e.until("nncheck")
            t = l.split()
            self.assertEqual(int(t[4]), 0, l)          # incremental == full refresh at every node
            self.assertLess(float(t[6]), 5.0, l)       # quantization error vs float reference (cp)

    def test_multipv_ordered(self):
        self.e.send("setoption name MultiPV value 3")
        self.e.send("position startpos")
        self.e.send("go depth 7")
        _, lines = self.e.until("bestmove")
        d7 = [l for l in lines if l.startswith("info depth 7")]
        main = [int(l.split(" cp ")[1].split()[0]) for l in d7 if "multipv" not in l and " cp " in l]
        extra = [int(l.split(" cp ")[1].split()[0]) for l in d7 if "multipv" in l]
        self.assertEqual(len(extra), 2)
        self.assertTrue(main and all(x <= main[0] for x in extra))

    def test_style_respects_margin(self):
        fen = "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 1 6"
        for prof in ("attack", "restraint"):
            self.e.send(f"setoption name StyleProfile value {prof}")
            self.e.send("setoption name StyleMarginCp value 30")
            self.e.send(f"position fen {fen}")
            self.e.send("go depth 8")
            _, lines = self.e.until("bestmove")
            for l in lines:
                if l.startswith("info string style"):
                    t = l.split()
                    chosen, top = int(t[6].strip("()")), int(t[9].strip("()"))
                    self.assertLessEqual(top - chosen, 30, l)

    def test_stateless_and_governor_options(self):
        self.e.send("setoption name ClearStateEachMove value true")
        self.e.send("setoption name Governor value true")
        self.e.send("setoption name GovernorWeights value -2,0,0,1,0,0,0,0.5,0.15")
        self.e.send("position startpos")
        self.e.send("go movetime 150")
        best, _ = self.e.until("bestmove", 5)
        self.assertIn(chess.Move.from_uci(best.split()[1]), chess.Board().legal_moves)

    def test_android_binary_properties(self):
        p = os.path.join(ROOT, "native", "dist", "chimera-android-arm64")
        if not os.path.exists(p):
            self.skipTest("android binary not built")
        data = open(p, "rb").read(4096)
        self.assertEqual(data[:4], b"\x7fELF")
        self.assertEqual(data[18], 0xB7)               # e_machine EM_AARCH64
        self.assertIn(b"/system/bin/linker64", open(p, "rb").read(1 << 16))


class V12FeatureTests(unittest.TestCase):
    def test_root_hint_never_overrides_refutation(self):
        e = Engine()
        e.send("position fen 5r1k/6pp/p5BN/8/2Q5/8/8/K7 w - - 0 2")
        e.send("setoption name RootHint value h6f7")   # wrong hint; c4g8 mates in 2
        e.send("go depth 7")
        best, _ = e.until("bestmove")
        self.assertEqual(best.split()[1], "c4g8")
        e.send("position startpos")                       # hint applies to exactly one go
        e.send("go depth 5")
        best2, _ = e.until("bestmove")
        self.assertIn(chess.Move.from_uci(best2.split()[1]), chess.Board().legal_moves)
        e.close()

    def test_residual_scale_zero_equals_handcrafted(self):
        nn = os.path.join(ROOT, "nnue", "v12", "eval_v4_residual.bin")
        if not os.path.exists(nn):
            self.skipTest("no v12 net")
        vals = []
        for ev, sc in ((2, 100), (3, 0)):
            e = Engine()
            e.send(f"setoption name EvalFile value {nn}")
            e.send(f"setoption name EvalVersion value {ev}")
            e.send(f"setoption name NNResidualScale value {sc}")
            e.send(f"position fen {PERFT[1][0]}")
            e.send("eval")
            l, _ = e.until("eval ")
            vals.append(int(l.split()[1]))
            e.close()
        self.assertEqual(vals[0], vals[1])
