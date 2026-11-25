"""CHIMERA Ω∞ board feature extractors (CODEX220 / manual §5.2), python-chess bitboard primitives.

Reconstructs the PDF's chimera/features.py. The PDF text is truncated at a page break: it imports five helpers
(caged_heavy_pieces, closed_files_count, material_balance, max_same_color_bishops, net_king_quadrant_control) that
are never defined there. Their bodies below are engineering reconstructions, recorded in canon/PDF_CONTRADICTIONS.json
(C-CODE-01). Functions that the PDF does define keep its semantics. All functions take an explicit color and
work for both sides (colour-reversal invariance is unit-tested).
"""
from typing import List, Optional

import chess

PIECE_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9, chess.KING: 0}


def rel_rank(color: chess.Color, sq: chess.Square) -> int:
    """Rank 1..8 seen from `color` (rank 1 = own back rank)."""
    r = chess.square_rank(sq)
    return r + 1 if color == chess.WHITE else 8 - r


def king_ring_squares(king_sq: Optional[chess.Square]) -> List[chess.Square]:
    if king_sq is None:
        return []
    return list(chess.SquareSet(chess.BB_KING_ATTACKS[king_sq]))


def is_square_hanging(board: chess.Board, sq: chess.Square, us: chess.Color) -> bool:
    """PDF definition: a piece of `us` on sq is hanging when enemy attackers outnumber our defenders."""
    attackers = board.attackers(not us, sq)
    if not attackers:
        return False
    return len(attackers) > len(board.attackers(us, sq))


def count_pinned_pieces(board: chess.Board, color: chess.Color) -> int:
    """Absolute pins (to the king) of `color`'s non-king pieces."""
    return sum(1 for sq, p in board.piece_map().items() if p.color == color and p.piece_type != chess.KING and board.is_pinned(color, sq))


def max_stacked_pawns_on_file(board: chess.Board, color: chess.Color) -> int:
    pawns = board.pieces(chess.PAWN, color)
    return max((sum(1 for s in pawns if chess.square_file(s) == f) for f in range(8)), default=0)


# ---- reconstructed helpers (missing from the PDF) ----
def material(board: chess.Board, color: chess.Color) -> int:
    return sum(PIECE_VALUES[p.piece_type] for p in board.piece_map().values() if p.color == color)


def material_balance(board: chess.Board, color: chess.Color) -> int:
    return material(board, color) - material(board, not color)


def max_same_color_bishops(board: chess.Board, color: chess.Color) -> int:
    b = board.pieces(chess.BISHOP, color)
    light = sum(1 for s in b if (chess.square_file(s) + chess.square_rank(s)) % 2 == 1)
    return max(light, len(b) - light)


def pseudo_moves_of(board: chess.Board, sq: chess.Square) -> int:
    """Pseudo-legal destination count of the piece on sq (own pieces block, captures count)."""
    p = board.piece_at(sq)
    if p is None:
        return 0
    return len(board.attacks(sq) & ~board.occupied_co[p.color]) if p.piece_type != chess.PAWN else 0


def legal_moves_of_piece(board: chess.Board, sq: chess.Square) -> int:
    """Legal moves of the piece on sq for its own side, regardless of whose turn it is."""
    p = board.piece_at(sq)
    if p is None:
        return 0
    b = board if board.turn == p.color else _with_turn(board, p.color)
    return sum(1 for m in b.legal_moves if m.from_square == sq)


def _with_turn(board: chess.Board, color: chess.Color) -> chess.Board:
    b = board.copy(stack=False)
    b.turn = color
    b.ep_square = None
    return b


def caged_heavy_pieces(board: chess.Board, color: chess.Color) -> int:
    """`color`'s rooks/queens with <= 1 legal move (piece-cage, #185/#87)."""
    return sum(1 for pt in (chess.ROOK, chess.QUEEN) for sq in board.pieces(pt, color) if legal_moves_of_piece(board, sq) <= 1)


def closed_files_count(board: chess.Board) -> int:
    """Files on which a white pawn is directly blocked by a black pawn (locked file, #213)."""
    n = 0
    for f in range(8):
        for r in range(7):
            s = chess.square(f, r)
            if board.piece_at(s) == chess.Piece(chess.PAWN, chess.WHITE) and board.piece_at(chess.square(f, r + 1)) == chess.Piece(chess.PAWN, chess.BLACK):
                n += 1
                break
    return n


def net_control(board: chess.Board, us: chess.Color, sq: chess.Square) -> int:
    return len(board.attackers(us, sq)) - len(board.attackers(not us, sq))


