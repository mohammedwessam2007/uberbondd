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

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import chess

from chimera.omega import motifs as M
from chimera.omega.backend import NativeBackend, StockfishTactical, StockfishVerifier, EngineError, MATE

MATE_T = MATE - 1000
CAPS = {"style-extreme": 12.0, "mate": 40.0, "sacrifice": 10.0, "human": 8.0, "opening": 5.0}
SAC_GROUPS = {"sacrifice"}


def immediate_mates(board, legal=None):
    mates = []
    for move in board.legal_moves if legal is None else legal:
        if board.gives_check(move):
            after = board.copy(stack=False)
            after.push(move)
            if after.is_checkmate():
                mates.append(move)
    return mates


@dataclass(frozen=True)
class PlanWitness:
    """A one-reply continuation with an exact position and finite search evidence."""
    root: str
    history: tuple
    response: chess.Move
    continuation: chess.Move
    objective: int
    defense_cp: float

    def follow(self, board, root, history):
        if self.root == root and history == self.history + (self.response,) and self.continuation in board.legal_moves:
            return self.continuation.uci()
        return None


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
        self.root_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="root-search")

    # ------------------------------------------------------------------ helpers
    def _maia(self, board: chess.Board, elo_self: int, elo_opp: int) -> Dict[str, float]:
        if self.maia is None or board.is_game_over():
            return {}
        probs, _ = self.maia.predict(board, elo_self, elo_opp)
        return self._top_policy(probs)

    def _top_policy(self, probs):
        return dict(sorted(probs.items(), key=lambda kv: -kv[1])[:self.cfg.maia_multipv])

    def _reply_targets(self, nb, extra):
        captures = M.en_prise_captures(nb, not nb.turn)
        if len({m.to_square for m in captures}) >= 3:
            extra = [*extra, *(m.uci() for m in captures)]
        replies = list(nb.legal_moves)
        if len(replies) <= 12 and sum(nb.is_capture(m) for m in replies) >= 5:
            extra.extend(m.uci() for m in replies)
        return list(dict.fromkeys(extra))

    def newgame(self):
        self.state.reset()
        self.backend.newgame()
        self.rng = random.Random(self.cfg.seed)
        self.last = {}

    def warm(self):
        self.root_executor.submit(self.backend.warm).result()

    def close(self):
        self.root_executor.shutdown()
        self.backend.close()
        if self.verifier:
            self.verifier.close()

    # ------------------------------------------------------------------ main
    def choose(self, board: chess.Board, budget_scale: float = 1.0, opp_clock_s: Optional[float] = None, opp_think_frac: Optional[float] = None,
               budget_s: Optional[float] = None, *, budget=None, nodes=None, depth=None, fallback=None,
               mates=None):
        t0 = time.perf_counter()
        check = budget.check if budget is not None else lambda: None
        check()
        timings = {}

        def stage(name):
            now = time.perf_counter()
            timings[name] = round((now - stage.previous) * 1000, 3)
            stage.previous = now

        stage.previous = t0
        cfg = self.cfg
        legal = list(board.legal_moves)
        tr = {"ply": board.ply(), "fen": board.fen(), "start_fen": board.root().fen(), "history": [m.uci() for m in board.move_stack],
 "profile": {k: getattr(cfg, k) for k in ("use_motifs", "use_maia", "use_memory", "use_creative", "use_neural", "verifier")}}
        if not legal:
            return None, tr | {"reason": "no legal moves"}
        self._observe_position(board)
        mates = immediate_mates(board, legal) if mates is None else mates
        witness = self.last.get("plan") if cfg.use_memory else None
        pending = witness.follow(board, *self._position_key(board)) if witness else None
        self.state.opp_clock_s, self.state.opp_think_frac = opp_clock_s, opp_think_frac
        tr["state"] = {"checks_given": self.state.checks_given, "zombie_streak": self.state.zombie_streak, "last_moved_to": self.state.last_moved_to,
                       "our_moves": list(self.state.our_moves), "opp_moves": list(self.state.opp_moves), "opp_cp_drops": list(self.state.opp_cp_drops),
                       "declined_sac": self.state.declined_sac, "repetition_used": self.state.repetition_used,
                       "last_only_move": self.state.last_only_move,
                       "opp_clock_s": opp_clock_s, "opp_think_frac": opp_think_frac}
        if len(legal) == 1:
            mv = legal[0]
            self._update_state(board, mv)
            self.last = {"position": self._position_key(board, mv), "last_only_move": False}
            return mv, tr | {"reason": "forced single legal move", "move": mv.uci()}
        rn = nodes if nodes is not None else max(5000, int(cfg.root_nodes * budget_scale))
        rnn = max(2000, int(cfg.reply_nodes * budget_scale))
        fixed = nodes is not None or depth is not None
        secs = budget_s * (cfg.root_time_frac if cfg.root_time_frac > 0 else 0.6) if budget_s else None
        if cfg.tactical == "stockfish":
            secs = min(cfg.sf_time_sec * (max(1.0, budget_scale) if cfg.root_time_frac >= 0 else 1.0), (budget_s or 1.0) * 0.5)
        if fixed:
            secs = None
        extra = []
        forced_candidates = {}
        if mates:
            cand = {m.uci(): MATE - 1 for m in mates}
        else:
            fut = self.root_executor.submit(self.backend.analyse_root, board, rn, min(cfg.root_multipv, len(legal)),
                                            seconds=secs, depth=depth, budget=budget)
            try:
                if cfg.use_creative and not fixed:
                    if self.maia is not None:
                        extra.extend(list(self._maia(board, cfg.maia_elo, cfg.maia_elo))[:3])
                    if cfg.use_motifs:
                        cheap = []
                        forced_candidates = {98: [], 188: []}
                        battery_before = M.battery_targets(board, board.turn)
                        pool = sorted(legal, key=lambda m: -(board.is_capture(m) * 2 + board.gives_check(m) * 3 + bool(m.promotion) * 4))
                        for i, m in enumerate(pool):
                            check()
                            nb = board.copy(stack=False); nb.push(m)
                            if M.battery_targets(nb, board.turn) - battery_before:
                                forced_candidates[98].append(m.uci())
                            if len({r.to_square for r in M.en_prise_captures(nb, board.turn)}) >= 3:
                                forced_candidates[188].append(m.uci())
                            if i < cfg.artist_scan + 8:
                                sc, _ = M.score_move(M.Ctx(board, m, nb, state=self.state), self.enabled, have=set())
                                cheap.append((sc, m.uci()))
                        extra.extend(v[0] for v in forced_candidates.values() if v)
                        extra.extend(u for sc, u in sorted(cheap, reverse=True)[:3] if sc > 0)
            finally:
                cand = fut.result()
        stage("root_and_artist_scan")
        if not cand:
            raise EngineError("root returned no exact candidate score")
        tr["root"] = dict(sorted(cand.items(), key=lambda kv: -kv[1]))
        tr["root_search"] = {"depth": 0 if mates else self.backend.root_depth,
                             "nodes": 0 if mates else self.backend.nodes_used}
        self.partial = max(cand, key=cand.get)
        if fallback:
            fallback(chess.Move.from_uci(self.partial))
        self.note_root_eval(max(cand.values()))
        tr["state"]["opp_cp_drops"] = list(self.state.opp_cp_drops)
        tr["state"]["opp_cp_drops_after"] = True
        if not fixed and not mates and (cfg.use_creative or pending):
            if pending:
                extra = [pending, *extra]
            extra = [u for u in dict.fromkeys(extra) if u not in cand]
            if extra:
                cand.update(self.backend.eval_moves(board, extra, cfg.artist_nodes, budget=budget))
            tr["artist_extra"] = extra
        stage("artist_search")
        exact_draws = set()
        for uci in cand:
            next_board = M._after(board, chess.Move.from_uci(uci))
            if next_board.is_stalemate() or next_board.is_insufficient_material():
                cand[uci] = 0.0
                exact_draws.add(uci)
        if exact_draws:
            tr["exact_draw_moves"] = sorted(exact_draws)
        best = max(cand.values())
        # 4 GATE
        if best >= MATE_T:
            gate = {u: v for u, v in cand.items() if v >= best}
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
        # 5 ROUTING (#180 + #29)
        top5 = sorted(cand.values(), reverse=True)[:5]
        leverage = (max(top5) - min(top5)) >= 90 if len(top5) >= 2 else False
        swing = len(top5) >= 2 and top5[0] - top5[1] > 120
        swing = swing and not fixed and not mates
        if swing:  # #29: re-search the top three at double budget
            top3 = [u for u, _ in sorted(gate.items(), key=lambda kv: -kv[1])[:3]]
            refined = self.backend.eval_moves(board, top3, rn * 2, budget=budget)
            cand.update({u: v for u, v in refined.items() if u not in exact_draws})
            best = max(cand.values())
            if best >= MATE_T:
                gate = {u: v for u, v in cand.items() if v >= best}
            else:
                floor = max(cfg.soundness_floor_cp, best - cfg.max_cp_drop) if best >= cfg.soundness_floor_cp else best - cfg.max_cp_drop
                gate = {u: v for u, v in cand.items() if v >= floor}
        k = cfg.reply_k + (2 if leverage else 0)
        order = sorted(gate, key=lambda u: -gate[u])
        tr["gated_out"] = sorted(set(cand) - set(gate))
        tr["candidate_evals"] = cand
        deep = set(order[:k]) if cfg.use_motifs and not fixed and not mates else set()
        if deep and cfg.use_creative:
            deep.update(u for u in forced_candidates.get(188, ())[:1] if u in gate)
        tr["routing"] = {"leverage": leverage, "critical_extension": swing, "deep_candidates": sorted(deep)}
        plan_move = pending if pending in gate and best < MATE_T and gate[pending] >= best - 15 else None
        if witness:
            tr["plan_witness"] = {"objective": witness.objective, "expected_reply": witness.response.uci(),
                                  "next": witness.continuation.uci(), "admitted": plan_move is not None,
                                  "previous_reply_cp": witness.defense_cp}
        stage("gate_and_extension")
        # 6 MOTIFS + 7 ARBITRATION
        scored = []
        prior = None
        pre = {}
        if deep and hasattr(self.backend, "replies_parallel"):   # #159: Maia first (cheap), then all reply searches concurrently
            dl = [u for u in order if u in deep]
            nbs = {}
            for u in dl:
                x = board.copy(); x.push(chess.Move.from_uci(u)); nbs[u] = x
            mz = {}
            if self.maia is not None:
                check()
                policy_roots = [u for u in dl if not nbs[u].is_game_over()]
                boards = [nbs[u] for u in policy_roots]
                if not board.is_check():
                    probe = board.copy(stack=7)
                    probe.push(chess.Move.null())
                    if probe.is_valid():
                        boards.append(probe)
                policies = self.maia.predict_many(boards, cfg.maia_elo, cfg.maia_elo)
                mz = {u: self._top_policy(p) for u, (p, _) in zip(policy_roots, policies)}
                if len(policies) > len(policy_roots):
                    prior = self._top_policy(policies[-1][0])
            stage("reply_policy")
            res = self.backend.replies_parallel(
                [(nbs[u], self._reply_targets(nbs[u], list(mz.get(u, {})))) for u in dl],
                board.turn, rnn, probes=leverage, budget=budget)
            stage("reply_search")
            pre = {u: (mz.get(u, {}), r) for u, r in zip(dl, res)}
        for u in order:
            check()
            m = chess.Move.from_uci(u)
            nb = board.copy(); nb.push(m)
            have = {"eval"}
            reply = None
            if u in deep and not nb.is_game_over():
                reply = M.ReplyInfo()
                if self.maia is not None:
                    reply.maia = pre[u][0] if u in pre else self._maia(nb, cfg.maia_elo, cfg.maia_elo)
                    if u not in pre and prior is None and not board.is_check():
                        pb = board.copy(); pb.push(chess.Move.null())
                        prior = self._maia(pb, cfg.maia_elo, cfg.maia_elo) if pb.is_valid() else {}
                    reply.maia_prior = prior or {}
                    have.add("maia")
                probes = None
                if u in pre and isinstance(pre[u][1], tuple):
                    reply.evals, probes = pre[u][1]
                    reply.static, reply.shallow_d3, reply.deep_d5 = probes[1], probes[3], probes[5]
                else:
                    reply.evals = pre[u][1] if u in pre else self.backend.replies(nb, board.turn, rnn, extra=self._reply_targets(nb, list(reply.maia)), budget=budget)
                if leverage and probes is None:
                    reply.static = self.backend.depth_eval(nb, 1, board.turn, budget=budget)
                    reply.shallow_d3 = self.backend.depth_eval(nb, 3, board.turn, budget=budget)
                    reply.deep_d5 = self.backend.depth_eval(nb, 5, board.turn, budget=budget)
                have.add("replies")
            ctx = M.Ctx(board, m, nb, eval_cp=gate[u], best_cp=best, cand=cand, reply=reply, state=self.state)
            if M.m109(ctx) and not self.last and "prior_defense_search" not in tr and len(board.move_stack) >= 2 and not self.state.last_only_move:
                prior_board = board.copy(stack=board.ply())
                prior_board.pop()
                old_replies = self.backend.replies(prior_board, board.turn, rnn, budget=budget)
                values = sorted(old_replies.values())
                self.state.last_only_move = len(values) >= 2 and values[0] < 150 <= values[1]
                tr["state"]["last_only_move"] = self.state.last_only_move
                tr["prior_defense_search"] = old_replies
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
                if (converting and g == "style-extreme") or (n == 219 and not nb.is_stalemate()):
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
            plan_bonus = 0.10 if u == plan_move and not drawish(u) else 0.0
            util = evu + cp_units + prog + plan_bonus + cfg.motif_scale * mult * capped
            sac = any(M.REGISTRY[n].group in SAC_GROUPS for n in bd) or ctx.sac_value() >= 1
            rec = {"move": u, "eval": ev, "motif": round(capped, 3), "util": round(util, 3), "bd": {f"#{n}": round(v, 3) for n, v in bd.items()},
                   "sac": sac, "deep": u in deep, "plan_bonus": plan_bonus}
            if reply is not None:
                rec["evidence"] = {"maia": {k: round(v, 5) for k, v in reply.maia.items()}, "maia_prior": {k: round(v, 5) for k, v in reply.maia_prior.items()},
                                   "evals": reply.evals, "static": reply.static, "d3": reply.shallow_d3, "d5": reply.deep_d5}
            scored.append(rec)
        stage("scoring")
        # 9 SELECTION with 8 SKEPTIC veto loop
        scored.sort(key=lambda d: -d["util"])
        candidates = scored
        vetoed = []
        while scored:
            check()
            pool = scored
            if mates and cfg.use_motifs:
                top_rank = max(rec["bd"].get("#144", 0) for rec in scored)
                pool = [rec for rec in scored if rec["bd"].get("#144", 0) == top_rank]
            pick = self._select(pool, board)
            if pick["sac"] and self.verifier is not None and abs(pick["eval"]) < MATE_T:
                try:
                    v = self.verifier.move_value(board, pick["move"], cfg.verify_nodes, budget=budget)
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
        if not scored:  # all admitted candidates were vetoed
            # Use finite verification where available and retain the other searched legal moves.
            values = cand.copy()
            for veto in vetoed:
                if veto["verified_cp"] is None:
                    values.pop(veto["move"], None)
                else:
                    values[veto["move"]] = veto["verified_cp"]
            u = max(values or cand, key=(values or cand).get)
            pick = {"move": u, "eval": values.get(u, cand[u]), "util": None, "bd": {},
                    "fallback": "best remaining evidence after all admitted candidates were vetoed"}
        stage("selection_and_skeptic")
        mv = chess.Move.from_uci(pick["move"])
        ebest = max(gate, key=gate.get)
        tr.update({"move": pick["move"], "chosen": pick, "eval_best": ebest, "vetoed": vetoed,
                   "arbitration": self._arbitration(scored, pick, ebest), "candidates": candidates,
                   "ms": round((time.perf_counter() - t0) * 1000, 1), "stage_ms": timings})
        self._update_state(board, mv)
        self.last = {"position": self._position_key(board, mv), "expected_after": pick["eval"],
                     "sac": pick.get("sac", False), "to": mv.to_square, "last_only_move": "#109" in pick["bd"]}
        if cfg.use_memory and not mates:
            witness = self._make_witness(board, mv, pick)
            if witness:
                self.last["plan"] = witness
                tr["new_plan_witness"] = {"objective": witness.objective, "response": witness.response.uci(),
                                          "continuation": witness.continuation.uci(), "defense_cp": witness.defense_cp}
        if self.trace_path:
            with open(self.trace_path, "a") as f:
                f.write(json.dumps(tr) + "\n")
        return mv, tr

    def _make_witness(self, board, move, pick):
        objective = next((n for n in (98, 146, 110, 9, 172) if f"#{n}" in pick["bd"]), None)
        pv = self.backend.root_pv.get(move.uci(), ())
        replies = pick.get("evidence", {}).get("evals", {})
        if objective is None or len(pv) < 3 or not replies:
            return None
        reply_cp = replies.get(pv[1].uci())
        if reply_cp is None or reply_cp > min(replies.values()) + 25:
            return None
        root, history = self._position_key(board, move)
        return PlanWitness(root, history, pv[1], pv[2], objective, reply_cp)

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

    @staticmethod
    def _position_key(board, move=None):
        history = tuple(board.move_stack)
        return board.root().fen(), history if move is None else history + (move,)

    def _observe_position(self, board):
        root, moves = self._position_key(board)
        if moves and self.last.get("position") == (root, moves[:-1]):
            last = moves[-1]
            self.state.opp_moves.append(last.uci())
            self.state.last_only_move = self.last.get("last_only_move", False)
            self.state.declined_sac = self.last.get("sac", False) and last.to_square != self.last.get("to")
            return

        # Position commands can jump, repeat a search, or load a different game.
        # Restore board-observable facts from the supplied legal history.
        self.state.reset()
        self.last = {}
        before = board.root()
        for move in moves:
            if before.turn == board.turn:
                self._update_state(before, move)
            else:
                self.state.opp_moves.append(move.uci())
            before.push(move)

    def note_root_eval(self, best_now: float):
        if "expected_after" in self.last and abs(best_now) < MATE_T and abs(self.last["expected_after"]) < MATE_T:
            self.state.opp_cp_drops.append(best_now - self.last["expected_after"])

    def _update_state(self, board, mv):
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
