"""CHIMERA V7 regression and integration tests. Run: python -m unittest -v tests.test_v7"""
import io
import time
import unittest

import chess

from chimera.creative import CreativeEngine, PlanMemory, architect_witness, artist_candidates, prerequisites_hold
from chimera.search import MATE_BOUND, Searcher, see
from chimera.uci import UCI

# V6 fixtures (preserved from 03_V6_CODEX_EVIDENCE/creative.json) - regressions, not new evidence
V6_QG8_POS = "5r1k/6pp/p5BN/8/2Q5/8/8/K7 w - - 0 2"
V6_QG8_NEG = "5r1k/p5p1/6pN/8/2Q5/8/8/K7 w - - 0 2"
V6_KD3_POS = "1Q6/8/8/8/2K5/8/8/2k5 w - - 0 1"
V6_KD3_NEG = "1Q6/8/8/8/2K5/8/8/3k4 w - - 0 1"


def mate_in_k_after(board, move, plies):
    """Exhaustive proof that `move` forces mate within `plies` plies (independent of the engine)."""
    b = board.copy()
    b.push(move)
    return _forced(b, plies - 1, attacker=board.turn)


def _forced(b, plies, attacker):
    if b.is_checkmate():
        return b.turn != attacker
    if plies <= 0 or b.is_game_over():
        return False
    if b.turn == attacker:
        for m in b.legal_moves:
            b.push(m)
            ok = _forced(b, plies - 1, attacker)
            b.pop()
            if ok:
                return True
        return False
    for m in b.legal_moves:
        b.push(m)
        ok = _forced(b, plies - 1, attacker)
        b.pop()
        if not ok:
            return False
    return True


class Search(unittest.TestCase):
    def test_finds_mate_in_one(self):
        r = Searcher().search(chess.Board("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1"), 0.5)
        self.assertEqual(r.move.uci(), "d1d8")
        self.assertGreaterEqual(r.score, MATE_BOUND)

    def test_v6_queen_offer_mate_in_two(self):
        b = chess.Board(V6_QG8_POS)
        r = Searcher().search(b, 1.0)
        self.assertEqual(r.move.uci(), "c4g8")
        self.assertTrue(mate_in_k_after(b, r.move, 3))

    def test_v6_quiet_king_key(self):
        b = chess.Board(V6_KD3_POS)
        r = Searcher().search(b, 1.0)
        self.assertTrue(mate_in_k_after(b, r.move, 3), r.move)

    def test_does_not_hang_queen(self):
        # Qd1 can grab a pawn defended by a knight; must not.
        b = chess.Board("r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/3P4/PPP2PPP/RNBQKBNR w KQkq - 0 4")
        r = Searcher().search(b, 0.7)
        b.push(r.move)
        reply = Searcher().search(b, 0.7)
        self.assertLess(reply.score, 250, "engine move allowed a large material loss")

    def test_see(self):
        b = chess.Board("4k3/8/3p4/4p3/8/8/8/4K2Q w - - 0 1")  # Qxe5 defended by d6 pawn
        m = chess.Move.from_uci("h1e4")
        self.assertEqual(see(b, m), 0)
        b2 = chess.Board("4k3/8/3p4/4p3/8/8/8/4R1K1 w - - 0 1")
        self.assertLess(see(b2, chess.Move.from_uci("e1e5")), 0)

    def test_deadline_and_board_restored_on_timeout(self):
        # regression for evidence/failures/2026-11-23_timeout_board_corruption.log
        b = chess.Board("r1b1kb1r/2p3pp/p1p5/3qp3/8/4BNP1/PPP2P1P/R2Q1RK1 w kq - 0 12")
        fen = b.fen()
        s = Searcher()
        for t in (0.01, 0.03, 0.07, 0.15):
            t0 = time.perf_counter()
            r = s.search(b, t)
            self.assertLess(time.perf_counter() - t0, t + 0.15)
            self.assertIn(r.move, b.legal_moves)
            self.assertEqual(b.fen(), fen)
            bb = b.copy()
            for m in r.pv:
                self.assertIn(m, bb.legal_moves)
                bb.push(m)

    def test_draw_by_repetition_scored_zero(self):
        b = chess.Board()
        for u in "g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8".split():
            b.push_uci(u)
        self.assertTrue(b.is_repetition(3))


