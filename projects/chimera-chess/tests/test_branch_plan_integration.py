"""Integration test on real python-chess. Not executed in the reference sandbox."""
import unittest
import chess
from chimera.omega import branch_plan as BP
from chimera.omega.config import make

CASES = [
    ("8/8/8/8/8/8/2Q5/4K1k1 w - - 0 1", "c2g6"),
    ("Q7/8/8/8/5K2/8/8/6k1 w - - 0 1", "a8a2"),
    ("2k5/8/8/2K5/8/8/4Q3/8 w - - 0 1", "c5c6"),
]

class TestBranchPlan(unittest.TestCase):
    def test_actual_board_all_defenses(self):
        ops = BP.ChessOps()
        count = 0
        for fen, first in CASES:
            b = chess.Board(fen)
            status, cert = BP.search(b, b.turn, 5, ops, BP.Allowance(100000), fixed=first)
            self.assertEqual(status, "proved")
            self.assertEqual(BP.verify(b, b.turn, 5, cert, ops, BP.Allowance(10000)), "proved")
            p = BP.after_move(b.turn, 5, cert)
            n = ops.child(b, chess.Move.from_uci(first))
            for reply in list(n.legal_moves):
                after = ops.child(n, reply)
                status, move, renewed = BP.resume(after, p, ops, BP.Allowance(1000))
                self.assertEqual(status, "proved")
                self.assertIn(chess.Move.from_uci(move), after.legal_moves)
                count += 1
            self.assertEqual(BP.resume(b, p, ops, BP.Allowance(100))[0], "unrelated")
        self.assertEqual(count, 6)

    def test_default_is_unchanged(self):
        self.assertFalse(make(profile="PDF_FAST").branch_proof)
        self.assertTrue(make(profile="PDF_FAST_BRANCH_PROOF").branch_proof)
        self.assertFalse(make(profile="PDF_FAST_BRANCH_PROOF", use_memory=False).use_memory)

    def test_proof_limit(self):
        b = chess.Board(CASES[0][0])
        self.assertEqual(BP.search(b, b.turn, 5, BP.ChessOps(), BP.Allowance(0))[0], "unknown")

if __name__ == "__main__":
    unittest.main()
