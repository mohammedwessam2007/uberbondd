"""Artist-Architect-Skeptic (AAS) creative layer with persistent plan memory.

Original code (2026-11-23). Implements, as a minimal functional vertical slice:
  #047 SACRIFICE GRAMMAR        - Artist tags sacrifice / decoy / check / king-zone / quiet candidates
  #050 PETROSIAN-TAL PARADOX    - a prophylaxis probe (opponent's best reply value) sits beside the attack test
  #052 COUNTERFACTUAL FOUNDRY   - every rejected sacrifice records the refutation and the missing condition
  #053 ADVERSARIAL GRANDMASTER  - Skeptic re-searches the strongest defence of every proposal at equal budget
  #065 PLAN-RECOVERY INSTINCT   - a refuted / interfered plan is dropped and the searcher re-plans
  #073 PLAN WITNESS             - every accepted intent carries goal, board prerequisites, expected line, refutation
  #095 STRATEGIC ASSUMPTION LEDGER / #113 EPISODIC MEMORY - PlanMemory validated after every opponent move
  #118 CREATIVE COUNTEREXAMPLE SEARCH / #163 BRILLIANCY SHIELD - spectacular proposals get deeper verification
  #164 / #165 / #166            - only as tags (multi-sac lines, quiet/zugzwang, endgame breaks); no claim of mastery

Soundness rule (non-negotiable): a creative move is only chosen if the Skeptic's own
verification of it is within `margin` of the verified plain best AND not losing. Beauty
never overrides a refutation. Independent checking is done with Stockfish in the tests,
not here: this module never claims a move is "sound" beyond its own search.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

import chess

from .evaluate import PIECE_VALUE
from .search import MATE_BOUND, Searcher, see

STYLES = {
    # margin: centipawns of verified score the style is willing to give up for an
    # unconventional move; floor: minimum verified score for a creative pick.
    "classical": {"margin": 0, "floor": 0, "prophylaxis": 0.0},
    "tal":       {"margin": 25, "floor": -20, "prophylaxis": 0.0},
    "petrosian": {"margin": 15, "floor": 0, "prophylaxis": 0.5},
    "chimera":   {"margin": 20, "floor": -10, "prophylaxis": 0.25},
}


@dataclass
class PlanWitness:
    move: str
    goal: str
    tags: List[str]
    expected_line: List[str]
    prerequisites: List[List]   # [kind, square, arg]; checked on every later board
    verified_score: int
    refutation: Optional[str]
    created_ply: int
    status: str = "ACTIVE"
    history: List[str] = field(default_factory=list)


def _king_zone(board: chess.Board, color: bool) -> int:
    k = board.king(color)
    if k is None:
        return 0
    return chess.BB_KING_ATTACKS[k] | chess.BB_SQUARES[k]


def artist_candidates(board: chess.Board, root_scores: Dict[str, int], best: chess.Move,
                      limit: int = 5) -> List[tuple]:
    """Ordinary plus unconventional legal proposals with sacrifice-grammar tags (#047)."""
    enemy_zone = _king_zone(board, not board.turn)
    out = []
    for m in board.legal_moves:
        if m == best:
            continue
        tags = []
        mover = board.piece_type_at(m.from_square)
        if board.is_capture(m):
            if see(board, m) < 0:
                tags.append("sacrifice")
        else:
            # moved piece left en prise on its destination (decoy / offer)
            board.push(m)
            att = board.attackers_mask(board.turn, m.to_square)
            dfn = board.attackers_mask(not board.turn, m.to_square)
            board.pop()
            if att and mover != chess.PAWN and (not dfn or PIECE_VALUE[mover] > 330):
                cheapest = min(PIECE_VALUE[board.piece_type_at(s)] for s in chess.scan_forward(att))
                if cheapest < PIECE_VALUE[mover] or not dfn:
                    tags.append("sacrifice")
        if board.gives_check(m):
            tags.append("check")
        if chess.BB_SQUARES[m.to_square] & enemy_zone or \
                (board.attacks_mask(m.from_square) & enemy_zone and mover != chess.KING):
            if not board.is_capture(m):
                tags.append("king_zone")
        if not board.is_capture(m) and not board.gives_check(m) and not m.promotion:
            tags.append("quiet")
        if mover == chess.PAWN and chess.square_rank(m.to_square) in (2, 3, 4, 5) and \
                chess.popcount(board.occupied) <= 14:
            tags.append("break")
        interesting = {"sacrifice", "check", "king_zone", "break"} & set(tags)
        if interesting:
            prior = root_scores.get(m.uci(), -10 ** 9)
            spectacle = 3 * ("sacrifice" in tags) + ("check" in tags) + ("king_zone" in tags)
            out.append((spectacle, prior, m, tags))
    out.sort(key=lambda t: (t[0], t[1]), reverse=True)
    # keep the most spectacular plus the best-scored unconventional ones
    picked, seen = [], set()
    for t in out[:limit] + sorted(out, key=lambda t: t[1], reverse=True)[:2]:
        if t[2] not in seen:
            seen.add(t[2])
            picked.append((t[2], t[3]))
    return picked[:limit + 2]


class Skeptic:
    """Re-searches the opponent's strongest defence of a proposal (#053, #118, #163)."""

    def __init__(self):
        self.searcher = Searcher(tt_size=1 << 19)

    def verify(self, board: chess.Board, move: chess.Move, budget: float):
        b = board.copy()
        b.push(move)
        if b.is_checkmate():
            return 10 ** 5 - 1, None, [move.uci()]
        if b.is_stalemate() or b.is_insufficient_material():
            return 0, None, [move.uci()]
        r = self.searcher.search(b, budget)
        line = [move.uci()] + [x.uci() for x in r.pv]
        return -r.score, (r.move.uci() if r.move else None), line


def architect_witness(board: chess.Board, move: chess.Move, tags: List[str], score: int,
                      line: List[str], refutation: Optional[str], ply: int) -> PlanWitness:
    """Turns a verified line into testable board prerequisites (#073)."""
    us = board.turn
    if score >= MATE_BOUND:
        goal = "forced mate"
    elif "sacrifice" in tags:
        goal = "material-for-initiative conversion"
    elif "king_zone" in tags:
        goal = "king attack"
    elif "break" in tags:
        goal = "pawn break / fortress demolition"
    else:
        goal = "positional improvement"
    prereq = []
    b = board.copy()
    our_targets = []
    for i, u in enumerate(line[:7]):
        mv = chess.Move.from_uci(u)
        if mv not in b.legal_moves:
            break
        if b.turn == us:
            our_targets.append(mv)
        b.push(mv)
    # the pieces our later moves rely on must still exist where they stand now
    for mv in our_targets[1:4]:
        p = board.piece_at(mv.from_square)
        if p is not None and p.color == us:
            prereq.append(["own_piece_on", chess.square_name(mv.from_square), p.symbol()])
    k = board.king(not us)
    if k is not None and goal in ("forced mate", "king attack"):
        prereq.append(["enemy_king_within", chess.square_name(k), "w" if not us else "b"])
    return PlanWitness(move.uci(), goal, tags, line, prereq, score, refutation, ply)


def prerequisites_hold(board: chess.Board, w: PlanWitness) -> List[str]:
    broken = []
    for kind, sqn, arg in w.prerequisites:
        sq = chess.parse_square(sqn)
        if kind == "own_piece_on":
            p = board.piece_at(sq)
            if p is None or p.symbol() != arg:
                broken.append(f"{kind}:{sqn}:{arg}")
        elif kind == "enemy_king_within":
            kk = board.king(chess.WHITE if arg == "w" else chess.BLACK)
            if kk is None or chess.square_distance(kk, sq) > 2:
                broken.append(f"{kind}:{sqn}:{arg}")
    return broken


class PlanMemory:
    """Strategic assumption ledger / episodic memory (#095, #113) with recovery (#065)."""

    def __init__(self):
        self.active: Optional[PlanWitness] = None
        self.archive: List[PlanWitness] = []
        self.recoveries = 0

    def observe(self, board: chess.Board):
        """Called with the board after the opponent replied; validates the active plan."""
        w = self.active
        if w is None:
            return None
        if len(board.move_stack) < 2:
            return None
        played = [m.uci() for m in board.move_stack[-2:]]
        try:
            idx = w.expected_line.index(played[0])
        except ValueError:
            idx = -1
        expected_reply = w.expected_line[idx + 1] if 0 <= idx < len(w.expected_line) - 1 else None
        broken = prerequisites_hold(board, w)
        if broken:
            w.status = "REFUTED"
            w.history.append(f"prerequisites broken {broken}")
        elif expected_reply is not None and played[1] != expected_reply:
            w.status = "INTERFERED"
            w.history.append(f"expected {expected_reply} got {played[1]}")
        else:
            w.history.append(f"on track after {played[1]}")
            nxt = w.expected_line[idx + 2] if 0 <= idx < len(w.expected_line) - 2 else None
            if nxt is None:
                w.status = "COMPLETED"
        if w.status != "ACTIVE":
            self.archive.append(w)
            self.active = None
            if w.status in ("REFUTED", "INTERFERED"):
                self.recoveries += 1
        return w.status

    def next_move(self, board: chess.Board) -> Optional[chess.Move]:
        w = self.active
        if w is None or not board.move_stack:
            return None
        last = board.move_stack[-1].uci()
        line = w.expected_line
        for i in range(1, len(line) - 1):
            if line[i] == last and i % 2 == 1:
                mv = chess.Move.from_uci(line[i + 1])
                return mv if mv in board.legal_moves else None
        return None


@dataclass
class Decision:
    move: str
    source: str
    plain_best: str
    plain_score: int
    verified_plain: int
    candidates: List[Dict]
    witness: Optional[Dict]
    elapsed: float
    plan_status: Optional[str]


class CreativeEngine:
    def __init__(self, style: str = "chimera", enabled: bool = True, maia: bool = False):
        self.style = STYLES[style]
        self.style_name = style
        self.enabled = enabled
        self.searcher = Searcher()
        self.skeptic = Skeptic()
        self.memory = PlanMemory()
        self.log: List[Decision] = []
        self.base_share = 0.6
        self.window = 250
        self.max_cands = 3
        self.maia = None
        if maia:
            from .maia import MaiaPolicy
            self.maia = MaiaPolicy()

    def new_game(self):
        self.searcher = Searcher()
        self.skeptic = Skeptic()
        self.memory = PlanMemory()

    def choose(self, board: chess.Board, movetime: float, stop_flag=None, info=None) -> chess.Move:
        start = time.perf_counter()
        plan_status = self.memory.observe(board)
        if not self.enabled:
            r = self.searcher.search(board, movetime, stop_flag=stop_flag, info=info)
            return r.move
        # plan continuation gets ordering bias (consistency), never a free pass
        cont = self.memory.next_move(board)
        self.searcher.root_bias = {cont: 5_000_000} if cont else {}
        base = self.searcher.search(board, movetime * self.base_share, stop_flag=stop_flag, info=info)
        self.searcher.root_bias = {}
        best = base.move
        if best is None:
            return best
        remaining = max(0.0, movetime - (time.perf_counter() - start)) * 0.92
        cands = artist_candidates(board, base.root_scores, best)
        # V7.1: verify only candidates the shallow search does not already bury; give the
        # clock back to the main search when nothing plausible remains (diagnosis of run1).
        cands = [(m, t) for m, t in cands
                 if base.root_scores.get(m.uci(), -10 ** 9) >= base.score - self.window][: self.max_cands]
        if self.maia is not None:
            # V7.2: independent proposer. Maia3 human policy is not correlated with our
            # shallow alpha-beta scores, so it can surface moves the search buried.
            probs, _ = self.maia.predict(board, 2200)
            have = {m for m, _ in cands} | {best}
            for u, p in sorted(probs.items(), key=lambda kv: -kv[1])[:3]:
                mv = chess.Move.from_uci(u)
                if p >= 0.10 and mv not in have:
                    cands.append((mv, ["human_prior", f"p={p:.2f}"]))
        if not cands and remaining > 0.05 and abs(base.score) < MATE_BOUND:
            again = self.searcher.search(board, remaining, stop_flag=stop_flag, info=info)
            if again.move is not None and again.depth >= base.depth:
                base, best = again, again.move
            self._record(board, best, "search", base, base.score, [], None, start, plan_status)
            return best
        # verified plain best at the same budget as each proposal (equal-compute duel)
        k = len(cands)
        if k == 0 or remaining < 0.05 or abs(base.score) >= MATE_BOUND:
            self._record(board, best, "search", base, base.score, [], None, start, plan_status)
            return best
        per = remaining / (k + 1)
        v_plain, ref_plain, line_plain = self.skeptic.verify(board, best, per)
        rows, chosen, chosen_row = [], None, None
        for m, tags in cands:
            budget = per * (1.5 if "sacrifice" in tags else 1.0)  # #163 deeper shield
            if time.perf_counter() - start + budget > movetime * 0.97:
                break
            v, ref, line = self.skeptic.verify(board, m, budget)
            row = {"move": m.uci(), "tags": tags, "verified": v, "refutation": ref,
                   "line": line[:8]}
            ok = v >= max(v_plain, base.score) - self.style["margin"] and v >= self.style["floor"]
            row["accepted"] = bool(ok)
            if not ok:
                row["missing_condition"] = f"defence {ref} holds; deficit {max(v_plain, base.score) - v}cp"
            rows.append(row)
            if ok and (chosen_row is None or v > chosen_row["verified"]):
                chosen, chosen_row = m, row
        if chosen is not None:
            w = architect_witness(board, chosen, chosen_row["tags"], chosen_row["verified"],
                                  chosen_row["line"], chosen_row["refutation"], len(board.move_stack))
            if "sacrifice" in chosen_row["tags"] or w.goal in ("forced mate", "king attack"):
                self.memory.active = w
            self._record(board, chosen, "artist", base, v_plain, rows, asdict(w), start, plan_status)
            return chosen
        if cont is not None and best == cont and self.memory.active:
            src = "plan"
        else:
            src = "search"
        self._record(board, best, src, base, v_plain, rows, None, start, plan_status)
        return best

    def _record(self, board, move, source, base, v_plain, rows, witness, start, plan_status):
        self.log.append(Decision(move.uci(), source, base.move.uci() if base.move else "",
                                 base.score, v_plain, rows, witness,
                                 round(time.perf_counter() - start, 4), plan_status))
