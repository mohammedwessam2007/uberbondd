"""CHIMERA Ω∞ WHOLE_MIND runtime: one decision process integrating every executable CODEX220 mechanism.

Per move (each step names the CODEX220 / CORE167 mechanisms it realises):
 1 LEGALITY      exact python-chess state from the full UCI history (#154 #168); forced single move returned at once.
 2 ROOT SEARCH   native CHIMERA MultiPV (#149 #150) with the residual NNUE (neural) and the Architect's plan memory +
                 PlanBias causal channel (CORE167 #108 memory) in a dedicated process.
 3 ARTIST        creative candidates: Maia3 top-3 human moves + top motif-constructive moves, re-searched (CORE167 #002).
 4 GATE          #151 soundness gatekeeper: eval >= max(floor, best - max_cp_drop); #81 whiplash limiter; forced
                 obligation: when a mate is available only mating moves pass (#82/#144 rank among them).
 5 ROUTING       #180 high-leverage detector + #29 critical-branch extension decide which candidates get the expensive
                 evidence (opponent-reply search, Maia reply distributions, depth-3/5 probes): genuine compute allocation.
 6 MOTIFS        all executable motifs scored with the evidence actually available (needs-gating; no invented values).
 7 ARBITRATION   utility = eval/100 + motif_scale * capped motif sum, with explicit conflict rules; every winner/loser
                 and rejection reason is traced.
 8 SKEPTIC       chosen sacrifices (#11 #111 #112, CORE167 Skeptic) are re-verified by Stockfish at fixed nodes; a refuted
                 choice is vetoed and the next candidate is arbitrated.
 9 SELECTION     argmax (deterministic) or #25 Boltzmann softmax with preset temperature; #79 opening variety.
10 STATE         MatchState update (#220 checks, #217 streak, #147 declined sacrifices, opponent eval drops #50).
"""
import json
import math
import random
import time
from typing import Dict, List, Optional

import chess

from chimera.omega import motifs as M
from chimera.omega.backend import NativeBackend, StockfishTactical, StockfishVerifier, EngineError, MATE

MATE_T = MATE - 1000
CAPS = {"style-extreme": 12.0, "mate": 40.0, "sacrifice": 10.0, "human": 8.0, "opening": 5.0}
SAC_GROUPS = {"sacrifice"}


