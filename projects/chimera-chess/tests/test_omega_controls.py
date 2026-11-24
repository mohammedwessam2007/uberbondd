"""Tests for CODEX220 control/infrastructure mechanisms (#25 #30 #43 #151 #152 #156 #160 #163 #164 #166 #179)."""
import os, struct, subprocess, sys, tempfile, unittest
import chess, chess.polyglot
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from chimera.omega import config as C
from chimera.omega.mind import WholeMind
from chimera.omega.backend import Proc, EngineError


class Controls(unittest.TestCase):
    def test_presets(self):  # #164 #179 #43: verbatim PDF values
        self.assertEqual(C.ELO_PRESETS["Trauma_GM_2685"], {"target_ipr": 2685, "maia_elo": 2600, "softmax_temp": 0.28, "soundness_floor_cp": -45.0, "max_cp_drop": 135.0})
        c = C.make("Club_1350")
        self.assertEqual((c.maia_elo, c.softmax_temp, c.soundness_floor_cp, c.max_cp_drop), (1300, 0.72, -160.0, 240.0))

    def test_softmax_sampling(self):  # #25 #152 #156
        cfg = C.make(deterministic=False, seed=7)
        m = WholeMind.__new__(WholeMind); m.cfg = cfg
        import random
        scored = [{"util": 1.0, "move": "a"}, {"util": 0.9, "move": "b"}, {"util": -3.0, "move": "c"}]
        b = chess.Board()
        m.rng = random.Random(7); a = [m._select(scored, b)["move"] for _ in range(300)]
        m.rng = random.Random(7); a2 = [m._select(scored, b)["move"] for _ in range(300)]
        self.assertEqual(a, a2)                                   # seeded reproducibility
        self.assertTrue({"a", "b"} <= set(a))                     # genuine sampling
        self.assertLess(a.count("c"), 5)                          # bad moves almost never sampled
        cfg.deterministic = True
        self.assertEqual(m._select(scored, b)["move"], "a")

    def test_gate(self):  # #151 on a real position: every chosen move respects the soundness gate
        cfg = C.make(root_nodes=20000, reply_nodes=4000, verifier="none")
        m = WholeMind(cfg)
        try:
            b = chess.Board("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4")
            mv, tr = m.choose(b)
            best = max(tr["root"].values())
            self.assertGreaterEqual(tr["chosen"]["eval"], max(cfg.soundness_floor_cp, best - cfg.max_cp_drop))
            self.assertIn(mv, b.legal_moves)
            mate = chess.Board("6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1")   # Ra8# available: mate obligation
            mv, tr = m.choose(mate)
            self.assertEqual(mv.uci(), "a1a8")
        finally:
            m.close()

    def test_no_tablebases(self):  # #30 #158
        src = open(os.path.join(ROOT, "chimera", "omega", "backend.py")).read() + open(os.path.join(ROOT, "chimera", "omega", "config.py")).read()
        self.assertNotIn("SyzygyPath", src)

    def test_supervisor(self):  # #166
        p = Proc(["/nonexistent/engine"])
        with self.assertRaises(EngineError):
            p.call(lambda e: e.ping())

    def test_polyglot_book(self):  # #163 with a real polyglot file written byte-exactly
        b = chess.Board()
        key = chess.polyglot.zobrist_hash(b)
        mv = chess.Move.from_uci("g1f3")
        raw = (mv.to_square) | (mv.from_square << 6)
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
            f.write(struct.pack(">QHHI", key, raw, 10, 0))
        out = subprocess.run([sys.executable, "-m", "chimera.omega.uci"], input=f"setoption name BookFile value {f.name}\nposition startpos\ngo movetime 200\nquit\n",
                             capture_output=True, text=True, cwd=ROOT, timeout=60).stdout
        self.assertIn("bestmove g1f3", out)

    def test_annotate(self):  # #160
        self.assertTrue(os.path.isfile(os.path.join(ROOT, "tools", "omega", "annotate_pgn.py")))


if __name__ == "__main__":
    unittest.main()
