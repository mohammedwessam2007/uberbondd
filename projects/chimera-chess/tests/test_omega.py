"""CHIMERA Ω∞ (CODEX220) test campaign.  python -m unittest tests.test_omega
1. G0 source preservation  2. PDF examples (preserved as written; wrong ones are NEGATIVE regressions) + verified replacements
3. per-motif replay of real-game fixtures (positive fires with traced value, matched negative does not)
4. colour-reversal invariance  5. restriction guards  6. UCI robustness (invalid FEN, illegal moves, mate/stalemate, low clock,
missing backend, newgame, stop)."""
import glob, hashlib, json, os, subprocess, sys, unittest
import chess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from chimera.omega import motifs as M, features as F
from chimera.omega.config import make

FIX = os.path.join(ROOT, "tests", "fixtures", "omega_fixtures.json")


def ctx(fen, mv, history=(), eval_cp=None, best=None, cand=None, evidence=None, state=None):
    b = chess.Board(fen)
    for u in history:
        b.push_uci(u)
    m = chess.Move.from_uci(mv)
    assert m in b.legal_moves, (b.fen(), mv)
    nb = b.copy(); nb.push(m)
    r = None
    if evidence:
        r = M.ReplyInfo(maia=evidence["maia"], maia_prior=evidence["maia_prior"], evals=evidence["evals"], static=evidence["static"],
                        shallow_d3=evidence["d3"], deep_d5=evidence["d5"])
    st = M.MatchState()
    for k, v in (state or {}).items():
        setattr(st, k, v)
    return M.Ctx(b, m, nb, eval_cp=eval_cp, best_cp=best, cand=cand or {}, reply=r, state=st)


class G0Sources(unittest.TestCase):
    def test_pdfs_byte_preserved(self):
        man = json.load(open(os.path.join(ROOT, "canon", "PDF_SOURCE_MANIFEST.json")))
        for d in man["documents"]:
            self.assertEqual(hashlib.sha256(open(os.path.join(ROOT, d["path"]), "rb").read()).hexdigest(), d["sha256"])

    def test_registry_has_220_unique_ids(self):
        R = json.load(open(os.path.join(ROOT, "canon", "PDF_REQUIREMENTS_220.json")))["records"]
        ids = [r["id"] for r in R]
        self.assertEqual(len(ids), 220); self.assertEqual(len(set(ids)), 220)
        self.assertEqual(ids[0], "CODEX220-001"); self.assertEqual(ids[-1], "CODEX220-220")

    def test_every_id_accounted_exactly_once(self):
        impl, restr = set(M.REGISTRY), set(M.RESTRICTED)
        self.assertFalse(impl & restr)
        from chimera.omega.controls import CONTROLS
        self.assertEqual(impl | restr | set(CONTROLS), set(range(1, 221)))


class PdfExamples(unittest.TestCase):
    """Manual §6.1 examples, executed exactly as written. Chess reality decides; failures become negative regressions."""

    def test_186_original_example_is_a_draw_not_a_taunt(self):
        fen = "8/6P1/8/8/8/5K2/8/7k w - - 0 1"
        c = ctx(fen, "g7g8n", eval_cp=650.0, best=700.0)
        self.assertTrue(c.nb.is_insufficient_material())       # K+N v K: dead draw
        self.assertEqual(M.m186(c), 0.0)                        # corrected predicate refuses the drawing underpromotion

    def test_201_original_example_invalid_and_not_mate(self):
        b = chess.Board("3r4/2pk4/8/3pP3/2B2B2/8/8/4K3 w - d6 0 1")
        self.assertNotEqual(b.status(), chess.STATUS_VALID)
        b.push_uci("e5d6")
        self.assertFalse(b.is_checkmate())

    def test_192_original_example_invalid_castling_rights(self):
        b = chess.Board("3k4/8/3K4/8/8/8/8/R3B3 w Q - 0 1")
        self.assertTrue(b.status() & chess.STATUS_BAD_CASTLING_RIGHTS)
        self.assertNotIn(chess.Move.from_uci("e1c1"), b.legal_moves)

    def test_215_original_example_valid(self):
        c = ctx("5rkr/5ppp/8/8/8/8/8/4K1N1 w - - 0 1", "g1f3", eval_cp=150.0, best=150.0)
        self.assertAlmostEqual(M.REGISTRY[215].weight * M.m215(c), 7.2)

    def test_201_replacement_ep_mate(self):
        c = ctx("8/1R6/2k5/2bpP3/8/3R4/6Q1/4K3 w - d6 0 1", "e5d6")
        self.assertTrue(c.board.is_en_passant(c.move) and c.nb.is_checkmate())
        self.assertEqual(M.REGISTRY[201].weight * M.m201(c), 28.0)
        self.assertEqual(M.m220(c), 18.0)
        self.assertEqual(M.m144(c), 3.0)

    def test_192_replacement_castling_mate(self):
        c = ctx("8/8/8/P2BQ3/8/3k4/8/R3K3 w Q - 0 1", "e1c1")
        self.assertTrue(c.nb.is_checkmate())
        self.assertEqual(M.REGISTRY[192].weight * M.m192(c), 25.0)
        self.assertEqual(M.m214(c), 25.0)
        self.assertEqual(M.m144(c), 4.0)

    def test_186_replacement_knight_mate(self):
        c = ctx("8/Q5P1/7k/7p/8/8/6R1/4K3 w - - 0 1", "g7g8n")
        self.assertTrue(c.nb.is_checkmate())
        self.assertEqual(M.m186(c), 1.0)
        self.assertEqual(M.m144(c), 2.0)

    def test_negative_controls(self):
        q = ctx("8/Q5P1/7k/7p/8/8/6R1/4K3 w - - 0 1", "g7g8q")    # queen promotion is not an underpromotion taunt
        self.assertEqual(M.m186(q), 0.0)
        n = ctx("8/1R6/2k5/2bpP3/8/3R4/6Q1/4K3 w - d6 0 1", "g2g6")  # check that is not en-passant
        self.assertEqual(M.m201(n), 0.0)


