"""CHIMERA Ω∞ UCI front end (WHOLE_MIND).  python -m chimera.omega.uci
#153 clock scaler, #155 setoption exposure, #156 seed reproducibility, #157 <5 s reflex fallback, #162 increment buffer,
#164 five presets, #166/#167 supervised backends + graceful teardown, #168 strict FEN/move validation, #160 trace export.
Never sleeps to imitate humans (restricted #28 #53 #80 #210). On any backend failure it emits a LEGAL move and reports
the failure as 'info string error', never an invented evaluation."""
import sys
import threading
import time

import chess

from chimera.omega import config as C


class UCI:
    def __init__(self, out=sys.stdout):
        self.out = out
        self.opts = {"Preset": "Trauma_GM_2685", "Profile": "WHOLE_MIND", "Deterministic": True, "Seed": 42, "Verifier": "stockfish",
                     "RootNodes": 120000, "ReplyNodes": 20000, "TraceFile": "", "MoveOverheadMs": 50, "StyleExtreme": True, "BookFile": "", "StyleFile": ""}
        self.board = chess.Board()
        self.mind = None
        self.worker = None
        self.result = None
        self.stop_ev = threading.Event()
        self.prev_opp_time = None

    def say(self, s):
        self.out.write(s + "\n"); self.out.flush()

    def build(self):
        if self.mind is None:
            from chimera.omega.mind import WholeMind
            cfg = C.make(self.opts["Preset"], self.opts["Profile"], deterministic=self.opts["Deterministic"], seed=int(self.opts["Seed"]),
                         verifier=self.opts["Verifier"], root_nodes=int(self.opts["RootNodes"]), reply_nodes=int(self.opts["ReplyNodes"]),
                         style_extreme=self.opts["StyleExtreme"])
            if self.opts["StyleFile"]:   # calibration overrides (group_scale, contempt, motif_scale) -- never the soundness gate
                import json
                for k, v in json.load(open(self.opts["StyleFile"])).items():
                    if k in ("group_scale", "anti_draw_contempt_cp", "motif_scale"):
                        setattr(cfg, k, v)
            self.mind = WholeMind(cfg, trace_path=self.opts["TraceFile"] or None)
        return self.mind

    def cmd(self, line):
        t = line.split()
        if not t:
            return True
        c = t[0]
        if c == "uci":
            self.say("id name CHIMERA Omega WHOLE_MIND")
            self.say("id author CHIMERA project")
            self.say("option name Preset type combo default Trauma_GM_2685 " + " ".join("var " + k for k in C.ELO_PRESETS))
            self.say("option name Profile type combo default WHOLE_MIND " + " ".join("var " + k for k in C.PROFILES))
            self.say("option name Deterministic type check default true")
            self.say("option name StyleExtreme type check default true")
            self.say("option name Seed type spin default 42 min 0 max 2147483647")
            self.say("option name Verifier type combo default stockfish var stockfish var none")
            self.say("option name RootNodes type spin default 120000 min 5000 max 50000000")
            self.say("option name ReplyNodes type spin default 20000 min 1000 max 5000000")
            self.say("option name MoveOverheadMs type spin default 50 min 0 max 5000")
            self.say("option name TraceFile type string default <empty>")
            self.say("option name BookFile type string default <empty>")
            self.say("option name StyleFile type string default <empty>")
            self.say("uciok")
        elif c == "isready":
            self.join()
            self.say("readyok")
        elif c == "setoption":
            name = " ".join(t[t.index("name") + 1:t.index("value")]) if "value" in t else " ".join(t[2:])
            val = " ".join(t[t.index("value") + 1:]) if "value" in t else ""
            if name in self.opts:
                cur = self.opts[name]
                self.opts[name] = (val.lower() == "true") if isinstance(cur, bool) else (int(val) if isinstance(cur, int) else ("" if val == "<empty>" else val))
                if self.mind:
                    self.mind.close(); self.mind = None
        elif c == "ucinewgame":
            self.join()
            self.board = chess.Board()
            if self.mind:
                self.mind.newgame()
        elif c == "position":
            self.join()
            try:
                self.board = self.parse_position(t)
            except ValueError as ex:
                self.say(f"info string error {ex}")
        elif c == "go":
            self.go(t)
        elif c == "stop":
            self.stop_ev.set(); self.join()
        elif c == "quit":
            self.stop_ev.set(); self.join()
            if self.mind:
                self.mind.close()
            return False
        return True

    @staticmethod
    def parse_position(t):
        if len(t) < 2:
            raise ValueError("empty position command")
        if t[1] == "startpos":
            b, rest = chess.Board(), t[2:]
        elif t[1] == "fen":
            end = t.index("moves") if "moves" in t else len(t)
            b = chess.Board(" ".join(t[2:end]))
            if b.status() != chess.STATUS_VALID:
                raise ValueError("invalid FEN")
            rest = t[end:]
        else:
            raise ValueError("bad position command")
        if rest and rest[0] == "moves":
            for u in rest[1:]:
                m = chess.Move.from_uci(u)
                if m not in b.legal_moves:
                    raise ValueError(f"illegal move {u}")
                b.push(m)
        return b

    def go(self, t):
        self.join()
        a = {t[i]: t[i + 1] for i in range(1, len(t) - 1) if t[i] in ("wtime", "btime", "winc", "binc", "movetime", "nodes", "movestogo", "depth")}
        us = self.board.turn
        left = float(a.get("wtime" if us else "btime", -1)) / 1000
        inc = float(a.get("winc" if us else "binc", 0)) / 1000
        opp_left = float(a.get("btime" if us else "wtime", -1)) / 1000
        mtg = int(a.get("movestogo", 30))
        overhead = self.opts["MoveOverheadMs"] / 1000
        if "movetime" in a:
            budget = float(a["movetime"]) / 1000 - overhead
        elif left >= 0:
            budget = min(left / max(mtg, 10) + 0.75 * inc, left * 0.2) - overhead     # #153 + #162
        else:
            budget = None
        scale = 1.0 if budget is None else max(0.05, min(3.0, budget / 1.2))       # 1.2 s ~ default node budgets on this host
        reflex = left >= 0 and left < 5.0                                           # #157
        think = None
        if opp_left >= 0 and self.prev_opp_time is not None and self.prev_opp_time > 0:
            think = max(0.0, (self.prev_opp_time - opp_left) / self.prev_opp_time)
        self.prev_opp_time = opp_left if opp_left >= 0 else None
        board = self.board.copy()
        if self.opts["BookFile"]:                                                   # #163 polyglot book
            import chess.polyglot
            try:
                with chess.polyglot.open_reader(self.opts["BookFile"]) as r:
                    e = r.weighted_choice(board, random=__import__("random").Random(int(self.opts["Seed"]) + board.ply()))
                self.say(f"info string book {e.move.uci()}")
                self.say(f"bestmove {e.move.uci()}")
                return
            except (IndexError, OSError):
                pass
        self.stop_ev.clear()
        self.result = None
        mind = self.build()
        mind.partial = None

        def work():
            try:
                self.result = mind.choose(board, budget_scale=0.08 if reflex else scale, opp_clock_s=opp_left if opp_left >= 0 else None, opp_think_frac=think,
                                          budget_s=(0.15 if reflex else budget) if budget else None)
            except Exception as ex:
                self.result = (None, {"error": repr(ex)})

        self.worker = threading.Thread(target=work, daemon=True)
        self.worker.start()
        deadline = None if budget is None and "nodes" not in a else (time.time() + max(0.05, budget * 2.5) if budget is not None else None)
        while self.worker.is_alive():
            self.worker.join(0.01)
            if self.stop_ev.is_set() or (deadline and time.time() > deadline):
                break
        mv, tr = self.result if self.result else (None, {"error": "deadline"})
        if mv is None or mv not in board.legal_moves:
            if tr.get("error"):
                self.say(f"info string error {tr['error']}")
            p = getattr(mind, "partial", None)
            mv = chess.Move.from_uci(p) if p and chess.Move.from_uci(p) in board.legal_moves else next(iter(board.legal_moves), None)
        if mv is None:
            self.say("bestmove 0000")
            return
        ch = tr.get("chosen", {}) if isinstance(tr, dict) else {}
        if ch.get("eval") is not None:
            ev = ch["eval"]
            sc = f"mate {int((100000 - ev + 1) // 2) or 1}" if ev >= 99000 else (f"mate -{int((100000 + ev + 1) // 2) or 1}" if ev <= -99000 else f"cp {int(ev)}")
            self.say(f"info depth 1 score {sc} pv {mv.uci()}")
        if ch.get("bd"):
            self.say("info string motifs " + " ".join(f"{k}={v}" for k, v in sorted(ch["bd"].items())))
        self.say(f"bestmove {mv.uci()}")

    def join(self):
        if self.worker is not None and self.worker.is_alive():
            self.worker.join()
        self.worker = None


def main():
    u = UCI()
    for line in sys.stdin:
        if not u.cmd(line.strip()):
            break


if __name__ == "__main__":
    main()
