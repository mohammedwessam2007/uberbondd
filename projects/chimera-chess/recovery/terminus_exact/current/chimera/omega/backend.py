"""Backends (#149 dual worker bridge, #166 process supervisor, #167 graceful teardown, #168 strict FEN validation).
NativeBackend = CHIMERA's own C++ search (the tactical core); a second native process is used for auxiliary analyses so the
root process keeps the Architect's plan memory continuous. Verifier = Stockfish 16 (Skeptic) at fixed nodes, Threads 1.
Scores are OUR point of view in centipawns; mate = +-100000 (python-chess mate_score)."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import threading
import time

import chess
import chess.engine

MATE = 100000


class EngineError(RuntimeError):
    pass


class SearchStopped(Exception):
    """The requesting UCI generation has stopped or run out of time."""


@dataclass
class SearchBudget:
    deadline: float | None
    cancelled: threading.Event

    def stopped(self):
        return self.cancelled.is_set() or (
            self.deadline is not None and time.monotonic() >= self.deadline
        )

    def check(self):
        if self.stopped():
            raise SearchStopped


def validate(board: chess.Board):
    """#168: refuse invalid positions before any backend sees them."""
    st = board.status()
    if st != chess.STATUS_VALID:
        raise ValueError(f"invalid position (status {int(st)}): {board.fen()}")


class Proc:
    """#166 supervised UCI process: restarts once on a crash, raises EngineError on repeated failure (never invents scores)."""

    def __init__(self, cmd, options=None, timeout=5.0):
        self.cmd, self.options, self.timeout, self.e = cmd, options or {}, timeout, None
        self.restarts = 0
        self.game = object()

    def eng(self):
        if self.e is None:
            try:
                self.e = chess.engine.SimpleEngine.popen_uci(self.cmd, timeout=self.timeout)
            except (FileNotFoundError, chess.engine.EngineError, chess.engine.EngineTerminatedError, OSError) as ex:
                raise EngineError(f"cannot start {self.cmd}: {ex}")
            if self.options:
                try:
                    self.e.configure(self.options)
                except (chess.engine.EngineError, TimeoutError):
                    self.close(force=True)
                    raise
        return self.e

    def call(self, fn):
        for attempt in (0, 1):
            try:
                return fn(self.eng())
            except (chess.engine.EngineTerminatedError, chess.engine.EngineError, TimeoutError) as ex:
                self.close(force=True)
                self.restarts += 1
                if attempt:
                    raise EngineError(f"{self.cmd} failed twice: {ex}")

    def analyse(self, board, limit, *, budget=None, fresh=False, **kwargs):
        game = object() if fresh else self.game
        async def run(protocol):
            if budget:
                budget.check()
            analysis = await protocol.analysis(board, limit, game=game, **kwargs)

            async def collect():
                exact = {}
                nodes = 0
                async for info in analysis:
                    nodes = max(nodes, info.get("nodes", 0))
                    if ("score" in info and info.get("pv")
                            and not info.get("lowerbound") and not info.get("upperbound")):
                        exact[info.get("multipv", 1)] = info
                await analysis.wait()
                for entry in exact.values():
                    entry["nodes"] = nodes
                return [exact[rank] for rank in sorted(exact)]

            done = asyncio.create_task(collect())
            try:
                if budget is None:
                    final = await done
                else:
                    while not budget.stopped():
                        if (await asyncio.wait((done,), timeout=0.005))[0]:
                            break
                    if budget.stopped():
                        analysis.stop()
                        await asyncio.wait_for(asyncio.shield(done), timeout=0.15)
                        raise SearchStopped
                    final = done.result()
                return final if kwargs.get("multipv") is not None else (final[0] if final else {})
            finally:
                if not done.done():
                    done.cancel()
                    await asyncio.gather(done, return_exceptions=True)

        for attempt in range(2):
            if budget:
                budget.check()
            try:
                engine = self.eng()
                with engine._not_shut_down():
                    if engine.returncode.done():
                        raise chess.engine.EngineTerminatedError("engine already exited")
                    coro = run(engine.protocol)
                    try:
                        future = asyncio.run_coroutine_threadsafe(coro, engine.protocol.loop)
                    except RuntimeError as ex:
                        coro.close()
                        raise chess.engine.EngineTerminatedError("engine loop closed") from ex
                return future.result(timeout=engine.timeout + (limit.time or 0))
            except (chess.engine.EngineError, TimeoutError) as ex:
                self.close(force=True)
                self.restarts += 1
                if budget:
                    budget.check()
                if attempt:
                    raise EngineError(f"{self.cmd} failed twice: {ex}") from ex
        raise AssertionError("unreachable")

    def newgame(self):
        self.game = object()

    def close(self, force=False):  # #167
        if self.e is not None:
            try:
                if force:
                    self.e.close()
                else:
                    self.e.quit()
            except Exception:
                pass
            self.e = None


def _cp(score, pov):
    return float(score.pov(pov).score(mate_score=MATE))


def _scores(info, pov):
    return {entry["pv"][0].uci(): _cp(entry["score"], pov)
            for entry in info if entry.get("pv") and "score" in entry
            and not entry.get("lowerbound") and not entry.get("upperbound")}


