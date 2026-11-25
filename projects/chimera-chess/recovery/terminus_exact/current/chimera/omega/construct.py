"""LEVEL-2 construction potentials (#172 terminal-motif trajectory, #176 nightmare endgame router).
Potential-based shaping: the motif reward is Phi(next) - Phi(now), so a move earns credit only for CREATING prerequisites of a
rare terminal motif. Prerequisites are the exact board conditions the terminal predicate needs (castling mate, en-passant mate,
Judas smother, bare king + one blocked pawn). Phi values are small (<= ~2) so they never outweigh evaluation."""
import chess

from chimera.omega import features as F


def castle_mate_prereq(b: chess.Board, us: chess.Color) -> float:
    """O-O(-O)#: our king still has the right, path between king and rook clear, enemy king on/near our rook's landing file
    along our back-rank-adjacent region (enemy king on rank 1-2 relative to us near d/f file)."""
    phi = 0.0
    ek = b.king(not us)
    for side, rf in ((chess.BB_H1 if us else chess.BB_H8, 5), (chess.BB_A1 if us else chess.BB_A8, 3)):
        has = b.has_kingside_castling_rights(us) if rf == 5 else b.has_queenside_castling_rights(us)
        if not has or ek is None:
            continue
        phi += 0.3
        if F.rel_rank(us, ek) <= 2 and abs(chess.square_file(ek) - rf) <= 1:
            phi += 1.0
    return phi


def ep_mate_prereq(b: chess.Board, us: chess.Color) -> float:
    """e.p.#: our pawn on relative rank 5 adjacent to an enemy pawn's file that can still double-step, enemy king nearby."""
    ek = b.king(not us)
    if ek is None:
        return 0.0
    phi = 0.0
    for s in b.pieces(chess.PAWN, us):
        if F.rel_rank(us, s) != 5:
            continue
        for df in (-1, 1):
            f = chess.square_file(s) + df
            if 0 <= f <= 7:
                start = chess.square(f, 6 if us else 1)
                if b.piece_at(start) == chess.Piece(chess.PAWN, not us) and chess.square_distance(ek, chess.square(f, 5 if us else 2)) <= 2:
                    phi += 0.8
    return min(phi, 1.6)


def judas_prereq(b: chess.Board, us: chess.Color) -> float:
    ek = b.king(not us)
    if ek is None:
        return 0.0
    own = sum(1 for s in F.king_ring_squares(ek) if b.color_at(s) == (not us))
    return 0.25 * own


def terminal_potential(b: chess.Board, us: chess.Color) -> float:
    return castle_mate_prereq(b, us) + ep_mate_prereq(b, us) + judas_prereq(b, us)


def nightmare_potential(b: chess.Board, us: chess.Color) -> float:
    """Bare king + 1 blocked pawn (#219 state) or a pawn on the 7th that could underpromote (#186)."""
    them = not us
    opp = [p for p in b.piece_map().values() if p.color == them and p.piece_type != chess.KING]
    phi = 0.0
    if len(opp) == 1 and opp[0].piece_type == chess.PAWN:
        ps = next(iter(b.pieces(chess.PAWN, them)))
        blocked = b.piece_at(ps + (-8 if them == chess.WHITE else 8) if 0 <= ps + (-8 if them == chess.WHITE else 8) < 64 else ps) is not None
        phi += 1.0 + (0.5 if blocked else 0.0)
    phi += 0.5 * sum(1 for s in b.pieces(chess.PAWN, us) if F.rel_rank(us, s) == 7)
    return phi


def immediate_mates(board, legal=None):
    mates = []
    for move in board.legal_moves if legal is None else legal:
        if board.gives_check(move):
            after = board.copy(stack=False)
            after.push(move)
            if after.is_checkmate():
                mates.append(move)
    return mates


def bounded_mate(board, attacker, plies=5, node_limit=512):
    """Prove mate against all defenses or return False, including on exhaustion."""
    nodes = 0

    def prove(remaining):
        nonlocal nodes
        nodes += 1
        if nodes > node_limit:
            return False
        if board.is_checkmate():
            return board.turn != attacker
        if not remaining or board.is_insufficient_material() or board.is_seventyfive_moves() or board.is_fivefold_repetition():
            return False
        attacking = board.turn == attacker
        if not attacking and (board.can_claim_fifty_moves() or board.can_claim_threefold_repetition()):
            return False
        legal = list(board.legal_moves)
        if not legal:
            return False
        if attacking and immediate_mates(board, legal):
            return True
        if remaining <= 1:
            return False
        if attacking:
            legal.sort(key=lambda move: not board.gives_check(move))
        for move in legal:
            board.push(move)
            try:
                wins = prove(remaining - 1)
            finally:
                board.pop()
            if wins == attacking:
                return wins
            if nodes > node_limit:
                return False
        return not attacking

    return prove(plies)
