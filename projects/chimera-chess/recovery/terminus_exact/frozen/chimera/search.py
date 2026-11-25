"""CHIMERA V7 tactical core: iterative-deepening PVS alpha-beta with a hard wall clock.

Original code (2026-11-23). Built because the recovered evidence shows the V6 Bridge
lost 0-8 to Stockfish 15.1 and the V6 runtime itself is not recoverable here. Its job
is the failure class named in the handoff: hanging pieces, tactical blindness, horizon
effects and missed deadlines. It is a classical searcher, not a neural engine.

Design: python-chess move generation; tapered piece-square evaluation; transposition
table; null-move pruning; late-move reductions; killer/history ordering; MVV-LVA and
static-exchange filtered quiescence; check extension; a deadline that is polled every
512 nodes and that always returns the best move of the deepest *completed* iteration
(or a partially searched deeper iteration whose first move already beat it).
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Tuple

import chess

from .evaluate import evaluate, PIECE_VALUE

MATE = 100_000
MATE_BOUND = MATE - 1_000
INF = 10 ** 9
EXACT, LOWER, UPPER = 0, 1, 2


class Timeout(Exception):
    pass


@dataclass
class SearchResult:
    move: Optional[chess.Move]
    score: int                 # centipawns from the side to move, mate encoded
    depth: int
    nodes: int
    elapsed: float
    pv: List[chess.Move] = field(default_factory=list)
    root_scores: Dict[str, int] = field(default_factory=dict)  # last completed depth
    deadline_hit: bool = False


def score_to_uci(score: int) -> str:
    if score >= MATE_BOUND:
        return f"mate {(MATE - score + 1) // 2}"
    if score <= -MATE_BOUND:
        return f"mate -{(MATE + score + 1) // 2}"
    return f"cp {score}"


def see(board: chess.Board, move: chess.Move) -> int:
    """Static exchange evaluation of a capture (approximate, swap-list on one square)."""
    to = move.to_square
    victim = board.piece_type_at(to)
    if victim is None:
        if board.is_en_passant(move):
            victim = chess.PAWN
        else:
            return 0
    gain = [PIECE_VALUE[victim]]
    attacker_type = board.piece_type_at(move.from_square)
    occ = board.occupied & ~chess.BB_SQUARES[move.from_square]
    side = not board.turn
    current_value = PIECE_VALUE[attacker_type]
    if move.promotion:
        current_value = PIECE_VALUE[move.promotion]
        gain[0] += PIECE_VALUE[move.promotion] - PIECE_VALUE[chess.PAWN]
    depth = 0
    while True:
        attackers = _attackers(board, side, to, occ)
        if not attackers:
            break
        # least valuable attacker
        best_sq, best_val = None, INF
        for sq in chess.scan_forward(attackers):
            pt = board.piece_type_at(sq)
            v = PIECE_VALUE[pt]
            if v < best_val:
                best_val, best_sq = v, sq
        depth += 1
        gain.append(current_value - gain[depth - 1])
        if max(-gain[depth - 1], gain[depth]) < 0:
            break
        occ &= ~chess.BB_SQUARES[best_sq]
        current_value = best_val
        side = not side
        if best_val == PIECE_VALUE[chess.KING]:
            # a king may only recapture if no further attackers remain
            if _attackers(board, side, to, occ):
                gain[depth] = -INF
            break
    while depth > 0:
        gain[depth - 1] = -max(-gain[depth - 1], gain[depth])
        depth -= 1
    return gain[0]


def _attackers(board: chess.Board, color: bool, sq: int, occ: int) -> int:
    """Attackers of `sq` by `color` given a modified occupancy (handles x-rays)."""
    own = board.occupied_co[color] & occ
    rank_file = chess.BB_RANK_ATTACKS[sq][chess.BB_RANK_MASKS[sq] & occ] | \
        chess.BB_FILE_ATTACKS[sq][chess.BB_FILE_MASKS[sq] & occ]
    diag = chess.BB_DIAG_ATTACKS[sq][chess.BB_DIAG_MASKS[sq] & occ]
    att = (chess.BB_KNIGHT_ATTACKS[sq] & board.knights) | \
        (chess.BB_KING_ATTACKS[sq] & board.kings) | \
        (rank_file & (board.rooks | board.queens)) | \
        (diag & (board.bishops | board.queens)) | \
        (chess.BB_PAWN_ATTACKS[not color][sq] & board.pawns)
    return att & own


class Searcher:
    def __init__(self, tt_size: int = 1 << 20):
        self.tt: Dict[object, Tuple[int, int, int, Optional[chess.Move]]] = {}
        self.tt_size = tt_size
        self.history: Dict[Tuple[bool, int, int], int] = {}
        self.killers: List[List[Optional[chess.Move]]] = [[None, None] for _ in range(128)]
        self.nodes = 0
        self.deadline = 0.0
        self.stop_flag: Callable[[], bool] = lambda: False
        self.root_bias: Dict[chess.Move, int] = {}

    # ------------------------------------------------------------------ helpers
    def _check_time(self):
        if (self.nodes & 127) == 0:  # V7.1: poll every 128 nodes (P95 overshoot fix)
            if time.perf_counter() >= self.deadline or self.stop_flag():
                raise Timeout()

    def _order(self, board: chess.Board, moves, tt_move, ply: int):
        killers = self.killers[ply] if ply < 128 else [None, None]
        scored = []
        turn = board.turn
        for m in moves:
            if m == tt_move:
                s = 10_000_000
            elif board.is_capture(m):
                victim = board.piece_type_at(m.to_square) or chess.PAWN
                attacker = board.piece_type_at(m.from_square)
                s = 1_000_000 + 10 * PIECE_VALUE[victim] - PIECE_VALUE[attacker] // 10
                if m.promotion:
                    s += PIECE_VALUE[m.promotion]
            elif m.promotion:
                s = 900_000 + PIECE_VALUE[m.promotion]
            elif m == killers[0]:
                s = 800_000
            elif m == killers[1]:
                s = 700_000
            else:
                s = self.history.get((turn, m.from_square, m.to_square), 0)
            if ply == 0 and m in self.root_bias:
                s += self.root_bias[m]
            scored.append((s, m))
        scored.sort(key=lambda t: t[0], reverse=True)
        return [m for _, m in scored]

    # ------------------------------------------------------------------ quiescence
    def qsearch(self, board: chess.Board, alpha: int, beta: int, ply: int) -> int:
        self.nodes += 1
        self._check_time()
        in_check = board.is_check()
        if in_check:
            moves = list(board.legal_moves)
            if not moves:
                return -MATE + ply
            best = -INF
            for m in self._order(board, moves, None, min(ply, 127)):
                board.push(m)
                s = -self.qsearch(board, -beta, -alpha, ply + 1)
                board.pop()
                if s > best:
                    best = s
                if s > alpha:
                    alpha = s
                    if alpha >= beta:
                        break
            return best
        stand = evaluate(board)
        if stand >= beta:
            return stand
        if stand > alpha:
            alpha = stand
        caps = []
        for m in board.generate_legal_captures():
            victim = board.piece_type_at(m.to_square) or chess.PAWN
            if stand + PIECE_VALUE[victim] + 200 < alpha and not m.promotion:
                continue  # delta pruning
            sv = see(board, m)
            if sv < 0:
                continue
            caps.append((sv, m))
        for m in board.generate_legal_moves(chess.BB_ALL, chess.BB_RANK_1 | chess.BB_RANK_8):
            if m.promotion == chess.QUEEN and not board.is_capture(m):
                caps.append((800, m))
        caps.sort(key=lambda t: t[0], reverse=True)
        for _, m in caps:
            board.push(m)
            s = -self.qsearch(board, -beta, -alpha, ply + 1)
            board.pop()
            if s > alpha:
                alpha = s
                if alpha >= beta:
                    break
        return alpha

    # ------------------------------------------------------------------ main search
    def negamax(self, board: chess.Board, depth: int, alpha: int, beta: int, ply: int,
                allow_null: bool = True) -> int:
        self.nodes += 1
        self._check_time()
        if ply > 0:
            if board.is_repetition(2) or board.halfmove_clock >= 100 or board.is_insufficient_material():
                return 0
            # mate distance pruning
            alpha = max(alpha, -MATE + ply)
            beta = min(beta, MATE - ply - 1)
            if alpha >= beta:
                return alpha
        in_check = board.is_check()
        if in_check:
            depth += 1
        if depth <= 0:
            return self.qsearch(board, alpha, beta, ply)

        key = board._transposition_key()
        entry = self.tt.get(key)
        tt_move = None
        if entry is not None:
            e_depth, e_flag, e_score, tt_move = entry
            if e_depth >= depth and ply > 0:
                if e_flag == EXACT:
                    return e_score
                if e_flag == LOWER and e_score >= beta:
                    return e_score
                if e_flag == UPPER and e_score <= alpha:
                    return e_score

        pv_node = beta - alpha > 1
        static = None
        if not in_check and not pv_node:
            static = evaluate(board)
            # reverse futility
            if depth <= 3 and static - 120 * depth >= beta and abs(beta) < MATE_BOUND:
                return static
            # null move
            if allow_null and depth >= 3 and static >= beta and _has_pieces(board):
                board.push(chess.Move.null())
                r = 2 + depth // 4
                s = -self.negamax(board, depth - 1 - r, -beta, -beta + 1, ply + 1, False)
                board.pop()
                if s >= beta and abs(s) < MATE_BOUND:
                    return beta

        moves = list(board.legal_moves)
        if not moves:
            return -MATE + ply if in_check else 0

        ordered = self._order(board, moves, tt_move, min(ply, 127))
        best_score, best_move = -INF, None
        orig_alpha = alpha
        for i, m in enumerate(ordered):
            is_cap = board.is_capture(m)
            gives_check = board.gives_check(m)
            quiet = not is_cap and not m.promotion
            # futility pruning of late quiet moves at frontier
            if (quiet and not in_check and not gives_check and not pv_node and depth <= 2
                    and i > 0 and best_score > -MATE_BOUND):
                if static is None:
                    static = evaluate(board)
                if static + 150 * depth <= alpha:
                    continue
            board.push(m)
            if i == 0:
                s = -self.negamax(board, depth - 1, -beta, -alpha, ply + 1)
            else:
                r = 0
                if depth >= 3 and i >= 3 and quiet and not in_check and not gives_check:
                    r = 1 + (i >= 8) + (depth >= 6)
                    if pv_node:
                        r -= 1
                s = -self.negamax(board, depth - 1 - r, -alpha - 1, -alpha, ply + 1)
                if s > alpha and r > 0:
                    s = -self.negamax(board, depth - 1, -alpha - 1, -alpha, ply + 1)
                if alpha < s < beta:
                    s = -self.negamax(board, depth - 1, -beta, -alpha, ply + 1)
            board.pop()
            if s > best_score:
                best_score, best_move = s, m
            if s > alpha:
                alpha = s
                if alpha >= beta:
                    if quiet:
                        k = self.killers[min(ply, 127)]
                        if k[0] != m:
                            k[1], k[0] = k[0], m
                        hk = (board.turn, m.from_square, m.to_square)
                        self.history[hk] = self.history.get(hk, 0) + depth * depth
                    break
        flag = EXACT
        if best_score <= orig_alpha:
            flag = UPPER
        elif best_score >= beta:
            flag = LOWER
        if len(self.tt) > self.tt_size:
            self.tt.clear()
        self.tt[key] = (depth, flag, best_score, best_move)
        return best_score

    def root(self, board: chess.Board, depth: int, alpha: int, beta: int,
             moves: List[chess.Move], scores: Dict[str, int]):
        best_score, best_move = -INF, None
        for i, m in enumerate(moves):
            board.push(m)
            if i == 0:
                s = -self.negamax(board, depth - 1, -beta, -alpha, 1)
            else:
                s = -self.negamax(board, depth - 1, -alpha - 1, -alpha, 1)
                if alpha < s < beta:
                    s = -self.negamax(board, depth - 1, -beta, -alpha, 1)
            board.pop()
            scores[m.uci()] = s
            if s > best_score:
                best_score, best_move = s, m
                self._partial = (m, s)
            if s > alpha:
                alpha = s
        return best_score, best_move

    def pv_line(self, board: chess.Board, first: chess.Move, limit: int = 12) -> List[chess.Move]:
        line = [first]
        b = board.copy(stack=False)
        b.push(first)
        seen = set()
        while len(line) < limit:
            key = b._transposition_key()
            if key in seen:
                break
            seen.add(key)
            e = self.tt.get(key)
            if not e or e[3] is None or e[3] not in b.legal_moves:
                break
            line.append(e[3])
            b.push(e[3])
        return line

    def search(self, board: chess.Board, movetime: float = 1.0, max_depth: int = 64,
               stop_flag: Optional[Callable[[], bool]] = None,
               restrict: Optional[List[chess.Move]] = None,
               info: Optional[Callable[[str], None]] = None) -> SearchResult:
        start = time.perf_counter()
        self.deadline = start + max(0.005, movetime)
        self.stop_flag = stop_flag or (lambda: False)
        self.nodes = 0
        self.killers = [[None, None] for _ in range(128)]
        board = board.copy()
        moves = list(restrict) if restrict else list(board.legal_moves)
        if not moves:
            return SearchResult(None, 0, 0, 0, 0.0)
        best_move, best_score, done_depth = moves[0], 0, 0
        last_scores: Dict[str, int] = {}
        hit = False
        if len(moves) == 1 and not restrict:
            return SearchResult(moves[0], evaluate(board), 0, 0, time.perf_counter() - start,
                                [moves[0]], {moves[0].uci(): 0})
        ordered = self._order(board, moves, None, 0)
        n0 = len(board.move_stack)
        for depth in range(1, max_depth + 1):
            self._partial = None
            scores: Dict[str, int] = {}
            try:
                window = 40
                if depth >= 4 and abs(best_score) < MATE_BOUND:
                    a, b = best_score - window, best_score + window
                    s, m = self.root(board, depth, a, b, ordered, scores)
                    if s <= a or s >= b:
                        scores = {}
                        s, m = self.root(board, depth, -INF, INF, ordered, scores)
                else:
                    s, m = self.root(board, depth, -INF, INF, ordered, scores)
            except Timeout:
                hit = True
                while len(board.move_stack) > n0:  # unwind moves pushed before the abort
                    board.pop()
                if self._partial is not None and self._partial[0] == ordered[0]:
                    pass  # first move confirmed at deeper depth: keep it
                elif self._partial is not None and self._partial[1] > best_score:
                    best_move, best_score = self._partial
                break
            best_move, best_score, done_depth = m, s, depth
            last_scores = scores
            ordered = sorted(ordered, key=lambda x: scores.get(x.uci(), -INF), reverse=True)
            if info:
                elapsed = time.perf_counter() - start
                pv = " ".join(x.uci() for x in self.pv_line(board, best_move))
                info(f"info depth {depth} score {score_to_uci(best_score)} nodes {self.nodes} "
                     f"time {int(elapsed * 1000)} nps {int(self.nodes / max(elapsed, 1e-6))} pv {pv}")
            if abs(best_score) >= MATE_BOUND and depth > 2 * (MATE - abs(best_score)) + 2:
                break
            # do not start an iteration we almost surely cannot finish
            if time.perf_counter() - start > 0.55 * movetime:
                break
        elapsed = time.perf_counter() - start
        return SearchResult(best_move, best_score, done_depth, self.nodes, elapsed,
                            self.pv_line(board, best_move), last_scores, hit)


def _has_pieces(board: chess.Board) -> bool:
    us = board.occupied_co[board.turn]
    return bool(us & (board.knights | board.bishops | board.rooks | board.queens))
