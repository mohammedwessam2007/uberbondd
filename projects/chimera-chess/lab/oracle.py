"""Deterministic, persistent oracle (measurement firewall, V13).
Stockfish 16, Threads 1, Hash 32, 'ucinewgame' (fresh hash) before EVERY analysis, fixed node budget, no game history.
Results are cached in SQLite keyed by (oracle_id, fen, move, nodes); identical requests return identical scores, and
two systems that choose the same move in the same state always receive the same loss.
Usage: from lab.oracle import Oracle; o = Oracle(); o.score(fen, move_uci=None, nodes=300000); o.loss(fen, move)"""
import hashlib
import os
import sqlite3
import subprocess

import chess
import chess.engine

SF = "/usr/games/stockfish"
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle_cache.sqlite")


def _sf_id():
    out = subprocess.run([SF], input="uci\nquit\n", capture_output=True, text=True).stdout
    name = next((l for l in out.splitlines() if l.startswith("id name")), "unknown")
    return name + "|" + hashlib.sha256(open(SF, "rb").read()).hexdigest()[:16] + "|T1H32fresh"


class Oracle:
    def __init__(self, db=DB):
        self.id = _sf_id()
        self.db = sqlite3.connect(db, timeout=60)
        self.db.execute("create table if not exists s (oid text, fen text, mv text, nodes int, score int, best text, primary key(oid,fen,mv,nodes))")
        self.db.commit()
        self.eng = None
        self.hits = self.misses = 0

    def _engine(self):
        if self.eng is None:
            self.eng = chess.engine.SimpleEngine.popen_uci(SF)
            self.eng.configure({"Threads": 1, "Hash": 32})
        return self.eng

    def _query(self, fen, mv, nodes):
        r = self.db.execute("select score,best from s where oid=? and fen=? and mv=? and nodes=?", (self.id, fen, mv or "", nodes)).fetchone()
        if r:
            self.hits += 1
            return r[0], r[1]
        self.misses += 1
        e = self._engine()
        e.protocol.send_line("ucinewgame")
        b = chess.Board(fen)
        info = e.analyse(b, chess.engine.Limit(nodes=nodes), root_moves=[chess.Move.from_uci(mv)] if mv else None, game=object())
        sc = info["score"].relative.score(mate_score=100000)
        best = info["pv"][0].uci() if info.get("pv") else (mv or "")
        self.db.execute("insert or replace into s values (?,?,?,?,?,?)", (self.id, fen, mv or "", nodes, sc, best))
        self.db.commit()
        return sc, best

    def score(self, fen, mv=None, nodes=300000):
        """Side-to-move score (cp, mate=+-100000-ply) of the position, or of playing mv."""
        return self._query(fen, mv, nodes)[0]

    def best(self, fen, nodes=300000):
        return self._query(fen, None, nodes)[1]

    def loss(self, fen, mv, nodes=300000, cap=1000):
        b = self.score(fen, None, nodes)
        v = self.score(fen, mv, nodes)
        if b >= 90000 and v >= 90000:
            return 0
        return max(0, min(cap, b - v))

    def close(self):
        if self.eng:
            self.eng.quit()
        self.db.close()
