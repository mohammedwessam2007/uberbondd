"""CHIMERA V7 UCI front end. Run: python -m chimera.uci

Options: Mode (Tactical|Creative), Style (classical|tal|petrosian|chimera),
MoveOverheadMs (safety margin subtracted from every clock-derived budget).
`go` supports movetime, wtime/btime/winc/binc/movestogo, depth-free infinite and stop.
"""
from __future__ import annotations

import sys
import threading
import time

import chess

from .creative import CreativeEngine, STYLES
from .search import score_to_uci

NAME = "CHIMERA V7 tactical-creative core"


class UCI:
    def __init__(self, out=sys.stdout):
        self.out = out
        self.board = chess.Board()
        self.mode = "Tactical"  # Creative stays opt-in until it beats Tactical (see STATUS.md)
        self.style = "chimera"
        self.overhead = 0.05
        self.engine = CreativeEngine(self.style, False)
        self.thread = None
        self.stop = threading.Event()

    def send(self, s: str):
        self.out.write(s + "\n")
        self.out.flush()

    def budget(self, args) -> float:
        def val(k, d=None):
            return int(args[args.index(k) + 1]) if k in args else d
        if "movetime" in args:
            return max(0.01, val("movetime") / 1000 - self.overhead)
        if "infinite" in args:
            return 1e6
        t = val("wtime") if self.board.turn else val("btime")
        inc = (val("winc", 0) if self.board.turn else val("binc", 0)) or 0
        if t is None:
            return 1.0
        mtg = val("movestogo", 30) or 30
        b = t / 1000 / max(mtg, 8) + inc / 1000 * 0.75
        return max(0.01, min(b, t / 1000 * 0.25) - self.overhead)

    def go(self, args):
        budget = self.budget(args)
        self.stop.clear()

        def run():
            mv = self.engine.choose(self.board, budget, stop_flag=self.stop.is_set,
                                    info=self.send)
            if mv is None:
                self.send("bestmove 0000")
            else:
                self.send(f"bestmove {mv.uci()}")
        self.thread = threading.Thread(target=run, daemon=True)
        self.thread.start()

    def handle(self, line: str) -> bool:
        tok = line.strip().split()
        if not tok:
            return True
        cmd = tok[0]
        if cmd == "uci":
            self.send(f"id name {NAME}")
            self.send("id author CHIMERA project")
            self.send("option name Mode type combo default Tactical var Tactical var Creative")
            self.send("option name Style type combo default chimera " + " ".join(f"var {s}" for s in STYLES))
            self.send("option name MoveOverheadMs type spin default 50 min 0 max 2000")
            self.send("uciok")
        elif cmd == "isready":
            if self.thread:
                self.thread.join()
            self.send("readyok")
        elif cmd == "setoption" and "name" in tok:
            name = tok[tok.index("name") + 1]
            value = tok[tok.index("value") + 1] if "value" in tok else ""
            if name == "Mode":
                self.mode = value
            elif name == "Style" and value in STYLES:
                self.style = value
            elif name == "MoveOverheadMs":
                self.overhead = int(value) / 1000
            self.engine = CreativeEngine(self.style, self.mode == "Creative")
        elif cmd == "ucinewgame":
            self.engine.new_game()
            self.board = chess.Board()
        elif cmd == "position":
            if tok[1] == "startpos":
                self.board = chess.Board()
                rest = tok[2:]
            else:
                fen = " ".join(tok[2:8])
                self.board = chess.Board(fen)
                rest = tok[8:]
            if rest and rest[0] == "moves":
                for u in rest[1:]:
                    self.board.push_uci(u)
        elif cmd == "go":
            self.go(tok[1:])
        elif cmd == "stop":
            self.stop.set()
            if self.thread:
                self.thread.join()
        elif cmd == "quit":
            self.stop.set()
            if self.thread:
                self.thread.join()
            return False
        return True


def main():
    u = UCI()
    for line in sys.stdin:
        if not u.handle(line):
            break


if __name__ == "__main__":
    main()
