"""CHIMERA Ω∞ UCI front end (WHOLE_MIND).  python -m chimera.omega.uci
#153 clock scaler, #155 setoption exposure, #156 seed reproducibility, #157 <5 s reflex fallback, #162 increment buffer,
#164 five presets, #166/#167 supervised backends + graceful teardown, #168 strict FEN/move validation, #160 trace export.
Never sleeps to imitate humans (restricted #28 #53 #80 #210). On any backend failure it emits a LEGAL move and reports
the failure as 'info string error', never an invented evaluation."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import dataclass, field
import json
import sys
import threading
import time

import chess
import chess.polyglot

from chimera.omega import config as C
from chimera.omega.backend import SearchBudget, SearchStopped
from chimera.omega.mind import immediate_mates


@dataclass
class Request:
    board: chess.Board
    fallback: chess.Move | None
    budget: SearchBudget
    timer: threading.Timer | None = field(default=None)


def clock_budget(left, increment, moves_to_go, overhead):
    """Allocate clock time before search, reserving overhead and remaining time."""
    return min(left / max(moves_to_go, 10) + 0.75 * increment, left * 0.2) - overhead


class UCI:
    def __init__(self, out=sys.stdout):
        self.out = out
        self.opts = {"Preset": "Trauma_GM_2685", "Profile": "WHOLE_MIND", "Deterministic": True, "Seed": 42, "Verifier": "stockfish",
                     "RootNodes": 120000, "ReplyNodes": 20000, "TraceFile": "", "MoveOverheadMs": 50, "StyleExtreme": True, "BookFile": "", "StyleFile": ""}
        self.board = chess.Board()
        self.mind = None
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="uci-search")
        self.lock = threading.RLock()
        self.active = None
        self.mind_opts = None
        self.prev_opp_time = None

    def say(self, s):
        with self.lock:
            self.out.write(s + "\n")
            self.out.flush()

    def build(self, opts):
        if self.mind_opts != opts:
            if self.mind is not None:
                self.mind.close()
                self.mind = None
            from chimera.omega.mind import WholeMind
            cfg = C.make(opts["Preset"], opts["Profile"], deterministic=opts["Deterministic"], seed=opts["Seed"],
                         verifier=opts["Verifier"], root_nodes=opts["RootNodes"], reply_nodes=opts["ReplyNodes"],
                         style_extreme=opts["StyleExtreme"])
            if opts["StyleFile"]:
                with open(opts["StyleFile"]) as source:
                    for key, value in json.load(source).items():
                        if key in ("group_scale", "anti_draw_contempt_cp", "motif_scale"):
                            setattr(cfg, key, value)
            self.mind = WholeMind(cfg)
            self.mind_opts = opts
        return self.mind

    def _newgame(self):
        if self.mind is not None:
            self.mind.newgame()

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
            # During a search UCI requires an immediate reply. Startup is performed
            # by the same executor that owns the engine.
            with self.lock:
                idle = self.active is None
            if idle and self.mind_opts != self.opts:
                def warm():
                    self.build(self.opts.copy()).warm()

                try:
                    self.executor.submit(warm).result()
                except Exception as ex:
                    self.say(f"info string error {ex}")
            self.say("readyok")
        elif c == "setoption":
            try:
                self.set_option(t)
            except ValueError as ex:
                self.say(f"info string error {ex}")
        elif c == "ucinewgame":
            self.stop()
            self.board = chess.Board()
            self.prev_opp_time = None
            self.executor.submit(self._newgame)
        elif c == "position":
            self.stop()
            try:
                self.board = self.parse_position(t)
            except ValueError as ex:
                self.say(f"info string error {ex}")
        elif c == "go":
            try:
                self.go(t)
            except ValueError as ex:
                self.say(f"info string error {ex}")
        elif c == "stop":
            self.stop()
        elif c == "quit":
            return False
        return True

    def set_option(self, tokens):
        if len(tokens) < 3 or tokens[1] != "name":
            raise ValueError("expected setoption name")
        split = tokens.index("value", 2) if "value" in tokens[2:] else len(tokens)
        name = " ".join(tokens[2:split])
        value = " ".join(tokens[split + 1:])
        if not name:
            raise ValueError("missing option name")
        if name not in self.opts:
            return
        cur = self.opts[name]
        choices = {"Profile": C.PROFILES, "Preset": C.ELO_PRESETS, "Verifier": ("stockfish", "none")}
        if name in choices and value not in choices[name]:
            raise ValueError(f"invalid value for {name}")
        if isinstance(cur, bool):
            if value.lower() not in ("true", "false"):
                raise ValueError(f"invalid value for {name}")
            value = value.lower() == "true"
        elif isinstance(cur, int):
            lower, upper = {"Seed": (0, 2147483647), "RootNodes": (5000, 50000000),
                            "ReplyNodes": (1000, 5000000), "MoveOverheadMs": (0, 5000)}[name]
            value = int(value)
            if not lower <= value <= upper:
                raise ValueError(f"value outside range for {name}")
        elif value == "<empty>":
            value = ""
        self.opts[name] = value

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
        if rest:
            if rest[0] != "moves":
                raise ValueError("unexpected position arguments")
            for u in rest[1:]:
                m = chess.Move.from_uci(u)
                if m not in b.legal_moves:
                    raise ValueError(f"illegal move {u}")
                b.push(m)
        return b

    def go(self, t):
        started = time.monotonic()
        a = {}
        for i, token in enumerate(t[1:], start=1):
            if token in ("wtime", "btime", "winc", "binc", "movetime", "nodes", "movestogo", "depth"):
                if i + 1 == len(t):
                    raise ValueError(f"missing go {token} value")
                a[token] = int(t[i + 1])
                if a[token] < 0:
                    raise ValueError(f"negative go {token} value")
        nodes = int(a["nodes"]) if "nodes" in a else None
        depth = int(a["depth"]) if "depth" in a else None
        if any(value is not None and value <= 0 for value in (nodes, depth)):
            raise ValueError("go nodes and depth must be positive")
        self.stop()
        us = self.board.turn
        left = float(a.get("wtime" if us else "btime", -1)) / 1000
        inc = float(a.get("winc" if us else "binc", 0)) / 1000
        opp_left = float(a.get("btime" if us else "wtime", -1)) / 1000
        mtg = int(a.get("movestogo", 30))
        overhead = self.opts["MoveOverheadMs"] / 1000
        if "movetime" in a:
            budget = float(a["movetime"]) / 1000 - overhead
        elif left >= 0:
            budget = clock_budget(left, inc, mtg, overhead)     # #153 + #162
        else:
            budget = None
        scale = 1.0 if budget is None else max(0.05, min(3.0, budget / 1.2))       # 1.2 s ~ default node budgets on this host
        reflex = left >= 0 and left < 5.0                                           # #157
        if reflex and budget is not None:
            budget = min(0.15, budget)
        think = None
        if opp_left >= 0 and self.prev_opp_time is not None and self.prev_opp_time > 0:
            think = max(0.0, (self.prev_opp_time - opp_left) / self.prev_opp_time)
        self.prev_opp_time = opp_left if opp_left >= 0 else None
        board = self.board.copy()
        legal = list(board.legal_moves)
        if not legal:
            self.say("bestmove 0000")
            return
        mates = immediate_mates(board, legal)
        if self.opts["BookFile"] and not mates:                                                   # #163 polyglot book
            try:
                with chess.polyglot.open_reader(self.opts["BookFile"]) as r:
                    e = r.weighted_choice(board, random=__import__("random").Random(int(self.opts["Seed"]) + board.ply()))
                self.say(f"info string book {e.move.uci()}")
                self.say(f"bestmove {e.move.uci()}")
                return
            except (IndexError, OSError):
                pass
        opts = self.opts.copy()
        limit = SearchBudget(None if budget is None else started + max(0, budget), threading.Event())
        job = Request(board, next(iter(mates or legal)), limit)
        with self.lock:
            self.active = job
            if limit.deadline is not None:
                job.timer = threading.Timer(max(0, limit.deadline - time.monotonic()), self.expire, (job,))
                job.timer.daemon = True
                job.timer.start()

        def fallback(move):
            with self.lock:
                if self.active is job:
                    job.fallback = move

        def work():
            mind = None
            snapshot = None
            published = False
            try:
                limit.check()
                mind = self.build(opts)
                snapshot = deepcopy(mind.state), mind.last, mind.rng.getstate()
                move, trace = mind.choose(board, budget_scale=0.08 if reflex else scale,
                                          opp_clock_s=opp_left if opp_left >= 0 else None, opp_think_frac=think,
                                          budget_s=budget, budget=limit, nodes=nodes, depth=depth,
                                          fallback=fallback, mates=mates)
                with self.lock:
                    if self.active is job and not limit.stopped():
                        self.publish(job, move, trace)
                        published = True
                if published and opts["TraceFile"]:
                    with open(opts["TraceFile"], "a") as out:
                        out.write(json.dumps(trace) + "\n")
            except SearchStopped:
                pass
            except Exception as ex:
                with self.lock:
                    if self.active is job:
                        self.say(f"info string error {ex!r}")
                        self.publish(job, None, {})
            finally:
                if snapshot is not None and not published:
                    mind.state, mind.last, rng = snapshot
                    mind.rng.setstate(rng)

        self.executor.submit(work)

    def publish(self, job, move, trace):
        self.active = None
        if job.timer is not None:
            job.timer.cancel()
        if move is None or move not in job.board.legal_moves:
            move = job.fallback
        chosen = trace.get("chosen", {})
        if chosen.get("eval") is not None:
            evaluation = chosen["eval"]
            if abs(evaluation) >= 99000:
                score = f"mate {int(100000 - abs(evaluation)) * (1 if evaluation > 0 else -1)}"
            else:
                score = f"cp {int(evaluation)}"
            root = trace.get("root_search", {})
            self.say(f"info depth {root.get('depth', 0)} nodes {root.get('nodes', 0)} score {score} pv {move.uci()}")
        if chosen.get("bd"):
            self.say("info string motifs " + " ".join(f"{k}={v}" for k, v in sorted(chosen["bd"].items())))
        self.say(f"bestmove {move.uci() if move else '0000'}")

    def expire(self, job):
        with self.lock:
            if self.active is job:
                self.say("info string deadline fallback")
                self.stop()

    def stop(self):
        with self.lock:
            job = self.active
            if job is not None:
                job.budget.cancelled.set()
                self.publish(job, None, {})

    def close(self):
        self.stop()
        self.executor.shutdown(cancel_futures=True)
        if self.mind is not None:
            self.mind.close()


def main():
    u = UCI()
    try:
        for line in sys.stdin:
            if not u.cmd(line.strip()):
                break
    finally:
        u.close()


if __name__ == "__main__":
    main()