class WholeMind:
    def __init__(self, cfg, trace_path: Optional[str] = None):
        self.cfg = cfg
        self.backend = StockfishTactical(cfg) if cfg.tactical == "stockfish" else NativeBackend(cfg)
        self.verifier = StockfishVerifier(cfg) if cfg.verifier == "stockfish" else None
        self.maia = None
        if cfg.use_maia:
            try:
                from chimera.maia import MaiaPolicy
                self.maia = MaiaPolicy()
            except Exception as ex:  # model missing -> capability reported, never faked
                self.maia_error = str(ex)
        self.rng = random.Random(cfg.seed)
        self.state = M.MatchState()
        self.trace_path = trace_path
        self.enabled = None if cfg.use_motifs else set()
        if cfg.use_motifs and not cfg.style_extreme:
            self.enabled = {n for n, m in M.REGISTRY.items() if m.group != "style-extreme"}
        self.last = {}

    # ------------------------------------------------------------------ helpers
    def _maia(self, board: chess.Board, elo_self: int, elo_opp: int) -> Dict[str, float]:
        if self.maia is None or board.is_game_over():
            return {}
        probs, _ = self.maia.predict(board, elo_self, elo_opp)
        top = sorted(probs.items(), key=lambda kv: -kv[1])[: self.cfg.maia_multipv]
        return dict(top)

    def newgame(self):
        self.state.reset()
        self.backend.newgame()
        self.rng = random.Random(self.cfg.seed)
        self.last = {}

    def close(self):
        self.backend.close()
        if self.verifier:
            self.verifier.close()

    # ------------------------------------------------------------------ main
    def choose(self, board: chess.Board, budget_scale: float = 1.0, opp_clock_s: Optional[float] = None, opp_think_frac: Optional[float] = None,
               budget_s: Optional[float] = None):
        t0 = time.perf_counter()
        cfg = self.cfg
        legal = list(board.legal_moves)
        tr = {"ply": board.ply(), "fen": board.fen(), "start_fen": board.root().fen(), "history": [m.uci() for m in board.move_stack],
 "profile": {k: getattr(cfg, k) for k in ("use_motifs", "use_maia", "use_memory", "use_creative", "use_neural", "verifier")}}
        if not legal:
            return None, tr | {"reason": "no legal moves"}
        self._observe_opponent(board)
        self.state.opp_clock_s, self.state.opp_think_frac = opp_clock_s, opp_think_frac
        tr["state"] = {"checks_given": self.state.checks_given, "zombie_streak": self.state.zombie_streak, "last_moved_to": self.state.last_moved_to,
                       "our_moves": list(self.state.our_moves), "opp_moves": list(self.state.opp_moves), "opp_cp_drops": list(self.state.opp_cp_drops),
                       "declined_sac": self.state.declined_sac, "repetition_used": self.state.repetition_used,
                       "opp_clock_s": opp_clock_s, "opp_think_frac": opp_think_frac}
        if len(legal) == 1:
            mv = legal[0]
            self._update_state(board, mv, None)
            return mv, tr | {"reason": "forced single legal move", "move": mv.uci()}
        rn = max(5000, int(cfg.root_nodes * budget_scale))
        rnn = max(2000, int(cfg.reply_nodes * budget_scale))
        # 2 ROOT SEARCH
        secs = budget_s * cfg.root_time_frac if (budget_s and cfg.root_time_frac > 0) else None
        if cfg.tactical == "stockfish":   # PDF: sf_time_sec = 0.12 s per root analysis, scaled with the available clock
            secs = max(0.05, min(cfg.sf_time_sec * (max(1.0, budget_scale) if cfg.root_time_frac >= 0 else 1.0), (budget_s or 1.0) * 0.5))
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=1) as ex:           # root search runs while Maia + Artist scan work (#159)
            fut = ex.submit(lambda: self.backend.analyse_root(board, rn, min(cfg.root_multipv, len(legal)), seconds=secs))
            extra = []
            if cfg.use_creative:
                if self.maia is not None:
                    extra += list(self._maia(board, cfg.maia_elo, cfg.maia_elo))[:3]
                if cfg.use_motifs:
                    cheap = []
                    pool = list(legal)
                    pool.sort(key=lambda m: -(board.is_capture(m) * 2 + board.gives_check(m) * 3 + (m.promotion is not None) * 4))
                    for m in pool[: cfg.artist_scan + 8]:
                        nb = board.copy(); nb.push(m)
                        sc, _ = M.score_move(M.Ctx(board, m, nb, state=self.state), self.enabled, have=set())
                        cheap.append((sc, m.uci()))
                    extra += [u for sc, u in sorted(cheap, reverse=True)[:3] if sc > 0]
            cand = fut.result()
        tr["root"] = dict(sorted(cand.items(), key=lambda kv: -kv[1]))
        self.partial = max(cand, key=cand.get)
        self.note_root_eval(max(cand.values()))
        tr["state"]["opp_cp_drops"] = list(self.state.opp_cp_drops); tr["state"]["opp_cp_drops_after"] = True
        # 3 ARTIST
        if cfg.use_creative:
            extra = [u for u in dict.fromkeys(extra) if u not in cand]
            if extra:
                cand.update(self.backend.eval_moves(board, extra, cfg.artist_nodes))
            tr["artist_extra"] = extra
        best = max(cand.values())
        # 4 GATE
        if best >= MATE_T:
            gate = {u: v for u, v in cand.items() if v >= MATE_T}
            tr["gate_rule"] = "forced obligation: mate available, only mating moves"
        else:
            thr = max(cfg.soundness_floor_cp, best - cfg.max_cp_drop) if best >= cfg.soundness_floor_cp else best - cfg.max_cp_drop
            gate = {u: v for u, v in cand.items() if v >= thr}
            tr["gate_rule"] = f"eval >= {thr:.0f}"
        # #1/#177 vs #151 conflict (V4): if every gated move walks into a draw, the gate widens to non-drawing moves down to the
        # anti-draw contempt value (-120 cp; -250 cp after move 30) while the position is not worse than -80 cp.
        def drawish(u):
            x = board.copy(); x.push(chess.Move.from_uci(u))
            return x.is_repetition(2) or x.is_stalemate() or x.can_claim_fifty_moves() or x.is_insufficient_material()
        if best < MATE_T and best >= -80 and gate and all(drawish(u) for u in gate):
            contempt = cfg.anti_draw_contempt_cp if board.fullmove_number <= 30 else cfg.anti_draw_contempt_cp - 130.0   # PDF: -120 -> -250 past move 30
            extra = {u: v for u, v in cand.items() if v >= contempt and not drawish(u)}
            if extra:
                gate.update(extra)
                tr["conflict"] = {"rule": "#1/#177 anti-draw contempt over #151 soundness floor", "contempt_cp": contempt, "admitted": sorted(extra)}
        tr["gated_out"] = sorted(set(cand) - set(gate))
        # 5 ROUTING (#180 + #29)
        top5 = sorted(cand.values(), reverse=True)[:5]
        leverage = (max(top5) - min(top5)) >= 90 if len(top5) >= 2 else False
        swing = len(top5) >= 2 and top5[0] - top5[1] > 120
        if swing:  # #29: re-search the top three at double budget
            top3 = [u for u, _ in sorted(gate.items(), key=lambda kv: -kv[1])[:3]]
            gate.update(self.backend.eval_moves(board, top3, rn * 2))
        k = cfg.reply_k + (2 if leverage else 0)
        order = sorted(gate, key=lambda u: -gate[u])
        deep = set(order[:k]) if cfg.use_motifs else set()
        tr["routing"] = {"leverage": leverage, "critical_extension": swing, "deep_candidates": sorted(deep)}
        # 6 MOTIFS + 7 ARBITRATION
        scored = []
        prior = None
        pre = {}
        if deep and hasattr(self.backend, "replies_parallel"):   # #159: Maia first (cheap), then all reply searches concurrently
            dl = [u for u in order if u in deep]
            nbs = {}
            for u in dl:
                x = board.copy(); x.push(chess.Move.from_uci(u)); nbs[u] = x
            mz = {u: (self._maia(nbs[u], cfg.maia_elo, cfg.maia_elo) if self.maia is not None else {}) for u in dl}
            res = self.backend.replies_parallel([(nbs[u], list(mz[u])[:6]) for u in dl], board.turn, rnn, probes=False)
            pre = {u: (mz[u], r) for u, r in zip(dl, res)}
        for u in order:
            m = chess.Move.from_uci(u)
            nb = board.copy(); nb.push(m)
            have = {"eval"}
            reply = None
            if u in deep and not nb.is_game_over():
                reply = M.ReplyInfo()
                if self.maia is not None:
                    reply.maia = pre[u][0] if u in pre else self._maia(nb, cfg.maia_elo, cfg.maia_elo)
                    if prior is None and not board.is_check():
                        pb = board.copy(); pb.push(chess.Move.null())
                        prior = self._maia(pb, cfg.maia_elo, cfg.maia_elo) if pb.is_valid() else {}
                    reply.maia_prior = prior or {}
                    have.add("maia")
                probes = None
                if u in pre and isinstance(pre[u][1], tuple):
                    reply.evals, probes = pre[u][1]
                    reply.static, reply.shallow_d3, reply.deep_d5 = probes[1], probes[3], probes[5]
                else:
                    reply.evals = pre[u][1] if u in pre else self.backend.replies(nb, board.turn, rnn, extra=list(reply.maia)[:6])
                if leverage and probes is None:
                    reply.static = self.backend.depth_eval(nb, 1, board.turn)
                    reply.shallow_d3 = self.backend.depth_eval(nb, 3, board.turn)
                    reply.deep_d5 = self.backend.depth_eval(nb, 5, board.turn)
                have.add("replies")
            ctx = M.Ctx(board, m, nb, eval_cp=gate[u], best_cp=best, cand=cand, reply=reply, state=self.state)
            ms, bd = M.score_move(ctx, self.enabled, have=have)
            mult = 1.35 if (opp_think_frac or 0) > 0.25 else 1.0          # #49
            if opp_clock_s is not None and opp_clock_s < 30:            # #51 doubles #10/#211
                for n in (10, 211):
                    if n in bd:
                        ms += bd[n]; bd[n] *= 2
            capped, groups = 0.0, {}
            cp_units = sum(bd.get(n, 0.0) for n in (1, 12, 36, 177))   # PDF states anti-draw penalties in centipawns: unscaled
            gs = cfg.group_scale or {}
            converting = best >= 500 and board.halfmove_clock >= 60 and best < MATE_T   # V6 conversion guard (forced obligation)
            for n, v in bd.items():
                if n in (1, 12, 36, 177):
                    continue
                g = M.REGISTRY[n].group
                if converting and g == "style-extreme":
                    continue
                v = v * gs.get(g, 1.0) * gs.get(f"#{n}", 1.0)
                groups[g] = groups.get(g, 0.0) + v
            for g, v in groups.items():
                capped += max(-CAPS.get(g, 99), min(CAPS.get(g, 99), v))
            ev = gate[u]
            evu = max(-30.0, min(30.0, ev / 100.0)) if abs(ev) < MATE_T else (40.0 if ev > 0 else -40.0)
            prog = 0.0
            if converting and (m.promotion or board.is_capture(m) or board.piece_type_at(m.from_square) == chess.PAWN):
                prog = 1.0                                                    # resets the 50-move counter: progress
            util = evu + cp_units + prog + cfg.motif_scale * mult * capped
            sac = any(M.REGISTRY[n].group in SAC_GROUPS for n in bd) or ctx.sac_value() >= 1
            rec = {"move": u, "eval": ev, "motif": round(capped, 3), "util": round(util, 3), "bd": {f"#{n}": round(v, 3) for n, v in bd.items()},
                   "sac": sac, "deep": u in deep}
            if reply is not None:
                rec["evidence"] = {"maia": {k: round(v, 5) for k, v in reply.maia.items()}, "maia_prior": {k: round(v, 5) for k, v in reply.maia_prior.items()},
                                   "evals": reply.evals, "static": reply.static, "d3": reply.shallow_d3, "d5": reply.deep_d5}
            scored.append(rec)
        # 9 SELECTION with 8 SKEPTIC veto loop
        scored.sort(key=lambda d: -d["util"])
        vetoed = []
        while scored:
            pick = self._select(scored, board)
            if pick["sac"] and self.verifier is not None and abs(pick["eval"]) < MATE_T:
                try:
                    v = self.verifier.move_value(board, pick["move"], cfg.verify_nodes)
                except EngineError as ex:
                    v = None
                    pick["verify_error"] = str(ex)
                pick["verified_cp"] = v
                floor = max(cfg.soundness_floor_cp, -35.0) if best >= -35 else best - cfg.max_cp_drop
                if v is None or v < floor:
                    vetoed.append({"move": pick["move"], "verified_cp": v, "floor": floor, "reason": "Skeptic: sacrifice refuted or unverifiable"})
                    scored = [d for d in scored if d is not pick]
                    continue
            break
        if not scored:  # every gated candidate vetoed -> objective best (legal fallback)
            u = max(cand, key=cand.get)
            pick = {"move": u, "eval": cand[u], "util": None, "bd": {}, "fallback": "all candidates vetoed"}
        mv = chess.Move.from_uci(pick["move"])
        ebest = max(gate, key=gate.get)
        tr.update({"move": pick["move"], "chosen": pick, "eval_best": ebest, "vetoed": vetoed,
                   "arbitration": self._arbitration(scored, pick, ebest), "candidates": scored,
                   "ms": round((time.perf_counter() - t0) * 1000, 1)})
        self._update_state(board, mv, pick)
        self.last = {"expected_after": pick["eval"], "sac": pick.get("sac", False), "to": mv.to_square}
        if self.trace_path:
            with open(self.trace_path, "a") as f:
                f.write(json.dumps(tr) + "\n")
        return mv, tr

    def _select(self, scored, board):
        if self.cfg.deterministic:
            return scored[0]
        tau = self.cfg.softmax_temp + (0.5 if board.ply() < 10 else 0.0)   # #25 + #79
        if sum(1 for p in board.piece_map().values() if p.piece_type not in (chess.PAWN, chess.KING)) <= 4:
            tau *= 0.5                                                        # #152 phase annealing: endgames cool down
        pool = [d for d in scored if d["util"] is not None]
        mx = max(d["util"] for d in pool)
        w = [math.exp((d["util"] - mx) / max(1e-3, tau)) for d in pool]
        r = self.rng.random() * sum(w)
        for d, x in zip(pool, w):
            r -= x
            if r <= 0:
                return d
        return pool[0]

    @staticmethod
    def _arbitration(scored, pick, ebest):
        if pick.get("move") == ebest or not scored:
            return {"result": "objective best chosen", "motifs_supporting": pick.get("bd", {})}
        eb = next((d for d in scored if d["move"] == ebest), None)
        return {"result": "motif arbitration overrode objective best", "objective_best": ebest,
                "eval_cost_cp": (eb["eval"] - pick["eval"]) if eb else None, "winner_motifs": pick.get("bd", {}),
                "loser_motifs": eb["bd"] if eb else None}

    def _observe_opponent(self, board):
        if not board.move_stack:
            return
        last = board.peek()
        self.state.opp_moves.append(last.uci())
        if "expected_after" in self.last:
            # opponent's eval loss = how much better we stand than our expectation (both from our POV)
            pass
        if self.last.get("sac"):
            self.state.declined_sac = last.to_square != self.last.get("to")

    def note_root_eval(self, best_now: float):
        if "expected_after" in self.last and abs(best_now) < MATE_T and abs(self.last["expected_after"]) < MATE_T:
            self.state.opp_cp_drops.append(best_now - self.last["expected_after"])

    def _update_state(self, board, mv, pick):
        nb = board.copy(); nb.push(mv)
        if nb.is_check():
            self.state.checks_given += 1
        if self.state.last_moved_to == mv.from_square:
            self.state.zombie_streak += 1
        else:
            self.state.zombie_streak = 0
        self.state.last_moved_to = mv.to_square
        self.state.our_moves.append(mv.uci())
        if nb.is_repetition(2):
            self.state.repetition_used += 1