class NativeBackend:
    def __init__(self, cfg):
        opts = {"EvalFile": cfg.net_file, "EvalVersion": 3, "NNResidualScale": 50} if cfg.use_neural else {"EvalVersion": 2}
        root_opts = dict(opts)
        if cfg.use_memory:
            root_opts.update({"PlanMemory": True, "PlanBias": True})
        self.root = Proc([cfg.native_path], root_opts)
        self.aux = Proc([cfg.native_path], opts)
        self.nodes_used = 0

    def analyse_root(self, board, nodes, multipv, seconds=None, depth=None, budget=None):
        validate(board)
        limit = chess.engine.Limit(time=seconds, nodes=nodes if seconds is None else None, depth=depth)
        info = self.root.analyse(board, limit, multipv=multipv, budget=budget)
        self.nodes_used = max((it.get("nodes", 0) for it in info), default=0)
        self.root_pv = {entry["pv"][0].uci(): tuple(entry["pv"]) for entry in info if entry.get("pv")}
        self.root_depth = max((it.get("depth", 0) for it in info), default=0)
        return _scores(info, board.turn)

    def eval_moves(self, board, moves, nodes, budget=None):
        return self.eval_moves_pov(board, moves, nodes, board.turn, budget=budget)

    def replies(self, nb, us, nodes, extra=(), k=6, budget=None):
        return self._replies(self.aux, nb, us, nodes, extra, k, budget)

    @staticmethod
    def _replies(proc, nb, us, nodes, extra, k, budget):
        if nb.is_game_over():
            return {}
        top = proc.analyse(nb, chess.engine.Limit(nodes=nodes), multipv=min(k, nb.legal_moves.count()),
                           fresh=True, budget=budget)
        out = _scores(top, us)
        missing = [u for u in extra if u not in out and chess.Move.from_uci(u) in nb.legal_moves]
        if missing:
            out.update(NativeBackend._eval_moves(proc, nb, missing, nodes, us, budget))
        return out

    def eval_moves_pov(self, b, moves, nodes, pov, budget=None):
        return self._eval_moves(self.aux, b, moves, nodes, pov, budget)

    @staticmethod
    def _eval_moves(proc, board, moves, nodes, pov, budget):
        if not moves:
            return {}
        info = proc.analyse(board, chess.engine.Limit(nodes=nodes), multipv=len(moves),
                            root_moves=[chess.Move.from_uci(u) for u in moves], fresh=True, budget=budget)
        return _scores(info, pov)

    def depth_eval(self, b, depth, pov, budget=None):
        return self._depth_eval(self.aux, b, depth, pov, budget)

    @staticmethod
    def _depth_eval(proc, b, depth, pov, budget):
        if b.is_game_over():
            return None
        info = proc.analyse(b, chess.engine.Limit(depth=depth), fresh=True, budget=budget)
        return _cp(info["score"], pov) if "score" in info else None

    def warm(self):
        self.root.eng()

    def newgame(self):
        self.root.newgame(); self.aux.newgame()

    def close(self):
        self.root.close(); self.aux.close()


class StockfishVerifier:
    """Skeptic backend (#11/#111/#151): deterministic fixed-node verification, fresh hash per call."""

    def __init__(self, cfg):
        self.p = Proc([cfg.stockfish_path], {"Threads": 1, "Hash": 32})

    def move_value(self, board, move_uci, nodes, budget=None):
        validate(board)
        info = self.p.analyse(board, chess.engine.Limit(nodes=nodes), root_moves=[chess.Move.from_uci(move_uci)],
                              fresh=True, budget=budget)
        return _scores([info], board.turn).get(move_uci)

    def close(self):
        self.p.close()


class StockfishTactical(NativeBackend):
    """PDF-faithful tactical layer (document A §1/§5, manual §1.1): Stockfish MultiPV=16 at sf_time_sec per move as tactical
    ground truth for every candidate; replies / depth probes also on Stockfish. Stockfish 16 stands in for the unavailable 19
    (C-DEP-SF19). CHIMERA's decision is still made by the motif arbitration layer (mind.py) -- this is the evaluator, not the
    move selector."""

    def __init__(self, cfg):
        self.root = Proc([cfg.stockfish_path], {"Threads": cfg.sf_threads, "Hash": 128})
        self.aux = Proc([cfg.stockfish_path], {"Threads": 1, "Hash": 32})
        self.pool = [
            (Proc([cfg.stockfish_path], {"Threads": 1, "Hash": 16}),
             ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"reply-{i}"))
            for i in range(max(1, cfg.reply_k))
        ]
        self.nodes_used = 0

    def replies_parallel(self, jobs, us, nodes, probes=False, budget=None):
        """Queue each candidate on a persistent serial worker."""
        def one(proc, nb, extra):
            out = self._replies(proc, nb, us, nodes, extra, 6, budget)
            if probes:
                return out, {d: self._depth_eval(proc, nb, d, us, budget) for d in (1, 3, 5)}
            return out

        futures = []
        for i, (nb, extra) in enumerate(jobs):
            proc, executor = self.pool[i % len(self.pool)]
            futures.append(executor.submit(one, proc, nb, extra))
        # Always finish draining the batch before handing ownership back.
        try:
            return [future.result() for future in futures]
        finally:
            for future in futures:
                future.cancel()
            from concurrent.futures import wait
            wait(futures)

    def warm(self):
        super().warm()
        for proc, executor in self.pool:
            executor.submit(proc.eng).result()

    def close(self):
        super().close()
        for proc, executor in self.pool:
            executor.submit(proc.close).result()
            executor.shutdown()
