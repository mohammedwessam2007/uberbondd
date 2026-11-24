"""Opening-pattern primitives for #27 #61 #62 #63 #218 (exact move-sequence recognition on the real game record)."""
import chess

GAMBITS = {  # prefix (uci, space separated) -> our move completing the named sharp system
    "e2e4 e7e5": ["f2f4", "b1c3"],            # King's Gambit, Vienna
    "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3": ["g7g6"],  # Dragon
    "d2d4": ["f7f5"],                         # Dutch
    "d2d4 d7d5 c2c4": ["e7e5"],               # Albin Countergambit
    "": [],
}


def _hist(board: chess.Board) -> str:
    return " ".join(m.uci() for m in board.move_stack)


def gambit_bonus(board: chess.Board, move: chess.Move) -> float:
    return 1.0 if move.uci() in GAMBITS.get(_hist(board), []) else 0.0


def move2_offbeat(board: chess.Board, move: chess.Move) -> float:
    h = _hist(board).split()
    if len(h) != 2 or board.turn != chess.WHITE:
        return 0.0
    u = move.uci()
    if u == "b2b4" or (h == ["d2d4", "g8f6"] and u == "c1g5") or u in ("h2h4", "a2a4", "g2g4"):
        return 1.0
    return 0.0


def anti_london(board: chess.Board, move: chess.Move) -> float:
    h = _hist(board).split()
    return 1.0 if h[:3] == ["d2d4", "d7d5", "c1f4"] and len(h) <= 7 and board.turn == chess.BLACK and move.uci() in ("c7c5", "d8b6") else 0.0


def wing_gambit(board: chess.Board, move: chess.Move) -> float:
    h = _hist(board).split()
    return 1.0 if h[:2] == ["e2e4", "c7c5"] and len(h) <= 4 and move.uci() == "b2b4" else 0.0


def _shape(board: chess.Board, move: chess.Move) -> str:
    p = board.piece_type_at(move.from_square)
    f, d = chess.square_file(move.to_square), abs(chess.square_rank(move.to_square) - chess.square_rank(move.from_square))
    if p == chess.PAWN and f in (0, 1, 6, 7) and d == 2:
        return "flank_thrust"
    if p == chess.QUEEN:
        return "early_queen"
    if p == chess.BISHOP and chess.square_name(move.to_square) in ("g2", "b2", "g7", "b7"):
        return "fianchetto"
    if p == chess.PAWN and board.is_capture(move) is False and chess.square_file(move.to_square) in (1, 5) and d == 2:
        return "gambit_pawn"
    return ""


def classify_motif(opp_moves) -> str:
    b = chess.Board()
    shapes = []
    # opponent moves are replayed on a fresh board interleaved with null moves (only their shapes matter)
    for u in opp_moves:
        m = chess.Move.from_uci(u)
        if b.piece_at(m.from_square) is None:
            b.turn = not b.turn
        if m in b.legal_moves:
            shapes.append(_shape(b, m))
            b.push(m)
            b.push(chess.Move.null())
    shapes = [s for s in shapes if s]
    return max(set(shapes), key=shapes.count) if shapes else ""


def move_shape(board: chess.Board, move: chess.Move) -> str:
    return _shape(board, move)