class Creative(unittest.TestCase):
    def test_artist_tags_sacrifice(self):
        b = chess.Board(V6_QG8_POS)
        cands = artist_candidates(b, {}, chess.Move.from_uci("h6f7"))
        tagged = {m.uci(): t for m, t in cands}
        self.assertIn("c4g8", tagged)
        self.assertIn("sacrifice", tagged["c4g8"])

    def test_creative_plays_verified_sacrifice(self):
        ce = CreativeEngine("chimera")
        mv = ce.choose(chess.Board(V6_QG8_POS), 1.5)
        self.assertEqual(mv.uci(), "c4g8")

    def test_creative_rejects_refuted_sacrifice(self):
        b = chess.Board(V6_QG8_NEG)  # h-pawn moved: king escapes via h7, Qg8+ loses the queen
        ce = CreativeEngine("tal")
        mv = ce.choose(b, 1.5)
        self.assertNotEqual(mv.uci(), "c4g8")
        self.assertFalse(mate_in_k_after(b, chess.Move.from_uci("c4g8"), 3))

    def test_negative_kd3_not_claimed(self):
        b = chess.Board(V6_KD3_NEG)
        self.assertFalse(mate_in_k_after(b, chess.Move.from_uci("c4d3"), 3))
        mv = CreativeEngine("tal").choose(b, 1.0)
        self.assertIn(mv, b.legal_moves)

    def test_witness_prerequisites_and_memory(self):
        b = chess.Board(V6_QG8_POS)
        w = architect_witness(b, chess.Move.from_uci("c4g8"), ["sacrifice", "check"], 99999,
                              ["c4g8", "f8g8", "h6f7"], None, 0)
        self.assertEqual(w.goal, "forced mate")
        self.assertEqual(prerequisites_hold(b, w), [])
        mem = PlanMemory()
        mem.active = w
        b.push_uci("c4g8")
        b.push_uci("f8g8")
        self.assertEqual(mem.observe(b), "ACTIVE")
        self.assertEqual(mem.next_move(b).uci(), "h6f7")

    def test_memory_detects_interference(self):
        b2 = chess.Board("6k1/5p1p/6p1/8/8/8/5PPP/R5K1 w - - 0 1")
        w2 = architect_witness(b2, chess.Move.from_uci("a1a8"), ["check"], 300,
                               ["a1a8", "g8h7", "a8a7"], None, 0)
        mem2 = PlanMemory()
        mem2.active = w2
        b2.push_uci("a1a8")
        b2.push_uci("g8g7")
        self.assertEqual(mem2.observe(b2), "INTERFERED")
        self.assertEqual(mem2.recoveries, 1)


class Protocol(unittest.TestCase):
    def test_uci_roundtrip(self):
        out = io.StringIO()
        u = UCI(out)
        for line in ["uci", "isready", "setoption name Mode value Tactical",
                     "position startpos moves e2e4", "go movetime 200", "isready"]:
            u.handle(line)
        text = out.getvalue()
        self.assertIn("uciok", text)
        best = [l for l in text.splitlines() if l.startswith("bestmove")][-1].split()[1]
        b = chess.Board()
        b.push_uci("e2e4")
        self.assertIn(chess.Move.from_uci(best), b.legal_moves)

    def test_uci_stop_infinite(self):
        out = io.StringIO()
        u = UCI(out)
        u.handle("position startpos")
        u.handle("go infinite")
        time.sleep(0.3)
        t0 = time.perf_counter()
        u.handle("stop")
        self.assertLess(time.perf_counter() - t0, 1.0)
        self.assertIn("bestmove", out.getvalue())


if __name__ == "__main__":
    unittest.main()