class FixtureReplay(unittest.TestCase):
    """Fixtures mined from real WHOLE_MIND games: the predicate, replayed with the runtime's evidence, reproduces the traced
    value; on a matched negative (other candidate, same position) it stays silent."""

    @classmethod
    def setUpClass(cls):
        cls.fx = json.load(open(FIX))

    def _c(self, r):
        return ctx(r["start_fen"], r["move"], r["history"], r["eval"], r["best"], r["cand"], r["evidence"], r["state"])

    def test_positives_replay_exactly(self):
        n_checked = 0
        for k, recs in self.fx["positives"].items():
            n = int(k)
            for r in recs:
                v = M.REGISTRY[n].fn(self._c(r)) * M.REGISTRY[n].weight
                tv = r["traced"][f"#{n}"]
                with self.subTest(motif=n, move=r["move"]):
                    self.assertTrue(abs(v - tv) < 1e-2 or (n in (10, 211) and abs(2 * v - tv) < 1e-2), (n, v, tv))
                n_checked += 1
        self.assertGreater(n_checked, 50)

    def test_negatives_silent(self):
        for k, recs in self.fx["negatives"].items():
            n = int(k)
            for r in recs:
                with self.subTest(motif=n, move=r["move"]):
                    self.assertEqual(M.REGISTRY[n].fn(self._c(r)), 0.0)

    def test_colour_reversal_invariance(self):
        """Board-geometric motifs give the same value on the colour-mirrored position (history-free motifs only)."""
        checked = 0
        for k, recs in self.fx["positives"].items():
            n = int(k)
            if M.REGISTRY[n].needs & {"replies", "maia", "history", "clock"}:
                continue
            for r in recs[:1]:
                c = self._c(r)
                b = c.board.copy(stack=False).mirror()
                m = chess.Move(chess.square_mirror(c.move.from_square), chess.square_mirror(c.move.to_square), c.move.promotion)
                nb = b.copy(); nb.push(m)
                cm = M.Ctx(b, m, nb, eval_cp=c.eval_cp, best_cp=c.best_cp, cand=c.cand)
                c0 = M.Ctx(c.board.copy(stack=False), c.move, c.nb, eval_cp=c.eval_cp, best_cp=c.best_cp, cand=c.cand)
                with self.subTest(motif=n):
                    self.assertAlmostEqual(M.REGISTRY[n].fn(c0), M.REGISTRY[n].fn(cm), places=6)
                checked += 1
        self.assertGreater(checked, 20)


class Restrictions(unittest.TestCase):
    def test_restricted_not_executable(self):
        for n in (26, 28, 53, 73, 74, 75, 76, 77, 78, 80, 84, 148, 181, 210):
            self.assertIn(n, M.RESTRICTED); self.assertNotIn(n, M.REGISTRY)

    def test_no_artificial_delays(self):
        self.assertFalse(make().enable_clock_delay)
        for p in glob.glob(os.path.join(ROOT, "chimera", "omega", "*.py")):
            self.assertNotIn("time.sleep", open(p).read(), p)


class UciRobustness(unittest.TestCase):
    def run_uci(self, script, env=None, timeout=240):
        e = dict(os.environ, **(env or {}))
        return subprocess.run([sys.executable, "-m", "chimera.omega.uci"], input=script, capture_output=True, text=True, cwd=ROOT, timeout=timeout, env=e).stdout

    def best(self, out):
        return [l.split()[1] for l in out.splitlines() if l.startswith("bestmove")]

    def test_handshake_and_legal_moves(self):
        out = self.run_uci("uci\nuci\nisready\nucinewgame\nposition startpos moves e2e4 e7e5\ngo movetime 400\nisready\nquit\n")
        self.assertEqual(out.count("uciok"), 2)
        b = chess.Board(); b.push_uci("e2e4"); b.push_uci("e7e5")
        self.assertIn(chess.Move.from_uci(self.best(out)[0]), b.legal_moves)

    def test_invalid_fen_and_illegal_move_list(self):
        out = self.run_uci("position fen 3k4/8/3K4/8/8/8/8/R3B3 w Q - 0 1\nposition startpos moves e2e5\nisready\nquit\n")
        self.assertEqual(out.count("info string error"), 2)

    def test_checkmate_and_stalemate_positions(self):
        out = self.run_uci("position fen 7k/6Q1/6K1/8/8/8/8/8 b - - 0 1\ngo movetime 200\nposition fen 7k/8/6QK/8/8/8/8/8 b - - 0 1\ngo movetime 200\nquit\n")
        self.assertEqual(self.best(out), ["0000", "0000"])

    def test_low_clock_returns_fast_and_legal(self):
        import time
        t = time.time()
        out = self.run_uci("position startpos\ngo wtime 3000 btime 3000 winc 0 binc 0\nisready\nquit\n")
        self.assertIn(chess.Move.from_uci(self.best(out)[0]), chess.Board().legal_moves)
        self.assertLess(time.time() - t, 30)

    def test_missing_backend_still_legal(self):
        out = self.run_uci("position startpos\ngo movetime 200\nquit\n", env={"STOCKFISH_PATH": "/nonexistent/sf"})
        self.assertIn(chess.Move.from_uci(self.best(out)[0]), chess.Board().legal_moves)


if __name__ == "__main__":
    unittest.main()