def net_king_quadrant_control(board: chess.Board, us: chess.Color) -> float:
    """#85: sum over 64 squares of attackers(us) - attackers(them), x3 on the enemy king's quadrant."""
    ek = board.king(not us)
    total = 0.0
    for sq in chess.SQUARES:
        w = 1.0
        if ek is not None and (chess.square_file(sq) >= 4) == (chess.square_file(ek) >= 4) and (chess.square_rank(sq) >= 4) == (chess.square_rank(ek) >= 4):
            w = 3.0
        total += w * net_control(board, us, sq)
    return total


# ---- further primitives used by the motif layer ----
def is_passed(board: chess.Board, sq: chess.Square, color: chess.Color) -> bool:
    f = chess.square_file(sq)
    for s in board.pieces(chess.PAWN, not color):
        if abs(chess.square_file(s) - f) <= 1 and rel_rank(color, s) > rel_rank(color, sq):
            return False
    return True


def file_state(board: chess.Board, f: int, color: chess.Color) -> str:
    own = any(chess.square_file(s) == f for s in board.pieces(chess.PAWN, color))
    opp = any(chess.square_file(s) == f for s in board.pieces(chess.PAWN, not color))
    return "closed" if own else ("open" if not opp else "semi")


def king_ring_attack_count(board: chess.Board, us: chess.Color) -> int:
    """#3: total (attacker, ring-square) incidences of `us` on the enemy king's 8 neighbours."""
    return sum(len(board.attackers(us, s)) for s in king_ring_squares(board.king(not us)))


def shield_pawns(board: chess.Board, color: chess.Color) -> int:
    """Own pawns on the three files around the king, one or two ranks in front."""
    k = board.king(color)
    if k is None:
        return 0
    kf = chess.square_file(k)
    return sum(1 for s in board.pieces(chess.PAWN, color) if abs(chess.square_file(s) - kf) <= 1 and 1 <= rel_rank(color, s) - rel_rank(color, k) <= 2)


def king_luft(board: chess.Board, color: chess.Color) -> int:
    """Flight squares of `color`'s king not on its back rank and not occupied by own pieces (back-rank #22/#91)."""
    k = board.king(color)
    if k is None:
        return 0
    return sum(1 for s in king_ring_squares(k) if rel_rank(color, s) > rel_rank(color, k) and not (board.occupied_co[color] & chess.BB_SQUARES[s]))


def safe_king_moves(board: chess.Board, color: chess.Color) -> int:
    """Legal king moves for `color` (on a copy with `color` to move)."""
    b = board if board.turn == color else _with_turn(board, color)
    k = b.king(color)
    return sum(1 for m in b.legal_moves if m.from_square == k)


def relative_pins(board: chess.Board, us: chess.Color) -> int:
    """Enemy pieces pinned by `us` to the king (absolute) or to a more valuable enemy piece behind (relative)."""
    them = not us
    n = 0
    for sq, p in board.piece_map().items():
        if p.color != them or p.piece_type == chess.KING:
            continue
        if board.is_pinned(them, sq):
            n += 1
            continue
        for a in board.attackers(us, sq):
            ap = board.piece_at(a)
            if ap.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN):
                continue
            ray = chess.ray(a, sq)
            if not ray:
                continue
            between_after = [s for s in chess.SquareSet(ray) if s != a and s != sq and chess.square_distance(a, s) > chess.square_distance(a, sq)
                             and (chess.square_file(s) - chess.square_file(a)) * (chess.square_file(sq) - chess.square_file(a)) >= 0
                             and (chess.square_rank(s) - chess.square_rank(a)) * (chess.square_rank(sq) - chess.square_rank(a)) >= 0]
            for s in sorted(between_after, key=lambda x: chess.square_distance(sq, x)):
                q = board.piece_at(s)
                if q is None:
                    continue
                if q.color == them and PIECE_VALUES[q.piece_type] > PIECE_VALUES[p.piece_type]:
                    n += 1
                break
            else:
                continue
            break
    return n


def hanging_pieces(board: chess.Board, color: chess.Color, min_value: int = 3) -> List[chess.Square]:
    return [sq for sq, p in board.piece_map().items() if p.color == color and p.piece_type != chess.KING
            and PIECE_VALUES[p.piece_type] >= min_value and is_square_hanging(board, sq, color)]


def pawn_islands(board: chess.Board, color: chess.Color) -> int:
    files = sorted({chess.square_file(s) for s in board.pieces(chess.PAWN, color)})
    return sum(1 for i, f in enumerate(files) if i == 0 or files[i - 1] != f - 1)


def castled_side(board: chess.Board, color: chess.Color) -> Optional[str]:
    k = board.king(color)
    if k is None or rel_rank(color, k) > 2:
        return None
    f = chess.square_file(k)
    return "K" if f >= 6 else ("Q" if f <= 2 else None)


def non_pawn_pieces(board: chess.Board) -> int:
    return sum(1 for p in board.piece_map().values() if p.piece_type not in (chess.PAWN, chess.KING))
