"""Hand-written tapered evaluation for the CHIMERA V7 tactical core.

Original tables authored for this project (not copied from any engine). Scores are
centipawns from the side to move. Kept deliberately cheap: Python node rate, not
evaluation subtlety, is the binding constraint of this core.
"""
from __future__ import annotations

import chess

PIECE_VALUE = {chess.PAWN: 100, chess.KNIGHT: 320, chess.BISHOP: 335,
               chess.ROOK: 500, chess.QUEEN: 950, chess.KING: 20000}
EG_VALUE = {chess.PAWN: 120, chess.KNIGHT: 300, chess.BISHOP: 330,
            chess.ROOK: 540, chess.QUEEN: 980, chess.KING: 0}
PHASE_W = {chess.PAWN: 0, chess.KNIGHT: 1, chess.BISHOP: 1, chess.ROOK: 2,
           chess.QUEEN: 4, chess.KING: 0}


def _centre(sq: int) -> int:
    f, r = chess.square_file(sq), chess.square_rank(sq)
    return 6 - (abs(2 * f - 7) + abs(2 * r - 7)) // 2  # 0 (corner) .. 6 (centre)


def _build():
    mg, eg = {}, {}
    for pt in chess.PIECE_TYPES:
        mg[pt], eg[pt] = [0] * 64, [0] * 64
    for sq in range(64):  # white's perspective; black mirrored at lookup
        f, r = chess.square_file(sq), chess.square_rank(sq)
        c = _centre(sq)
        # pawns: advance and occupy the centre; edge pawns slightly weaker in mg
        mg[chess.PAWN][sq] = 0 if r in (0, 7) else (r - 1) * 6 + (8 if f in (3, 4) and r in (3, 4) else 0) \
            - (6 if f in (3, 4) and r == 1 else 0)
        eg[chess.PAWN][sq] = 0 if r in (0, 7) else (r - 1) * 14
        mg[chess.KNIGHT][sq] = c * 8 - 25 + (5 if r >= 2 else 0)
        eg[chess.KNIGHT][sq] = c * 6 - 18
        mg[chess.BISHOP][sq] = c * 4 - 8 + (6 if (f == r or f + r == 7) else 0)
        eg[chess.BISHOP][sq] = c * 3 - 8
        mg[chess.ROOK][sq] = (18 if r == 6 else 0) + (4 if f in (3, 4) else 0) - (4 if f in (0, 7) and r == 0 else 0)
        eg[chess.ROOK][sq] = (10 if r == 6 else 0)
        mg[chess.QUEEN][sq] = c * 2 - 4 - (8 if r >= 5 and r < 7 else 0) * 0
        eg[chess.QUEEN][sq] = c * 4 - 10
        # king: shelter in mg, centralise in eg
        mg[chess.KING][sq] = (20 if r == 0 and f in (1, 2, 6) else 0) + (5 if r == 0 and f in (0, 7) else 0) \
            - r * 12 - (10 if f in (3, 4) else 0)
        eg[chess.KING][sq] = c * 9 - 25
    return mg, eg


MG_PST, EG_PST = _build()
FILES = [chess.BB_FILES[f] for f in range(8)]
ADJ = [(FILES[f - 1] if f > 0 else 0) | (FILES[f + 1] if f < 7 else 0) for f in range(8)]


def _passed_mask(color: bool, sq: int) -> int:
    f, r = chess.square_file(sq), chess.square_rank(sq)
    span = FILES[f] | ADJ[f]
    if color == chess.WHITE:
        ahead = 0
        for rr in range(r + 1, 8):
            ahead |= chess.BB_RANKS[rr]
    else:
        ahead = 0
        for rr in range(0, r):
            ahead |= chess.BB_RANKS[rr]
    return span & ahead


PASSED = {c: [_passed_mask(c, s) for s in range(64)] for c in (chess.WHITE, chess.BLACK)}
PASSED_BONUS = [0, 5, 10, 18, 32, 55, 90, 0]


def evaluate(board: chess.Board) -> int:
    if board.is_insufficient_material():
        return 0
    mg = eg = 0
    phase = 0
    pawns_w = board.pawns & board.occupied_co[chess.WHITE]
    pawns_b = board.pawns & board.occupied_co[chess.BLACK]
    for color, sign in ((chess.WHITE, 1), (chess.BLACK, -1)):
        occ = board.occupied_co[color]
        own_pawns = pawns_w if color else pawns_b
        their_pawns = pawns_b if color else pawns_w
        for pt in chess.PIECE_TYPES:
            bb = board.pieces_mask(pt, color)
            if not bb:
                continue
            mgt, egt = MG_PST[pt], EG_PST[pt]
            v_mg, v_eg = PIECE_VALUE[pt] if pt != chess.KING else 0, EG_VALUE[pt]
            for sq in chess.scan_forward(bb):
                idx = sq if color else chess.square_mirror(sq)
                mg += sign * (v_mg + mgt[idx])
                eg += sign * (v_eg + egt[idx])
                phase += PHASE_W[pt]
                if pt == chess.ROOK:
                    f = FILES[chess.square_file(sq)]
                    if not f & own_pawns:
                        bonus = 22 if not f & their_pawns else 10
                        mg += sign * bonus
                        eg += sign * (bonus // 2)
                elif pt == chess.PAWN:
                    fi = chess.square_file(sq)
                    if not ADJ[fi] & own_pawns:
                        mg -= sign * 12
                        eg -= sign * 16
                    if chess.popcount(FILES[fi] & own_pawns) > 1:
                        mg -= sign * 6
                        eg -= sign * 12
                    if not PASSED[color][sq] & their_pawns:
                        rel = chess.square_rank(sq) if color else 7 - chess.square_rank(sq)
                        mg += sign * PASSED_BONUS[rel] // 2
                        eg += sign * PASSED_BONUS[rel]
        if chess.popcount(board.pieces_mask(chess.BISHOP, color)) >= 2:
            mg += sign * 30
            eg += sign * 45
        # king shelter / exposure (middlegame only)
        ksq = board.king(color)
        if ksq is not None:
            zone = chess.BB_KING_ATTACKS[ksq]
            shield = chess.popcount(zone & own_pawns)
            mg += sign * (8 * min(shield, 3))
            enemy = not color
            attackers = 0
            for z in chess.scan_forward(zone):
                attackers += chess.popcount(board.attackers_mask(enemy, z) & ~board.kings)
            mg -= sign * (6 * attackers + (attackers * attackers))
    phase = min(phase, 24)
    score = (mg * phase + eg * (24 - phase)) // 24
    score += 10 if board.turn else -10  # tempo
    return score if board.turn == chess.WHITE else -score
