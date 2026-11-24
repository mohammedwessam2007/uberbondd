"""Measurement-firewall invariance tests for lab/oracle.py (V13)."""
import os
import sqlite3
import tempfile
import unittest

import chess

from lab.oracle import Oracle

FENS = ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
        "r2q1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP2BPPP/R2Q1RK1 w - - 0 10"]


class OracleInvariance(unittest.TestCase):
    def test_fresh_engines_agree_without_cache(self):
        # two independent oracles on two empty caches must produce identical scores (determinism, not caching)
        res = []
        for _ in range(2):
            d = tempfile.mkdtemp()
            o = Oracle(os.path.join(d, "c.sqlite"))
            res.append([o.score(f, None, 100000) for f in FENS] + [o.score(FENS[0], "e2a6", 100000)])
            o.close()
        self.assertEqual(res[0], res[1])

    def test_same_move_same_loss_regardless_of_order(self):
        d = tempfile.mkdtemp()
        o = Oracle(os.path.join(d, "c.sqlite"))
        a = o.loss(FENS[1], "c3d5", 100000)
        o.loss(FENS[0], "e2a6", 100000)   # unrelated analysis in between must not change the result
        o2 = Oracle(os.path.join(tempfile.mkdtemp(), "c.sqlite"))
        o2.loss(FENS[0], "d5e6", 100000)
        b = o2.loss(FENS[1], "c3d5", 100000)
        self.assertEqual(a, b)
        o.close(); o2.close()

    def test_cache_hit(self):
        d = tempfile.mkdtemp()
        o = Oracle(os.path.join(d, "c.sqlite"))
        o.score(FENS[0], None, 50000)
        h = o.hits
        o.score(FENS[0], None, 50000)
        self.assertEqual(o.hits, h + 1)
        o.close()


if __name__ == "__main__":
    unittest.main()
