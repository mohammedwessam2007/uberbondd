"""Backends (#149 dual worker bridge, #166 process supervisor, #167 graceful teardown, #168 strict FEN validation).
NativeBackend = CHIMERA's own C++ search (the tactical core); a second native process is used for auxiliary analyses so the
root process keeps the Architect's plan memory continuous. Verifier = Stockfish 16 (Skeptic) at fixed nodes, Threads 1.
Scores are OUR point of view in centipawns; mate = +-100000 (python-chess mate_score)."""
import chess
import chess.engine

MATE = 100000


class EngineError(RuntimeError):
    pass


def validate(board: chess.Board):
    """#168: refuse invalid positions before any backend sees them."""
    st = board.status()
    if st != chess.STATUS_VALID:
        raise ValueError(f"invalid position (status {int(st)}): {board.fen()}")


class Proc:
    """#166 supervised UCI process: restarts once on a crash, raises EngineError on repeated failure (never invents scores)."""

    def __init__(self, cmd, options=None, timeout=30.0):
        self.cmd, self.options, self.timeout, self.e = cmd, options or {}, timeout, None
        self.restarts = 0

    def eng(self):
        if self.e is None:
            try:
                self.e = chess.engine.SimpleEngine.popen_uci(self.cmd, timeout=self.timeout)
            except (FileNotFoundError, chess.engine.EngineError, chess.engine.EngineTerminatedError, OSError) as ex:
                raise EngineError(f"cannot start {self.cmd}: {ex}")
            if self.options:
                self.e.configure(self.options)
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

    def newgame(self):
        if self.e is not None:
            self.e.protocol.send_line("ucinewgame")

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


class NativeBackend:
    def __init__(self, cfg):
        opts = {"EvalFile": cfg.net_file, "EvalVersion": 3, "NNResidualScale": 50} if cfg.use_neural else {"EvalVersion": 2}
        root_opts = dict(opts)
        if cfg.use_memory:
            root_opts.update({"PlanMemory": True, "PlanBias": True})
        self.root = Proc([cfg.native_path], root_opts)
        self.aux = Proc([cfg.native_path], opts)
        self.nodes_used = 0

    def analyse_root(self, board, nodes, multipv, seconds=None):
        """#150 candidate pruning: native MultiPV over the root (game history included so plan memory stays continuous).
        With `seconds` the root search is time-limited (V2 budget fix: the native search owns most of the clock)."""
        validate(board)
        lim = chess.engine.Limit(time=seconds) if seconds else chess.engine.Limit(nodes=nodes)
        info = self.root.call(lambda e: e.analyse(board, lim, multipv=multipv))
        out = {}
        for it in info:
            if it.get("pv"):
                out[it["pv"][0].uci()] = _cp(it["score"], board.turn)
            self.nodes_used += it.get("nodes", 0) or 0
        return out

    def eval_moves(self, board, moves, nodes):
        if not moves:
            return {}
        b = board.copy()
        info = self.aux.call(lambda e: e.analyse(b, chess.engine.Limit(nodes=nodes), multipv=len(moves), root_moves=[chess.Move.from_uci(u) for u in moves], game=object()))
        return {it["pv"][0].uci(): _cp(it["score"], board.turn) for it in info if it.get("pv")}

    def replies(self, nb, us, nodes, extra=(), k=6):
        """Opponent replies on the next board, scored from OUR POV: engine top-k plus any extra (e.g. Maia's) replies."""
        if nb.is_game_over():
            return {}
        top = self.aux.call(lambda e: e.analyse(nb, chess.engine.Limit(nodes=nodes), multipv=min(k, nb.legal_moves.count()), game=object()))
        out = {it["pv"][0].uci(): _cp(it["score"], us) for it in top if it.get("pv")}
        missing = [u for u in extra if u not in out and chess.Move.from_uci(u) in nb.legal_moves]
        if missing:
            out.update(self.eval_moves_pov(nb, missing, nodes, us))
        return out

    def eval_moves_pov(self, b, moves, nodes, pov):
        info = self.aux.call(lambda e: e.analyse(b, chess.engine.Limit(nodes=nodes), multipv=len(moves), root_moves=[chess.Move.from_uci(u) for u in moves], game=object()))
        return {it["pv"][0].uci(): _cp(it["score"], pov) for it in info if it.get("pv")}

    def depth_eval(self, b, depth, pov):
        if b.is_game_over():
            return None
        info = self.aux.call(lambda e: e.analyse(b, chess.engine.Limit(depth=depth), game=object()))
        return _cp(info["score"], pov)

    def newgame(self):
        self.root.newgame(); self.aux.newgame()

    def close(self):
        self.root.close(); self.aux.close()


class StockfishVerifier:
    """Skeptic backend (#11/#111/#151): deterministic fixed-node verification, fresh hash per call."""

    def __init__(self, cfg):
        self.p = Proc([cfg.stockfish_path], {"Threads": 1, "Hash": 32})

    def move_value(self, board, move_uci, nodes):
        validate(board)

        def f(e):
            e.protocol.send_line("ucinewgame")
            return e.analyse(board, chess.engine.Limit(nodes=nodes), root_moves=[chess.Move.from_uci(move_uci)], game=object())
        return _cp(self.p.call(f)["score"], board.turn)

    def close(self):
        self.p.close()
