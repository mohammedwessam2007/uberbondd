"""CHIMERA Ω∞ motif registry: one distinct predicate per CODEX220 idea (document A §4, manual §4).

Every motif is a function f(ctx) -> float returning the PDF's utility contribution (0.0 when it does not fire), with the
PDF coefficient as its default weight. `needs` declares the evidence a motif consumes so the runtime (mind.py) can route
expensive work only where it is useful (#180): 'eval' (backend score of the candidate), 'replies' (backend scores of
opponent replies on the resulting board), 'maia' (genuine Maia3 reply probabilities), 'history' (game record / match
state), 'clock' (UCI clocks). `level` is RECOGNITION / CONSTRUCTION (rewards preparatory prerequisites) / VERIFICATION
(requires backend confirmation). Utilities are in the PDF's pawn-like units.

Restricted IDs (anti-detection statistics, fabricated human timing, review-confusion) are NOT executable: they live in
RESTRICTED with their reason and are preserved verbatim in canon/PDF_REQUIREMENTS_220.json.
"""
import math
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Set

import chess

from chimera.omega import features as F

V = F.PIECE_VALUES


@dataclass
class ReplyInfo:
    maia: Dict[str, float] = field(default_factory=dict)        # opponent reply -> Maia3 probability on next board
    maia_prior: Dict[str, float] = field(default_factory=dict)  # opponent distribution if we passed (null move), for #171
    evals: Dict[str, float] = field(default_factory=dict)       # opponent reply -> eval (OUR POV, cp) after the reply
    shallow_d3: Optional[float] = None                           # OUR POV eval of next board at depth 3 (#41)
    deep_d5: Optional[float] = None                              # OUR POV eval of next board at depth 5 (#41)
    static: Optional[float] = None                               # OUR POV static eval of next board (#32)


@dataclass
class MatchState:
    checks_given: int = 0
    last_moved_to: Optional[int] = None
    zombie_streak: int = 0
    our_moves: List[str] = field(default_factory=list)
    opp_moves: List[str] = field(default_factory=list)
    opp_cp_drops: List[float] = field(default_factory=list)   # opponent's eval loss on each of their moves (our backend)
    opp_think_frac: Optional[float] = None                     # fraction of their clock spent on the last move
    opp_clock_s: Optional[float] = None
    declined_sac: bool = False                                 # our last move offered material and it was declined
    repetition_used: int = 0
    last_only_move: bool = False

    def reset(self):
        self.__init__()


@dataclass
class Ctx:
    board: chess.Board
    move: chess.Move
    nb: chess.Board
    eval_cp: Optional[float] = None
    best_cp: Optional[float] = None
    cand: Dict[str, float] = field(default_factory=dict)
    reply: Optional[ReplyInfo] = None
    state: MatchState = field(default_factory=MatchState)

    @property
    def us(self) -> chess.Color:
        return self.board.turn

    @property
    def them(self) -> chess.Color:
        return not self.board.turn

    @property
    def ply(self) -> int:
        return self.board.ply()

    @property
    def piece(self) -> chess.Piece:
        return self.board.piece_at(self.move.from_square)

    @property
    def is_capture(self) -> bool:
        return self.board.is_capture(self.move)

    @property
    def gives_check(self) -> bool:
        return self.nb.is_check()

    @property
    def quiet(self) -> bool:
        return not self.is_capture and not self.gives_check and not self.move.promotion

    def ev(self, default: float = 0.0) -> float:
        return self.eval_cp if self.eval_cp is not None else default

    def sac_value(self) -> int:
        """Static material we put en prise / give: value of moved piece if left hanging on its destination minus capture."""
        cap = V[self.board.piece_type_at(self.move.to_square)] if self.is_capture and not self.board.is_en_passant(self.move) else (1 if self.board.is_en_passant(self.move) else 0)
        moved = V[self.move.promotion or self.piece.piece_type]
        if F.is_square_hanging(self.nb, self.move.to_square, self.us) or (self.nb.attackers(self.them, self.move.to_square) and moved > cap and not self.nb.attackers(self.us, self.move.to_square)):
            return moved - cap
        return 0


@dataclass
class Motif:
    n: int
    name: str
    weight: float
    fn: Callable[[Ctx], float]
    needs: Set[str]
    level: str
    group: str


REGISTRY: Dict[int, Motif] = {}
RESTRICTED: Dict[int, str] = {}


def motif(n, name, weight, needs=(), level="RECOGNITION", group="positional"):
    def deco(fn):
        REGISTRY[n] = Motif(n, name, weight, fn, set(needs), level, group)
        return fn
    return deco


def restricted(n, reason):
    RESTRICTED[n] = reason


# ============================================================ PHASE I (#1-#36)
def _drawish(nb: chess.Board) -> bool:
    return nb.is_stalemate() or nb.can_claim_fifty_moves() or nb.is_repetition(3) or nb.is_insufficient_material()


@motif(1, "Negative Draw Contempt", -1.20, ["eval", "history"], group="anti-draw")
def m001(c):  # -120 cp when the move leads to repetition/stalemate/50-move draw while eval >= -80
    # V3 fix: 'leads to repetition' includes re-entering an already-seen position (2-fold), from which the opponent can complete
    # the threefold; the gauntlet showed 6/6 PDF_FAITHFUL draws were threefold repetitions with the 3-fold-only test.
    return 1.0 if c.ev() >= -80 and (_drawish(c.nb) or c.nb.is_repetition(2)) else 0.0


@motif(2, "Piece-Mobility Multiplier", 0.06)
def m002(c):
    return float(sum(F.pseudo_moves_of(c.nb, s) for pt in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN) for s in c.nb.pieces(pt, c.us)))


@motif(3, "King-Ring Attack Density", 0.85, group="attack")
def m003(c):  # per attacking ray onto the 8 squares around the enemy king (gain over the pre-move board)
    return float(max(0, F.king_ring_attack_count(c.nb, c.us) - F.king_ring_attack_count(c.board, c.us)))


@motif(4, "Early Queen-Trade Veto", -2.80, ["eval"])
def m004(c):
    if c.ply >= 24 or not c.is_capture or c.board.piece_type_at(c.move.to_square) != chess.QUEEN or c.piece.piece_type != chess.QUEEN:
        return 0.0
    gain = c.ev() - (c.best_cp if c.best_cp is not None else c.ev())
    return 0.0 if c.ev() >= 220 and gain >= 0 else 1.0


@motif(5, "Material-Imbalance Seeker", 1.40)
def m005(c):
    return 1.0 if _asymmetric(c.nb) and not _asymmetric(c.board) else 0.0


def _asymmetric(b):
    cnt = lambda col: tuple(len(b.pieces(pt, col)) for pt in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN))
    w, k = cnt(chess.WHITE), cnt(chess.BLACK)
    return (w[3] != k[3]) or (w[2] != k[2]) or (w[0] + w[1] != k[0] + k[1])


@motif(6, "Open-File Rook Magnet", 1.0)
def m006(c):
    if c.piece.piece_type != chess.ROOK:
        return 0.0
    st = F.file_state(c.nb, chess.square_file(c.move.to_square), c.us)
    return {"open": 1.25, "semi": 0.75}.get(st, 0.0)


@motif(7, "Bishop-Pair Preservation", -1.10, ["replies"], level="VERIFICATION")
def m007(c):
    pawns = chess.popcount(c.board.pawns)
    if (pawns >= 10 or len(c.board.pieces(chess.BISHOP, c.us)) != 2
            or c.piece.piece_type != chess.BISHOP or not c.is_capture or not c.reply or not c.reply.evals):
        return 0.0
    best = min(c.reply.evals.values())
    return float(any(value == best and chess.Move.from_uci(uci).to_square == c.move.to_square
                     and chess.Move.from_uci(uci) in c.nb.legal_moves
                     for uci, value in c.reply.evals.items()))


@motif(8, "Passed-Pawn Escalator", 1.0)
def m008(c):
    if c.piece.piece_type != chess.PAWN or c.move.promotion or not F.is_passed(c.nb, c.move.to_square, c.us):
        return 0.0
    return {5: 0.60, 6: 1.40, 7: 2.90}.get(F.rel_rank(c.us, c.move.to_square), 0.0)


@motif(9, "Pin & X-Ray Detector", 1.15, group="tactic")
def m009(c):
    return float(max(0, F.relative_pins(c.nb, c.us) - F.relative_pins(c.board, c.us)))


@motif(10, "Multi-Target Fork Map", 1.50, group="tactic")
def m010(c):
    mv = V[c.move.promotion or c.piece.piece_type]
    targets = [s for s in c.nb.attacks(c.move.to_square) if (p := c.nb.piece_at(s)) and p.color == c.them and (V[p.piece_type] >= mv or p.piece_type == chess.KING)]
    return 1.0 if len(targets) >= 2 else 0.0


@motif(11, "Sacrifice Horizon Gate", 1.0, ["eval"], level="VERIFICATION", group="sacrifice")
def m011(c):  # admission marker: static drop 1-3 pawns accepted only with backend eval >= -35 (verified again in mind.py)
    sv = c.sac_value()
    return 1.0 if 1 <= sv <= 3 and c.ev(-999) >= -35 else 0.0


@motif(12, "Perpetual-Check Blocker", -1.0, ["eval", "history"], group="anti-draw")
def m012(c):  # initiating a 3-cycle checking loop: our check repeats a position already reached after our check
    if not c.gives_check or c.ev() <= -150:
        return 0.0
    return 1.0 if c.nb.is_repetition(2) else 0.0


@motif(13, "Flank Pawn-Storm Engine", 1.35, group="attack")
def m013(c):
    if c.piece.piece_type != chess.PAWN or chess.square_file(c.move.to_square) not in (5, 6, 7):
        return 0.0
    ek = c.board.king(c.them)
    return 1.0 if ek is not None and chess.square_file(ek) >= 5 and 4 <= F.rel_rank(c.us, c.move.to_square) <= 6 else 0.0


@motif(14, "Speculative Exchange Sac", 2.40, ["eval"], level="VERIFICATION", group="sacrifice")
def m014(c):
    if c.piece.piece_type != chess.ROOK or not c.is_capture or c.board.piece_type_at(c.move.to_square) not in (chess.KNIGHT, chess.BISHOP):
        return 0.0
    if not c.nb.attackers(c.them, c.move.to_square) or c.ev(-999) < -25:
        return 0.0
    ek = c.board.king(c.them)  # shatters king pawn cover: captured piece was adjacent to the enemy king or shield pawns drop
    return 1.0 if ek is not None and chess.square_distance(ek, c.move.to_square) <= 2 else 0.0


@motif(15, "King-Safety Asymmetry", 1.20, group="safety")
def m015(c):
    gap = lambda b: (F.shield_pawns(b, c.us) - len(F.king_ring_squares(b.king(c.us))) * 0) - F.shield_pawns(b, c.them)
    return 1.0 if gap(c.nb) > gap(c.board) else 0.0


@motif(16, "Opposite-Side Castling", 2.20, ["eval"])
def m016(c):
    if not c.board.is_castling(c.move) or c.ev() < -50:
        return 0.0
    mine = "Q" if c.board.is_queenside_castling(c.move) else "K"
    theirs = F.castled_side(c.board, c.them)
    return 1.0 if theirs and theirs != mine else 0.0


@motif(17, "Central Tension Holder", -0.90)
def m017(c):  # releasing central pawn tension: a central pawn capture/advance that resolves a pawn-pawn contact
    if c.piece.piece_type != chess.PAWN or chess.square_file(c.move.from_square) not in (2, 3, 4, 5):
        return 0.0
    tension = lambda b: sum(1 for s in b.pieces(chess.PAWN, c.us) if any(b.piece_at(t) == chess.Piece(chess.PAWN, c.them) for t in b.attacks(s)))
    return 1.0 if tension(c.nb) < tension(c.board) and not c.gives_check else 0.0


@motif(18, "Knight Outpost Anchor", 1.30)
def m018(c):
    to = c.move.to_square
    if c.piece.piece_type != chess.KNIGHT or F.rel_rank(c.us, to) not in (5, 6):
        return 0.0
    supported = any(c.nb.piece_at(s) == chess.Piece(chess.PAWN, c.us) for s in c.nb.attackers(c.us, to))
    f = chess.square_file(to)
    assailable = any(abs(chess.square_file(s) - f) == 1 and F.rel_rank(c.us, s) > F.rel_rank(c.us, to) for s in c.nb.pieces(chess.PAWN, c.them))
    return 1.0 if supported and not assailable else 0.0


@motif(19, "Color-Complex Domination", 1.10)
def m019(c):
    if c.piece.piece_type not in (chess.BISHOP, chess.QUEEN):
        return 0.0
    tb = c.nb.pieces(chess.BISHOP, c.them)
    shade = lambda s: (chess.square_file(s) + chess.square_rank(s)) % 2
    if len(tb) != 1:
        return 0.0
    missing = 1 - shade(next(iter(tb)))
    return 1.0 if shade(c.move.to_square) == missing else 0.0


@motif(20, "Tempo Development Bias", 1.05)
def m020(c):
    if c.ply > 16 or c.piece.piece_type not in (chess.KNIGHT, chess.BISHOP) or F.rel_rank(c.us, c.move.from_square) != 1:
        return 0.0
    return 1.0 if any((p := c.nb.piece_at(s)) and p.color == c.them and p.piece_type != chess.PAWN for s in c.nb.attacks(c.move.to_square)) else 0.0


@motif(21, "Queen Infiltration Magnet", 1.45, group="attack")
def m021(c):
    if c.piece.piece_type != chess.QUEEN:
        return 0.0
    targets = ["h5", "g4", "f6", "d6"] if c.us == chess.WHITE else ["h4", "g5", "f3", "d3"]
    ek = c.nb.king(c.them)
    return 1.0 if chess.square_name(c.move.to_square) in targets and ek is not None and chess.square_distance(ek, c.move.to_square) <= 3 else 0.0


@motif(22, "Back-Rank Weakness Hunter", 1.60, group="attack")
def m022(c):
    if c.piece.piece_type not in (chess.ROOK, chess.QUEEN):
        return 0.0
    ek = c.nb.king(c.them)
    if ek is None or F.rel_rank(c.them, ek) != 1 or F.king_luft(c.nb, c.them) != 0:
        return 0.0
    back = chess.BB_RANKS[chess.square_rank(ek)]
    return 1.0 if c.nb.attacks(c.move.to_square) & back else 0.0


@motif(23, "Deflection & Decoy Scorer", 1.75, group="tactic")
def m023(c):  # forcing move attacking an enemy defender that is the sole defender of another attacked piece/square
    if not (c.gives_check or c.is_capture or c.nb.attacks(c.move.to_square) & c.nb.occupied_co[c.them]):
        return 0.0
    for d in c.nb.attacks(c.move.to_square):
        p = c.nb.piece_at(d)
        if not p or p.color != c.them or p.piece_type == chess.KING:
            continue
        for t in c.nb.attacks(d):
            q = c.nb.piece_at(t)
            if q and q.color == c.them and c.nb.attackers(c.us, t) and c.nb.attackers(c.them, t) == chess.SquareSet(chess.BB_SQUARES[d]):
                return 1.0
    return 0.0


@motif(24, "Clearance Sacrifice Opener", 2.10, ["eval"], level="VERIFICATION", group="sacrifice")
def m024(c):  # sacrifice of a blocking unit that opens a line for our heavy piece / bishop
    if c.sac_value() < 1 or c.ev(-999) < -35:
        return 0.0
    for s in c.board.pieces(chess.ROOK, c.us) | c.board.pieces(chess.QUEEN, c.us) | c.board.pieces(chess.BISHOP, c.us):
        if len(c.nb.attacks(s)) > len(c.board.attacks(s)) and chess.BB_SQUARES[c.move.from_square] & chess.BB_RAYS[s][c.move.from_square]:
            return 1.0
    return 0.0


# #25 Boltzmann softmax: implemented in mind.select (control), #26 search-time jitter: restricted
restricted(26, "Stated purpose: defeat fixed-depth forensic signatures in multi-game audits (anti-detection). Archived; deterministic/seeded search is used instead.")


@motif(27, "Offbeat Opening Router", 1.0, ["history"], group="opening")
def m027(c):
    if c.ply >= 8:
        return 0.0
    from chimera.omega.openings import gambit_bonus
    return gambit_bonus(c.board, c.move)


restricted(28, "Fabricated human reaction timing (0.35-0.70 s recaptures). Archived: CHIMERA never delays to imitate human timing.")
# #29 critical-branch extension and #30 tablebase veto: controls in mind.py (time allocation / no tablebases loaded)


@motif(31, "Passive Prophylaxis Veto", -1.25)
def m031(c):
    names = {"a2a3", "h2h3", "a7a6", "h7h6"}
    if c.move.uci() not in names:
        return 0.0
    threat = any(c.board.is_attacked_by(c.them, s) for s in c.board.pieces(chess.KNIGHT, c.us) | c.board.pieces(chess.BISHOP, c.us))
    return 0.0 if threat else 1.0


@motif(32, "Zugzwang Squeeze Scorer", 2.60, ["replies"], level="VERIFICATION")
def m032(c):  # interpretation: every searched opponent reply is >= 80 cp worse for them than the static eval of next board
    r = c.reply
    if not r or r.static is None or not r.evals or len(r.evals) < min(3, c.nb.legal_moves.count()):
        return 0.0
    return 1.0 if min(r.evals.values()) >= r.static + 80 else 0.0


def _mate_neighbours_blocked(nb, king, color):
    return all((p := nb.piece_at(s)) and p.color == color for s in F.king_ring_squares(king))


@motif(33, "Smothered-Mate Matcher", 4.50, group="mate")
def m033(c):
    if not c.nb.is_checkmate():
        return 0.0
    ek = c.nb.king(c.them)
    checkers = c.nb.checkers()
    return 1.0 if len(checkers) == 1 and c.nb.piece_type_at(next(iter(checkers))) == chess.KNIGHT and _mate_neighbours_blocked(c.nb, ek, c.them) else 0.0


@motif(34, "Greek-Gift Amplifier", 3.20, ["eval"], level="VERIFICATION", group="sacrifice")
def m034(c):
    tgt = "h7" if c.us == chess.WHITE else "h2"
    return 1.0 if c.piece.piece_type == chess.BISHOP and chess.square_name(c.move.to_square) == tgt and c.is_capture and c.gives_check and c.ev(-999) >= 0 else 0.0


@motif(35, "Double-Check Line Opener", 3.40, group="tactic")
def m035(c):
    return 1.0 if len(c.nb.checkers()) >= 2 else 0.0


@motif(36, "Perpetual Escape Refusal", -1.0, ["eval"], group="anti-draw")
def m036(c):  # a king retreat that allows an immediate repetition/perpetual while a sharper winning line (best >= +100) exists
    if c.piece.piece_type != chess.KING or c.best_cp is None or c.best_cp < 100 or c.ev() >= c.best_cp - 10:
        return 0.0
    return 1.0 if any(c.nb.gives_check(m) for m in c.nb.legal_moves) else 0.0


# ============================================================ PHASE II (#37-#84)
@motif(37, "Maia-3 Policy Query", 0.0, ["maia"], group="human")
def m037(c):  # the query itself (weight 0): returns probability mass of Maia's #1 reply so traces show the policy was consulted
    return max(c.reply.maia.values()) if c.reply and c.reply.maia else 0.0


def _entropy(p):
    return -sum(x * math.log(x) for x in p.values() if x > 0)


@motif(38, "Human Reply Entropy", 1.40, ["maia"], group="human")
def m038(c):
    return _entropy(c.reply.maia) if c.reply and c.reply.maia else 0.0


@motif(39, "Counter-Intuitive Retreats", 1.85, ["eval"])
def m039(c):  # backward quiet move that keeps a hidden threat: our attacked-target count does not fall
    if not c.quiet or c.piece.piece_type in (chess.PAWN, chess.KING) or F.rel_rank(c.us, c.move.to_square) >= F.rel_rank(c.us, c.move.from_square):
        return 0.0
    threats = lambda b: sum(1 for s in chess.SQUARES if (p := b.piece_at(s)) and p.color == c.them and b.attackers(c.us, s))
    return 1.0 if threats(c.nb) >= max(1, threats(c.board)) and c.ev() >= (c.best_cp or 0) - 30 else 0.0


def _top_reply(c):
    if not c.reply or not c.reply.maia:
        return None, 0.0
    u = max(c.reply.maia, key=c.reply.maia.get)
    return u, c.reply.maia[u]


def _reply_loss(c, u):
    """Opponent's loss (cp) when playing u vs their best defence, from our searched reply evals."""
    if not c.reply or u not in c.reply.evals:
        return None
    base = min(c.reply.evals.values())
    return c.reply.evals[u] - base


@motif(40, "Natural-Recapture Traps", 3.10, ["maia", "replies"], level="VERIFICATION", group="human")
def m040(c):
    u, p = _top_reply(c)
    if u is None or p <= 0.45 or not c.nb.is_capture(chess.Move.from_uci(u)):
        return 0.0
    loss = _reply_loss(c, u)
    return 1.0 if loss is not None and loss >= 150 else 0.0


@motif(41, "Horizon-Effect Decoys", 2.40, ["replies"], level="VERIFICATION")
def m041(c):  # looks good for the opponent at depth 3, collapses at depth 5
    r = c.reply
    if not r or r.shallow_d3 is None or r.deep_d5 is None:
        return 0.0
    return 1.0 if r.shallow_d3 <= -30 and r.deep_d5 >= r.shallow_d3 + 150 else 0.0


@motif(42, "Time-Trouble Injector", 2.20, ["clock"], group="clock")
def m042(c):
    if c.state.opp_clock_s is None or c.state.opp_clock_s >= 45:
        return 0.0
    return min(1.0, c.nb.legal_moves.count() / 40.0)


# #43 rating-conditioned Maia: control (Maia elo inputs set from preset/UCI_Opponent) in mind.py
@motif(44, "Anti-Symmetry Deviator", 1.0)
def m044(c):  # bonus for breaking a symmetric pawn structure in the opening (unless #195 mirroring)
    if c.ply > 16:
        return 0.0
    sym = lambda b: {chess.square_mirror(s) for s in b.pieces(chess.PAWN, chess.WHITE)} == set(b.pieces(chess.PAWN, chess.BLACK))
    return 1.0 if sym(c.board) and not sym(c.nb) else 0.0


@motif(45, "Unfamiliar Pawn Structures", 1.35)
def m045(c):
    rare = lambda b: F.max_stacked_pawns_on_file(b, c.us) >= 3 or _benoni(b, c.us) or _hedgehog(b, c.us)
    return 1.0 if rare(c.nb) and not rare(c.board) else 0.0


def _benoni(b, col):
    d5, c4, e4 = ("d5", "c4", "e4") if col == chess.WHITE else ("d4", "c5", "e5")
    return all(b.piece_at(chess.parse_square(s)) == chess.Piece(chess.PAWN, col) for s in (d5, c4, e4))


def _hedgehog(b, col):
    sq = ("a3", "b3", "d3", "e3") if col == chess.WHITE else ("a6", "b6", "d6", "e6")
    return sum(b.piece_at(chess.parse_square(s)) == chess.Piece(chess.PAWN, col) for s in sq) >= 3


@motif(46, "Piece-Retention Multiplier", 1.15)
def m046(c):
    return 1.0 if c.board.fullmove_number > 20 and F.non_pawn_pieces(c.nb) >= 10 else 0.0


@motif(47, "Tactical Sharpness Index", 1.60, ["eval"])
def m047(c):  # variance across top-5 candidate evals (position-level, so it applies to every candidate equally)
    vals = sorted(c.cand.values(), reverse=True)[:5]
    if len(vals) < 3:
        return 0.0
    mu = sum(vals) / len(vals)
    return 1.0 if math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals)) >= 100 else 0.0


@motif(48, "Blunder-Inducing Quiet Move", 1.0, ["maia", "replies"], level="VERIFICATION", group="human")
def m048(c):
    u, _ = _top_reply(c)
    if not c.quiet or u is None:
        return 0.0
    loss = _reply_loss(c, u)
    return 1.0 if loss is not None and loss >= 100 else 0.0


@motif(49, "Think-Time Spike Tracker", 0.0, ["clock"], group="clock")
def m049(c):  # control signal: >25% of opponent's clock spent on last move -> mind.py multiplies complication weights by 1.35
    return 1.0 if c.state.opp_think_frac is not None and c.state.opp_think_frac > 0.25 else 0.0


@motif(50, "Post-Blunder Escalator", 2.30, ["history"], group="attack")
def m050(c):
    if not c.state.opp_cp_drops or c.state.opp_cp_drops[-1] <= 150:
        return 0.0
    trade = c.is_capture and c.board.piece_type_at(c.move.to_square) == c.piece.piece_type and c.nb.attackers(c.them, c.move.to_square)
    return 0.0 if trade else (1.0 if F.king_ring_attack_count(c.nb, c.us) > F.king_ring_attack_count(c.board, c.us) else 0.0)


@motif(51, "Low-Clock Complication 2x", 0.0, ["clock"], group="clock")
def m051(c):  # control: opponent clock < 30 s doubles #10 and #211 (applied in mind.py)
    return 1.0 if c.state.opp_clock_s is not None and c.state.opp_clock_s < 30 else 0.0


@motif(52, "Pre-Move Zwischenzug", 2.75)
def m052(c):  # opponent just captured; instead of the expected recapture we insert a check/threat first
    if not c.board.move_stack or not c.gives_check:
        return 0.0
    last = c.board.peek()
    prev = c.board.copy()
    prev.pop()
    if not prev.is_capture(last):
        return 0.0
    can_recapture = any(m.to_square == last.to_square for m in c.board.legal_moves if c.board.is_capture(m))
    return 1.0 if can_recapture and c.move.to_square != last.to_square else 0.0


restricted(53, "Fabricated human pacing (fast tactical moves vs 8-15 s quiet pauses). Archived.")


@motif(54, "False-Safety King Bait", 1.70, group="attack")
def m054(c):  # aim a diagonal/file at the enemy king zone while its shelter pawns are intact
    ek = c.nb.king(c.them)
    if ek is None or c.piece.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN) or F.shield_pawns(c.nb, c.them) < 3:
        return 0.0
    return 1.0 if chess.BB_RAYS[c.move.to_square][ek] and not (c.board.attacks(c.move.from_square) & chess.SquareSet(chess.BB_RAYS[c.move.from_square][ek])) else 0.0


@motif(55, "Trapped-Piece Slow Squeeze", 1.95)
def m055(c):  # an enemy piece is trapped (attacked, no safe moves); we do not capture it but add an attacker elsewhere
    trapped = [s for s in F.hanging_pieces(c.board, c.them) if F.legal_moves_of_piece(c.board, s) == 0]
    if not trapped or c.move.to_square in trapped:
        return 0.0
    still = all(c.nb.attackers(c.us, s) for s in trapped if c.nb.piece_at(s))
    return 1.0 if still and F.king_ring_attack_count(c.nb, c.us) + F.net_king_quadrant_control(c.nb, c.us) > F.king_ring_attack_count(c.board, c.us) + F.net_king_quadrant_control(c.board, c.us) else 0.0


@motif(56, "Poisoned-Pawn Temptation", 2.15, ["replies"], level="VERIFICATION")
def m056(c):
    names = ("b2", "g2") if c.us == chess.WHITE else ("b7", "g7")
    for n in names:
        s = chess.parse_square(n)
        if c.nb.piece_at(s) == chess.Piece(chess.PAWN, c.us) and not c.nb.attackers(c.us, s) and c.nb.attackers(c.them, s):
            for u, e in (c.reply.evals.items() if c.reply else []):
                if chess.Move.from_uci(u).to_square == s:
                    return 1.0 if _reply_loss(c, u) is not None and _reply_loss(c, u) >= 100 else 0.0
    return 0.0


@motif(57, "Zwischenzug Prioritizer", 2.85, group="tactic")
def m057(c):  # inside a capture sequence (last move was a capture) we play a check or a queen attack instead of recapturing
    if not c.board.move_stack or c.is_capture:
        return 0.0
    prev = c.board.copy(); last = prev.pop()
    if not prev.is_capture(last):
        return 0.0
    q = c.nb.pieces(chess.QUEEN, c.them)
    return 1.0 if c.gives_check or any(c.nb.is_attacked_by(c.us, s) for s in q) else 0.0


@motif(58, "Desperado Piece Maximizer", 2.10, group="tactic")
def m058(c):  # our piece cannot be saved (hanging, no safe square) -> capture the most material with it
    fr = c.move.from_square
    if c.piece.piece_type in (chess.PAWN, chess.KING) or not F.is_square_hanging(c.board, fr, c.us) or not c.is_capture:
        return 0.0
    safe = [m for m in c.board.legal_moves if m.from_square == fr and not F.is_square_hanging(_after(c.board, m), m.to_square, c.us)]
    if safe:
        return 0.0
    best = max((V[c.board.piece_type_at(m.to_square)] for m in c.board.legal_moves if m.from_square == fr and c.board.is_capture(m) and c.board.piece_type_at(m.to_square)), default=0)
    return 1.0 if c.board.piece_type_at(c.move.to_square) and V[c.board.piece_type_at(c.move.to_square)] == best else 0.0


def _after(b, m):
    x = b.copy(stack=False)
    x.push(m)
    return x


@motif(59, "Windmill Tactic Builder", 3.50, group="tactic")
def m059(c):  # rook gives discovered check from a bishop (or vice versa): R+B discovered-check battery
    if not c.gives_check or c.nb.is_attacked_by(c.us, c.nb.king(c.them)) is False:
        return 0.0
    chk = c.nb.checkers()
    disc = [s for s in chk if s != c.move.to_square]
    return 1.0 if disc and c.piece.piece_type in (chess.ROOK, chess.BISHOP) and any(c.nb.piece_type_at(s) in (chess.BISHOP, chess.ROOK, chess.QUEEN) for s in disc) else 0.0


@motif(60, "Undermining Chain Breaker", 1.80)
def m060(c):  # attack the base of an enemy pawn chain (a pawn defended by no pawn that defends another pawn)
    for s in c.nb.attacks(c.move.to_square):
        if c.nb.piece_at(s) == chess.Piece(chess.PAWN, c.them):
            defends_pawn = any(c.nb.piece_at(t) == chess.Piece(chess.PAWN, c.them) for t in c.nb.attacks(s))
            defended_by_pawn = any(c.nb.piece_type_at(d) == chess.PAWN for d in c.nb.attackers(c.them, s))
            if defends_pawn and not defended_by_pawn:
                return 1.0
    return 0.0


@motif(61, "Move-2 Offbeat Deviator", 1.0, ["history"], group="opening")
def m061(c):
    from chimera.omega.openings import move2_offbeat
    return move2_offbeat(c.board, c.move)


@motif(62, "Anti-London / Caro Disruptor", 1.50, ["history"], group="opening")
def m062(c):
    from chimera.omega.openings import anti_london
    return anti_london(c.board, c.move)


@motif(63, "Anti-Sicilian Wing Gambit", 1.75, ["history"], group="opening")
def m063(c):
    from chimera.omega.openings import wing_gambit
    return wing_gambit(c.board, c.move)


@motif(64, "Early Flank Space-Grabber", 1.65, group="opening")
def m064(c):
    if c.ply >= 10 or c.piece.piece_type != chess.PAWN or chess.square_file(c.move.to_square) not in (0, 7):
        return 0.0
    fian = any(c.board.piece_at(chess.parse_square(s)) == chess.Piece(chess.BISHOP, c.them) for s in (("g7", "b7") if c.us == chess.WHITE else ("g2", "b2")))
    return 1.0 if fian else 0.0


@motif(65, "Delayed-Castling Keeper", 1.25)
def m065(c):
    if c.board.fullmove_number > 12 or not c.board.is_castling(c.move):
        return 0.0
    closed = all(F.file_state(c.board, f, c.us) == "closed" for f in (3, 4))
    return -1.0 if closed else 0.0   # keeping flexibility == not castling yet: castling while centre closed is penalised


@motif(66, "Asymmetric Material Ratio", 1.90)
def m066(c):
    q = lambda b, col: len(b.pieces(chess.QUEEN, col)); r = lambda b, col: len(b.pieces(chess.ROOK, col))
    minors = lambda b, col: len(b.pieces(chess.KNIGHT, col)) + len(b.pieces(chess.BISHOP, col))
    b = c.nb
    qvrb = (q(b, c.us) != q(b, c.them)) and abs(r(b, c.us) - r(b, c.them)) >= 1 and minors(b, c.us) != minors(b, c.them)
    rrvq = (q(b, c.us) - q(b, c.them)) * (r(b, c.us) - r(b, c.them)) <= -2
    before = lambda x: (q(x, c.us) != q(x, c.them)) or (r(x, c.us) != r(x, c.them))
    return 1.0 if (qvrb or rrvq) and not before(c.board) else 0.0


@motif(67, "Knight-vs-Bishop Locker", 1.55)
def m067(c):
    if c.piece.piece_type != chess.PAWN or not c.nb.pieces(chess.KNIGHT, c.us) or not c.nb.pieces(chess.BISHOP, c.them) or c.nb.pieces(chess.BISHOP, c.us):
        return 0.0
    return 1.0 if F.closed_files_count(c.nb) > F.closed_files_count(c.board) else 0.0


@motif(68, "Double-Rook 7th-Rank Pig", 2.40, group="attack")
def m068(c):
    r7 = [s for s in c.nb.pieces(chess.ROOK, c.us) if F.rel_rank(c.us, s) == 7]
    r7b = [s for s in c.board.pieces(chess.ROOK, c.us) if F.rel_rank(c.us, s) == 7]
    return 1.0 if len(r7) >= 2 and len(r7b) < 2 else 0.0


@motif(69, "King-Walk Endgame Aggressor", 1.85)
def m069(c):
    if c.piece.piece_type != chess.KING or c.nb.pieces(chess.QUEEN, chess.WHITE) or c.nb.pieces(chess.QUEEN, chess.BLACK):
        return 0.0
    cen = lambda s: max(abs(chess.square_file(s) - 3.5), abs(chess.square_rank(s) - 3.5))
    return 1.0 if cen(c.move.to_square) < cen(c.move.from_square) else 0.0


@motif(70, "Pawn-Break Timing Engine", 1.45)
def m070(c):  # pawn break (pawn attacks an enemy pawn) executed when our pieces aiming at the target square are maximal
    if c.piece.piece_type != chess.PAWN:
        return 0.0
    tgt = [t for t in c.nb.attacks(c.move.to_square) if c.nb.piece_at(t) == chess.Piece(chess.PAWN, c.them)]
    if not tgt:
        return 0.0
    return 1.0 if max(len(c.nb.attackers(c.us, t)) for t in tgt) >= 2 else 0.0


@motif(71, "Prophylactic-Move Punisher", 1.60, ["history"])
def m071(c):
    if not c.board.move_stack:
        return 0.0
    last = c.board.peek().uci()
    if last not in ("a2a3", "h2h3", "a7a6", "h7h6"):
        return 0.0
    opp_wing = 0 if chess.square_file(c.board.peek().to_square) >= 4 else 7   # attack the opposite wing
    return 1.0 if abs(chess.square_file(c.move.to_square) - opp_wing) <= 2 and (c.nb.attacks(c.move.to_square) & c.nb.occupied_co[c.them]) else 0.0


@motif(72, "Counter-Gambit Acceptor", 1.0, ["eval"], group="opening")
def m072(c):  # accept an offered gambit pawn in the opening when sound (eval >= best - 30)
    if c.ply > 16 or not c.is_capture or c.board.piece_type_at(c.move.to_square) != chess.PAWN:
        return 0.0
    return 1.0 if c.ev() >= (c.best_cp or 0) - 30 and c.nb.attackers(c.them, c.move.to_square) == chess.SquareSet() else 0.0


restricted(73, "Low-leverage human fallback, explicitly the 'stealth core' to lower engine move-match statistics. Archived. (Human-policy research on low-leverage positions is done offline in lab/probes_human.py.)")
restricted(74, "Deliberate centipawn-loss calibration so ACPL matches human GMs (anti-detection). Archived.")
restricted(75, "Top-1 move-match ceiling governor against fair-play outlier thresholds. Archived.")
restricted(76, "Equal-top randomizer to match human TM% for screening. Archived (#25 softmax variety remains, unconditioned on detection metrics).")
restricted(77, "ASD band regulator against Regan scaled-difference screening. Archived.")
restricted(78, "Session style-weight drift to defeat cross-game statistical fingerprinting. Archived.")


# #79: control, see controls.CONTROLS


restricted(80, "Log-normal think-time generator to replicate human latency (fabricated human timing). Archived.")


@motif(81, "Eval-Bar Whiplash Limiter", -1.0, ["eval"], level="VERIFICATION", group="safety")
def m081(c):  # block moves dropping eval below -50 (gate) unless a verified trap exists (mind.py applies as hard gate)
    return 1.0 if c.eval_cp is not None and c.eval_cp < -50 else 0.0


@motif(82, "Mate-In-N Delay Obfuscator", 1.0, ["eval"], group="mate")
def m082(c):  # among mating continuations prefer creative nets (#144 ranker) over the shortest line: bonus for non-queen mating material
    if c.eval_cp is None or c.eval_cp < 90000:
        return 0.0
    return 0.5 if c.piece.piece_type in (chess.KNIGHT, chess.BISHOP, chess.PAWN, chess.KING) else 0.0


# #83: control, see controls.CONTROLS


restricted(161, "Live MM/ASD logger feeding the stealth governors (#75 #77 #84): screening-statistics telemetry. Archived.")
restricted(84, "Live Regan Z-score auditor clamping precision to stay under sanction thresholds (anti-detection). Archived.")


# ============================================================ PHASE III (#85-#148)
@motif(85, "8x8 Net-Control Tensor", 0.02, group="space")
def m085(c):
    return F.net_king_quadrant_control(c.nb, c.us) - F.net_king_quadrant_control(c.board, c.us)


@motif(86, "King Escape-Square Cut", 2.50, group="attack")
def m086(c):
    n = F.safe_king_moves(c.nb, c.them)
    return 1.0 if n <= 1 and F.safe_king_moves(c.board, c.them) > n and not c.nb.is_checkmate() else 0.0


@motif(87, "Heavy-Piece Restriction", 0.25, group="space")
def m087(c):
    mob = lambda b: sum(F.legal_moves_of_piece(b, s) for pt in (chess.QUEEN, chess.ROOK) for s in b.pieces(pt, c.them))
    return float(max(0, mob(c.board) - mob(c.nb)))


@motif(88, "Cross-Fire Intersection", 1.90, group="attack")
def m088(c):
    ek = c.nb.king(c.them)
    for s in F.king_ring_squares(ek):
        kinds = {c.nb.piece_type_at(a) for a in c.nb.attackers(c.us, s)}
        if {chess.BISHOP, chess.QUEEN, chess.ROOK} <= kinds:
            return 1.0
    return 0.0


@motif(89, "Pawn-Chain Wedge Lock", 1.65)
def m089(c):
    return 1.0 if c.piece.piece_type == chess.PAWN and F.closed_files_count(c.nb) >= 3 and F.closed_files_count(c.nb) > F.closed_files_count(c.board) else 0.0


@motif(90, "Outpost Star Topology", 1.40)
def m090(c):
    if c.piece.piece_type not in (chess.KNIGHT, chess.BISHOP):
        return 0.0
    return 1.0 if sum(1 for s in c.nb.attacks(c.move.to_square) if F.rel_rank(c.us, s) >= 5) >= 6 else 0.0


@motif(91, "Back-Rank Oxygen Cut", 1.85, group="attack")
def m091(c):
    sqs = ("g7", "h7", "f7") if c.us == chess.WHITE else ("g2", "h2", "f2")
    ek = c.nb.king(c.them)
    if ek is None or F.rel_rank(c.them, ek) != 1:
        return 0.0
    ctrl = lambda b: sum(1 for n in sqs if b.is_attacked_by(c.us, chess.parse_square(n)))
    return 1.0 if ctrl(c.nb) >= 2 and ctrl(c.nb) > ctrl(c.board) else 0.0


@motif(92, "Center-Vacuum Envelopment", 1.70, group="space")
def m092(c):
    ring = [chess.parse_square(n) for n in ("c4", "c5", "f4", "f5")]
    cen = [chess.parse_square(n) for n in ("d4", "e4", "d5", "e5")]
    ok = lambda b: all(b.is_attacked_by(c.us, s) for s in ring) and all(b.piece_at(s) is None or b.color_at(s) != c.us for s in cen)
    return 1.0 if ok(c.nb) and not ok(c.board) else 0.0


@motif(93, "Coordination Triangle", 0.95)
def m093(c):  # three of our pawns/minors protecting each other in a closed triangle including the moved piece
    us = [s for s in c.nb.pieces(chess.PAWN, c.us) | c.nb.pieces(chess.KNIGHT, c.us) | c.nb.pieces(chess.BISHOP, c.us)]
    m = c.move.to_square
    if m not in us:
        return 0.0
    prot = lambda a, b: b in c.nb.attacks(a)
    for a in us:
        for b in us:
            if len({a, b, m}) == 3 and (prot(m, a) or prot(a, m)) and (prot(a, b) or prot(b, a)) and (prot(b, m) or prot(m, b)):
                return 1.0
    return 0.0


@motif(94, "Overloaded-Defender Trap", 2.30, group="tactic")
def m094(c):
    for s in c.nb.attacks(c.move.to_square):
        p = c.nb.piece_at(s)
        if not p or p.color != c.them or p.piece_type == chess.KING:
            continue
        duties = [t for t in c.nb.attacks(s) if (q := c.nb.piece_at(t)) and q.color == c.them and c.nb.is_attacked_by(c.us, t) and len(c.nb.attackers(c.them, t)) == 1]
        if len(duties) >= 2:
            return 1.0
    return 0.0


def _sliders(b, col):
    return [s for pt in (chess.BISHOP, chess.ROOK, chess.QUEEN) for s in b.pieces(pt, col)]


@motif(95, "Interference Motif Scorer", 2.80, group="tactic")
def m095(c):  # our piece lands on a square that blocks two enemy heavy-piece/bishop lines (each previously passing through it)
    to = c.move.to_square
    cut = 0
    for s in _sliders(c.board, c.them):
        if to in c.board.attacks(s) and len(c.nb.attacks(s)) < len(c.board.attacks(s)):
            cut += 1
    return 1.0 if cut >= 2 else 0.0


@motif(96, "Skewer-Line Alignment", 2.40, group="tactic")
def m096(c):
    if not c.gives_check or c.piece.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN):
        return 0.0
    ek = c.nb.king(c.them)
    ray = chess.BB_RAYS[c.move.to_square][ek]
    beyond = [s for s in chess.SquareSet(ray) if chess.square_distance(c.move.to_square, s) > chess.square_distance(c.move.to_square, ek)
              and chess.square_distance(ek, s) < chess.square_distance(c.move.to_square, s)]
    for s in sorted(beyond, key=lambda x: chess.square_distance(ek, x)):
        p = c.nb.piece_at(s)
        if p:
            return 1.0 if p.color == c.them and p.piece_type in (chess.QUEEN, chess.ROOK) and chess.BB_SQUARES[s] & chess.BB_RAYS[c.move.to_square][ek] and _between_clear(c.nb, ek, s) else 0.0
    return 0.0


def _between_clear(b, a, z):
    return not (chess.SquareSet(chess.between(a, z)) & chess.SquareSet(b.occupied))


@motif(97, "Discovered-Attack Battery", 2.15, group="tactic")
def m097(c):  # after the move, a slider of ours is aimed at enemy K/Q through exactly one of our own pieces (movable blocker)
    tgts = list(c.nb.pieces(chess.KING, c.them) | c.nb.pieces(chess.QUEEN, c.them))
    n = lambda b: sum(1 for s in _sliders(b, c.us) for t in tgts if chess.BB_RAYS[s][t] and _ray_ok(b, s, t)
                      and len(blk := chess.SquareSet(chess.between(s, t)) & chess.SquareSet(b.occupied)) == 1 and b.color_at(next(iter(blk))) == c.us)
    return 1.0 if n(c.nb) > n(c.board) else 0.0


def _ray_ok(b, s, t):
    pt = b.piece_type_at(s)
    diag = chess.square_file(s) != chess.square_file(t) and chess.square_rank(s) != chess.square_rank(t)
    return pt == chess.QUEEN or (pt == chess.BISHOP and diag) or (pt == chess.ROOK and not diag)


def battery_targets(board, color):
    """Files on which a queen behind two unobstructed rooks supports their advance."""
    targets = set()
    for queen in board.pieces(chess.QUEEN, color):
        direction = 8 if color else -8
        file = chess.square_file(queen)
        if F.file_state(board, file, color) == "closed":
            continue
        ray = [sq for sq in range(queen + direction, 64 if color else -1, direction)]
        occupied = [sq for sq in ray if board.piece_type_at(sq)]
        if len(occupied) < 2 or any(board.piece_at(sq) != chess.Piece(chess.ROOK, color) for sq in occupied[:2]):
            continue
        front = occupied[1] + direction
        if 0 <= front < 64 and board.color_at(front) != color:
            targets.add(file)
    return targets


@motif(98, "Alekhine's Gun Stacker", 3.10, group="attack")
def m098(c):
    return float(bool(battery_targets(c.nb, c.us) - battery_targets(c.board, c.us)))


def _mate(c):
    return c.nb.is_checkmate()


def _checker(c):
    ch = list(c.nb.checkers())
    return ch[0] if len(ch) == 1 else None


@motif(99, "Anastasia's Mate Scorer", 4.20, group="mate")
def m099(c):
    if not _mate(c):
        return 0.0
    ek = c.nb.king(c.them); ch = _checker(c)
    edge = chess.square_file(ek) in (0, 7)
    nsq = ("e7", "e2") if chess.square_file(ek) == 7 else ("d7", "d2")
    return 1.0 if edge and ch is not None and c.nb.piece_type_at(ch) in (chess.ROOK, chess.QUEEN) and chess.square_file(ch) == chess.square_file(ek) \
        and any(c.nb.piece_at(chess.parse_square(n)) == chess.Piece(chess.KNIGHT, c.us) for n in nsq) else 0.0


@motif(100, "Boden's Mate Scorer", 4.40, group="mate")
def m100(c):
    if not _mate(c):
        return 0.0
    ek = c.nb.king(c.them)
    bs = [s for s in c.nb.pieces(chess.BISHOP, c.us) if c.nb.attacks(s) & chess.SquareSet(chess.BB_KING_ATTACKS[ek] | chess.BB_SQUARES[ek])]
    shades = {(chess.square_file(s) + chess.square_rank(s)) % 2 for s in bs}
    return 1.0 if len(bs) >= 2 and len(shades) == 2 and c.nb.piece_type_at(_checker(c) or 0) == chess.BISHOP else 0.0


@motif(101, "Lolli's Mate Scorer", 4.10, group="mate")
def m101(c):
    if not _mate(c):
        return 0.0
    ch = _checker(c)
    pawn = "f6" if c.us == chess.WHITE else "f3"
    return 1.0 if ch is not None and c.nb.piece_type_at(ch) == chess.QUEEN and c.nb.piece_at(chess.parse_square(pawn)) == chess.Piece(chess.PAWN, c.us) else 0.0


@motif(102, "Opera-Mate Scorer", 4.00, group="mate")
def m102(c):
    if not _mate(c):
        return 0.0
    ch = _checker(c); ek = c.nb.king(c.them)
    return 1.0 if ch is not None and c.nb.piece_type_at(ch) == chess.ROOK and chess.square_rank(ch) == chess.square_rank(ek) and F.rel_rank(c.them, ek) == 1 \
        and any(c.nb.piece_type_at(d) == chess.BISHOP for d in c.nb.attackers(c.us, ch)) else 0.0


@motif(103, "Greco's Mate Scorer", 3.90, group="mate")
def m103(c):
    if not _mate(c):
        return 0.0
    ch = _checker(c); ek = c.nb.king(c.them)
    if ch is None or c.nb.piece_type_at(ch) not in (chess.ROOK, chess.QUEEN) or chess.square_file(ch) not in (0, 7) or chess.square_file(ek) != chess.square_file(ch):
        return 0.0
    gsq = [s for s in F.king_ring_squares(ek) if chess.square_file(s) in (1, 6) and F.rel_rank(c.them, s) == F.rel_rank(c.them, ek)]
    return 1.0 if any(c.nb.piece_type_at(a) == chess.BISHOP for s in gsq for a in c.nb.attackers(c.us, s)) else 0.0


@motif(104, "Legal's Mate Pin-Trap", 3.80, ["eval"], level="VERIFICATION", group="sacrifice")
def m104(c):  # a relatively pinned knight (enemy bishop pins it to our queen) captures on e5/e4, offering the queen
    if c.piece.piece_type != chess.KNIGHT or not c.is_capture or chess.square_name(c.move.to_square) not in ("e5", "e4"):
        return 0.0
    q = list(c.nb.pieces(chess.QUEEN, c.us))
    return 1.0 if q and any(c.nb.piece_type_at(a) == chess.BISHOP for a in c.nb.attackers(c.them, q[0])) and c.ev(-999) >= -35 else 0.0


@motif(105, "Epaulette Mate Scorer", 4.60, group="mate")
def m105(c):
    if not _mate(c):
        return 0.0
    ek = c.nb.king(c.them)
    side = [chess.square(chess.square_file(ek) + d, chess.square_rank(ek)) for d in (-1, 1) if 0 <= chess.square_file(ek) + d <= 7]
    return 1.0 if len(side) == 2 and all(c.nb.piece_at(s) == chess.Piece(chess.ROOK, c.them) for s in side) else 0.0


@motif(106, "Branching-Factor Maximizer", 1.30)
def m106(c):
    n = c.nb.legal_moves.count()
    caps = sum(1 for m in c.nb.legal_moves if c.nb.is_capture(m))
    return 1.0 if n >= 35 and caps >= 2 else 0.0


def _their_sorted(c):
    """Opponent reply values from THEIR POV, best first."""
    return sorted((-v for v in c.reply.evals.values()), reverse=True) if c.reply and c.reply.evals else []


@motif(107, "Eval Volatility Index", 2.25, ["replies"], level="VERIFICATION")
def m107(c):
    t = _their_sorted(c)
    return 1.0 if len(t) >= 2 and t[0] - t[1] > 180 else 0.0


@motif(108, "Tactical-Tree Asymmetry", 2.50, ["eval", "replies"], level="VERIFICATION")
def m108(c):
    ours = sum(1 for v in c.cand.values() if c.best_cp is not None and v >= c.best_cp - 30)
    t = _their_sorted(c)
    theirs = sum(1 for v in t if v >= t[0] - 30) if t else 99
    return 1.0 if ours >= 3 and theirs == 1 else 0.0


@motif(109, "Only-Move Defense Forcer", 2.75, ["replies"], level="VERIFICATION")
def m109(c):
    t = _their_sorted(c)
    return 1.0 if len(t) >= 2 and sum(1 for v in t if v > -150) == 1 else 0.0


@motif(110, "Dual-Threat Generator", 2.60, group="tactic")
def m110(c):
    nb = c.nb.copy(stack=False); nb.turn = c.us; nb.ep_square = None
    mate_threat = any(_after(nb, m).is_checkmate() for m in nb.legal_moves if nb.gives_check(m))
    cap_threat = any(F.is_square_hanging(c.nb, s, c.them) for s, p in c.nb.piece_map().items() if p.color == c.them and p.piece_type != chess.KING and V[p.piece_type] >= 3)
    return 1.0 if mate_threat and cap_threat and not c.nb.is_check() else 0.0


# #111 deep sacrifice verifier, #112 counter-attack preemptor: verification controls in mind.py (motif value = trigger)
@motif(111, "Deep Sacrifice Verifier", 0.0, ["eval"], level="VERIFICATION", group="control")
def m111(c):
    return 1.0 if c.sac_value() >= 3 else 0.0


@motif(112, "Counter-Attack Preemptor", -1.0, ["replies"], level="VERIFICATION", group="safety")
def m112(c):  # reject flashy sacrifices if opponent has an immediate forcing sequence (best reply leaves us < -60)
    if c.sac_value() < 1 or not c.reply or not c.reply.evals:
        return 0.0
    return 1.0 if min(c.reply.evals.values()) < -60 else 0.0


@motif(113, "Pawn-Majority Stormer", 1.45)
def m113(c):
    if c.piece.piece_type != chess.PAWN:
        return 0.0
    f = chess.square_file(c.move.to_square)
    wing = range(0, 4) if f < 4 else range(4, 8)
    n = lambda col: sum(1 for s in c.nb.pieces(chess.PAWN, col) if chess.square_file(s) in wing)
    return 1.0 if (n(c.us), n(c.them)) in ((3, 2), (4, 3)) else 0.0


@motif(114, "Fianchetto Hole Exploiter", 1.75)
def m114(c):
    holes = ("f6", "h6", "c6", "a6") if c.us == chess.WHITE else ("f3", "h3", "c3", "a3")
    if chess.square_name(c.move.to_square) not in holes or c.piece.piece_type == chess.PAWN:
        return 0.0
    fsq = "g7" if chess.square_name(c.move.to_square) in ("f6", "h6", "f3", "h3") else "b7"
    if c.us == chess.BLACK:
        fsq = fsq.replace("7", "2")
    bshade = (chess.square_file(chess.parse_square(fsq)) + chess.square_rank(chess.parse_square(fsq))) % 2
    no_bishop = not any((chess.square_file(s) + chess.square_rank(s)) % 2 == bshade for s in c.nb.pieces(chess.BISHOP, c.them))
    return 1.0 if no_bishop and not any(c.nb.piece_type_at(a) == chess.PAWN for a in c.nb.attackers(c.them, c.move.to_square)) else 0.0


@motif(115, "IQP Dynamic Lever", 1.65)
def m115(c):
    d = 3
    iso = lambda b: [s for s in b.pieces(chess.PAWN, c.us) if chess.square_file(s) == d and not any(chess.square_file(x) in (2, 4) for x in b.pieces(chess.PAWN, c.us))]
    return 1.0 if c.piece.piece_type == chess.PAWN and c.move.from_square in iso(c.board) and F.rel_rank(c.us, c.move.to_square) in (4, 5) else 0.0


@motif(116, "Doubled-Pawn File Opener", 1.35)
def m116(c):  # a recapture with a pawn toward the centre that doubles pawns but opens a semi-open file for our rook
    if c.piece.piece_type != chess.PAWN or not c.is_capture:
        return 0.0
    doubled = sum(1 for s in c.nb.pieces(chess.PAWN, c.us) if chess.square_file(s) == chess.square_file(c.move.to_square)) >= 2
    opened = F.file_state(c.nb, chess.square_file(c.move.from_square), c.us) != "closed"
    return 1.0 if doubled and opened and c.nb.pieces(chess.ROOK, c.us) else 0.0


@motif(117, "Hanging-Pawns Surge", 1.55)
def m117(c):
    cs, ds = ("c4", "d4") if c.us == chess.WHITE else ("c5", "d5")
    hp = all(c.board.piece_at(chess.parse_square(s)) == chess.Piece(chess.PAWN, c.us) for s in (cs, ds)) and not any(chess.square_file(s) in (1, 4) for s in c.board.pieces(chess.PAWN, c.us))
    return 1.0 if hp and c.move.from_square in (chess.parse_square(cs), chess.parse_square(ds)) else 0.0


@motif(118, "Corner-Bishop Cage", 3.20)
def m118(c):
    corners = ("a7", "h7", "a2", "h2")
    for n in corners:
        s = chess.parse_square(n)
        if c.nb.piece_at(s) == chess.Piece(chess.BISHOP, c.them) and F.legal_moves_of_piece(c.nb, s) == 0 and F.legal_moves_of_piece(c.board, s) > 0 and c.piece.piece_type == chess.PAWN:
            return 1.0
    return 0.0


@motif(119, "Third-Rank Rook Lift", 2.10, group="attack")
def m119(c):
    if c.piece.piece_type != chess.ROOK or F.rel_rank(c.us, c.move.to_square) != 3 or F.rel_rank(c.us, c.move.from_square) >= 3:
        return 0.0
    ek = c.nb.king(c.them)
    return 1.0 if ek is not None and chess.square_file(ek) >= 5 else 0.0


@motif(120, "Inverted Minority Attack", 1.70)
def m120(c):
    if c.piece.piece_type != chess.PAWN or F.castled_side(c.board, c.us) != "Q":
        return 0.0
    return 1.0 if chess.square_name(c.move.to_square) in (("b4", "b5") if c.us == chess.WHITE else ("b5", "b4")) else 0.0


@motif(121, "King-Hunt Cascade", 3.40, ["history"], group="attack")
def m121(c):  # third consecutive forcing move of ours that drags the enemy king toward the centre
    if not c.gives_check or len(c.state.our_moves) < 1:
        return 0.0
    ek = c.board.king(c.them)
    cen = lambda s: max(abs(chess.square_file(s) - 3.5), abs(chess.square_rank(s) - 3.5))
    hist = c.state.opp_moves[-2:]
    king_moved = sum(1 for u in hist if c.board.piece_type_at(chess.Move.from_uci(u).to_square) == chess.KING)
    return 1.0 if king_moved >= 1 and cen(ek) <= 2.5 else 0.0


@motif(122, "Middlegame Zugzwang", 3.60)
def m122(c):
    if len(c.nb.piece_map()) < 20:
        return 0.0
    mob = sum(1 for m in c.nb.legal_moves if not c.nb.piece_type_at(m.from_square) == chess.KING)
    return 1.0 if F.count_pinned_pieces(c.nb, c.them) >= 1 and F.closed_files_count(c.nb) >= 3 and mob <= 12 else 0.0


@motif(123, "Perpetual Immunity Shield", 1.0, group="safety")
def m123(c):  # preserve a sheltered flight square (h2/g1 analogue) before all-in play: penalise removing our last luft
    return -1.0 if F.king_luft(c.board, c.us) >= 1 and F.king_luft(c.nb, c.us) == 0 and c.piece.piece_type == chess.PAWN else 0.0


@motif(124, "Opposite-Bishop Multiplier", 2.20, group="attack")
def m124(c):
    wb, bb = c.nb.pieces(chess.BISHOP, chess.WHITE), c.nb.pieces(chess.BISHOP, chess.BLACK)
    if len(wb) != 1 or len(bb) != 1 or F.non_pawn_pieces(c.nb) < 4:
        return 0.0
    sh = lambda s: (chess.square_file(s) + chess.square_rank(s)) % 2
    return 1.0 if sh(next(iter(wb))) != sh(next(iter(bb))) and F.king_ring_attack_count(c.nb, c.us) > F.king_ring_attack_count(c.board, c.us) else 0.0


@motif(125, "Bare-King Herding Net", 2.00)
def m125(c):
    if any(p.color == c.them and p.piece_type != chess.KING for p in c.nb.piece_map().values()) or c.nb.is_stalemate():
        return 0.0
    if not (c.nb.pieces(chess.QUEEN, c.us) and c.nb.pieces(chess.KNIGHT, c.us)):
        return 0.0
    return 1.0 if F.safe_king_moves(c.nb, c.them) < F.safe_king_moves(c.board, c.them) else 0.0


@motif(126, "One-Tempo Pawn Race", 2.30, ["eval"], level="VERIFICATION")
def m126(c):  # passed pawn advance in a race where our promotion comes with check one tempo ahead (eval confirms)
    if c.piece.piece_type != chess.PAWN or not F.is_passed(c.nb, c.move.to_square, c.us) or F.rel_rank(c.us, c.move.to_square) < 6:
        return 0.0
    theirs = [s for s in c.nb.pieces(chess.PAWN, c.them) if F.is_passed(c.nb, s, c.them)]
    return 1.0 if theirs and c.ev() >= 150 else 0.0


@motif(127, "Stalemate-Trap Detector", 2.90, group="safety")
def m127(c):  # when far ahead, reward moves after which the opponent has a legal non-king move or the king is not stalemate-prone
    if F.material_balance(c.board, c.us) < 5:
        return 0.0
    return -1.0 if c.nb.is_stalemate() else (1.0 if c.nb.legal_moves.count() >= 2 else 0.0)


def _ebg(c):
    r = c.reply
    if not r or not r.maia or not r.evals:
        return None
    base = min(r.evals.values())
    top = sorted(r.maia.items(), key=lambda kv: -kv[1])[:6]
    return sum(p * max(0.0, r.evals[u] - base) for u, p in top if u in r.evals) / 100.0


@motif(128, "Expected-Blunder-Gain (EBG)", 1.0, ["maia", "replies"], level="VERIFICATION", group="human")
def m128(c):
    v = _ebg(c)
    return v or 0.0


@motif(129, "Visual Blindspot Bias", 1.85)
def m129(c):
    if not c.quiet:
        return 0.0
    if c.piece.piece_type == chess.BISHOP and F.rel_rank(c.us, c.move.to_square) < F.rel_rank(c.us, c.move.from_square) and chess.square_distance(c.move.from_square, c.move.to_square) >= 4:
        return 1.0
    if c.piece.piece_type == chess.KNIGHT and F.rel_rank(c.us, c.move.to_square) < F.rel_rank(c.us, c.move.from_square):
        return 1.0
    return 0.0


@motif(130, "Corner X-Ray Retreat", 2.40)
def m130(c):
    names = {chess.WHITE: ("f1", "a1", "h1"), chess.BLACK: ("f8", "a8", "h8")}[c.us]
    if chess.square_name(c.move.to_square) not in names or not c.quiet:
        return 0.0
    return 1.0 if any(c.nb.piece_type_at(t) in (chess.QUEEN, chess.ROOK, chess.KING) and c.nb.color_at(t) == c.them for t in _xray(c.nb, c.move.to_square)) else 0.0


def _xray(b, s):
    """Squares hit by the piece on s looking through exactly one blocker."""
    p = b.piece_at(s)
    out = []
    if not p or p.piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN):
        return out
    for t in chess.SQUARES:
        if t != s and chess.BB_RAYS[s][t] and _ray_ok(b, s, t) and len(chess.SquareSet(chess.between(s, t)) & chess.SquareSet(b.occupied)) == 1:
            out.append(t)
    return out


@motif(131, "Momentum Swing Maximizer", 2.50, ["maia", "replies"], level="VERIFICATION", group="human")
def m131(c):  # Maia's preferred reply looks natural (p>=0.3) and turns into a large loss for the opponent
    u, p = _top_reply(c)
    loss = _reply_loss(c, u) if u else None
    return 1.0 if u and p >= 0.30 and loss is not None and loss >= 300 else 0.0


@motif(132, "False-Material-Lead Trap", 2.60, ["eval"])
def m132(c):
    mb = F.material_balance(c.nb, c.us)
    return 1.0 if -5 <= mb <= -2 and c.ev() >= 200 else 0.0


@motif(133, "Sunk-Cost Defense Lure", 2.10, ["history"])
def m133(c):  # opponent has spent >= 3 of their last 4 moves defending the same doomed pawn
    if len(c.state.opp_moves) < 4:
        return 0.0
    tgt = [chess.Move.from_uci(u).to_square for u in c.state.opp_moves[-4:]]
    attacked = [s for s in c.board.pieces(chess.PAWN, c.them) if c.board.is_attacked_by(c.us, s)]
    return 1.0 if any(sum(1 for t in tgt if s in c.board.attacks(t)) >= 3 for s in attacked) and c.move.to_square not in attacked else 0.0


@motif(134, "Recapture-Reflex Bait", 2.85, ["replies"], level="VERIFICATION")
def m134(c):
    if not c.is_capture:
        return 0.0
    rec = [u for u in (c.reply.evals if c.reply else {}) if chess.Move.from_uci(u).to_square == c.move.to_square]
    return 1.0 if rec and all(_reply_loss(c, u) >= 150 for u in rec) else 0.0


@motif(135, "Premature-Resign Deterrent", 1.0, ["eval"])
def m135(c):  # early in the game prefer suffocation (restriction) over grabbing large material: penalise big captures when already winning
    if c.board.fullmove_number > 25 or c.ev() < 300 or not c.is_capture:
        return 0.0
    return -1.0 if V[c.board.piece_type_at(c.move.to_square) or chess.PAWN] >= 5 else 0.0


@motif(136, "Ego-Challenge Symmetry", 1.95, ["history"])
def m136(c):
    if not c.board.move_stack or c.piece.piece_type != chess.PAWN:
        return 0.0
    last = c.board.peek()
    return 1.0 if c.board.piece_type_at(last.to_square) == chess.PAWN and chess.square_file(last.to_square) in (0, 7) and c.move.to_square == chess.square_mirror(last.to_square) else 0.0


@motif(137, "Clock-Burn Maze Escalator", 2.65, ["replies", "history"], level="VERIFICATION")
def m137(c):
    return 1.0 if m109(c) and c.state.our_moves and c.state.last_only_move else 0.0


@motif(138, "Quiet-Move Shockwave", 2.55, ["replies"], level="VERIFICATION")
def m138(c):  # quiet move after which every opponent reply leaves them worse (counterplay cut: their best reply value <= -100)
    t = _their_sorted(c)
    return 1.0 if c.quiet and t and t[0] <= -100 else 0.0


@motif(139, "Loose-Piece Provocation", 2.45, ["replies"], level="VERIFICATION")
def m139(c):
    loose = [s for s in c.nb.pieces(chess.KNIGHT, c.us) | c.nb.pieces(chess.BISHOP, c.us) if not c.nb.attackers(c.us, s) and c.nb.attackers(c.them, s)]
    if not loose or not c.reply:
        return 0.0
    takes = [u for u in c.reply.evals if chess.Move.from_uci(u).to_square in loose]
    return 1.0 if takes and all(_reply_loss(c, u) >= 150 for u in takes) else 0.0


@motif(140, "King-Safety Mirage", 2.05, group="attack")
def m140(c):
    tg = ("h7", "g6") if c.us == chess.WHITE else ("h2", "g3")
    if F.shield_pawns(c.nb, c.them) < 3 or c.piece.piece_type not in (chess.BISHOP, chess.QUEEN, chess.ROOK):
        return 0.0
    return 1.0 if any(chess.parse_square(n) in _xray(c.nb, c.move.to_square) or chess.parse_square(n) in c.nb.attacks(c.move.to_square) for n in tg) else 0.0


@motif(141, "Pawn-Push Panic Inducer", 2.20)
def m141(c):
    if c.piece.piece_type == chess.PAWN:
        return 0.0
    tgt = ("g5", "f6") if c.us == chess.WHITE else ("g4", "f3")
    nb = c.nb.copy(stack=False); nb.turn = c.us; nb.ep_square = None
    return 1.0 if any(m.to_square == chess.parse_square(n) and nb.piece_type_at(m.from_square) == chess.PAWN for m in nb.legal_moves for n in tgt) and \
        F.king_ring_attack_count(c.nb, c.us) > F.king_ring_attack_count(c.board, c.us) else 0.0


@motif(142, "Clutter Board Densifier", 1.75)
def m142(c):
    return -1.0 if c.is_capture and c.nb.attackers(c.them, c.move.to_square) and c.board.piece_type_at(c.move.to_square) == c.piece.piece_type else 0.0


@motif(143, "Piece-Parade Tempo Taunt", 2.30, ["eval"], group="style-extreme")
def m143(c):
    return 1.0 if c.ev() >= 500 and c.quiet and c.piece.piece_type in (chess.KNIGHT, chess.KING) and not c.nb.attackers(c.them, c.move.to_square) else 0.0


_FINISH = {"castle": 4, "ep": 3, "underN": 2, "smother": 1, "other": 0}


@motif(144, "Humiliation Finish Ranker", 1.0, group="mate")
def m144(c):
    if not _mate(c):
        return 0.0
    if c.board.is_castling(c.move):
        k = "castle"
    elif c.board.is_en_passant(c.move):
        k = "ep"
    elif c.move.promotion == chess.KNIGHT:
        k = "underN"
    elif m033(c):
        k = "smother"
    else:
        k = "other"
    return float(_FINISH[k])


@motif(145, "Anti-Fortress Demolition", 3.10, ["eval"], level="VERIFICATION", group="sacrifice")
def m145(c):
    if F.non_pawn_pieces(c.nb) > 6 or c.piece.piece_type != chess.ROOK or not c.is_capture or V[c.board.piece_type_at(c.move.to_square)] > 3:
        return 0.0
    return 1.0 if c.ev(-999) >= 50 and c.nb.attackers(c.them, c.move.to_square) else 0.0


@motif(146, "Multi-Piece Pin Web", 2.90, group="tactic")
def m146(c):
    def kinds(b):
        out = set()
        for sq, p in b.piece_map().items():
            if p.color == c.them and p.piece_type != chess.KING and b.is_pinned(c.them, sq):
                d = b.pin(c.them, sq)
                k = b.king(c.them)
                out.add("diag" if chess.square_file(sq) != chess.square_file(k) and chess.square_rank(sq) != chess.square_rank(k) else "line")
        return out
    return 1.0 if kinds(c.nb) == {"diag", "line"} and kinds(c.board) != {"diag", "line"} else 0.0


@motif(147, "Sacrifice-Chain Escalator", 3.30, ["eval", "history"], level="VERIFICATION", group="sacrifice")
def m147(c):
    return 1.0 if c.state.declined_sac and c.sac_value() >= 2 and c.ev(-999) >= -35 else 0.0


restricted(148, "Prefer moves that look like ?!/?? in browser game review so reported opponents believe CHIMERA is human (deceives fair-play review). Archived.")


# ============================================================ PHASE IV (#170-#220)
@motif(170, "King-Ring Topological Cage", 2.40, group="cage", level="CONSTRUCTION")
def m170(c):  # per sealed escape vector: ring square occupied by a friendly blocker (their own piece) or controlled by us
    def sealed(b):
        ek = b.king(c.them)
        return sum(1 for s in F.king_ring_squares(ek) if b.color_at(s) == c.them or b.is_attacked_by(c.us, s))
    return float(max(0, sealed(c.nb) - sealed(c.board)))


@motif(171, "Maia-3 Policy Divergence", 1.90, ["maia"], group="human")
def m171(c):
    r = c.reply
    if not r or not r.maia or not r.maia_prior:
        return 0.0
    keys = set(r.maia) | set(r.maia_prior)
    return 0.5 * sum(abs(r.maia.get(k, 0.0) - r.maia_prior.get(k, 0.0)) for k in keys)  # total variation in [0,1]


@motif(172, "Terminal-Motif Trajectory", 1.0, level="CONSTRUCTION", group="construction")
def m172(c):
    from chimera.omega.construct import terminal_potential
    return terminal_potential(c.nb, c.us) - terminal_potential(c.board, c.us)


@motif(173, "Control Gradient Flow", 1.25, group="space")
def m173(c):
    def fwd(b):
        return sum(len(b.attackers(c.us, s)) for s in chess.SQUARES if F.rel_rank(c.us, s) >= 5)
    return 1.0 if fwd(c.nb) > fwd(c.board) else 0.0


@motif(174, "Legal-Move Collapse Rate", 2.30)
def m174(c):
    before = F._with_turn(c.board, c.them).legal_moves.count()
    after = c.nb.legal_moves.count()
    return 1.0 if before and (before - after) / before > 0.35 else 0.0


@motif(175, "Convex Risk-Reward Curve", 1.0, ["eval"], group="sacrifice")
def m175(c):
    sv = c.sac_value()
    if sv < 1 or c.ev(-999) < -35:
        return 0.0
    return (sv / 3.0) ** 2   # convex in the size of the sound sacrifice


@motif(176, "Nightmare Endgame Router", 1.0, ["eval"], level="CONSTRUCTION", group="style-extreme")
def m176(c):
    if c.ev() < 300 or F.non_pawn_pieces(c.nb) > 4:
        return 0.0
    from chimera.omega.construct import nightmare_potential
    return nightmare_potential(c.nb, c.us) - nightmare_potential(c.board, c.us)


@motif(177, "Dynamic Contempt Curve", -1.0, ["eval", "history"], group="anti-draw")
def m177(c):  # contempt escalates from -1.20 to -2.50 past move 30 (replaces #1 magnitude after move 30)
    if c.board.fullmove_number <= 30 or c.ev() < -80 or not (_drawish(c.nb) or c.nb.is_repetition(2)):
        return 0.0
    return 2.50 - 1.20


@motif(178, "Blunder-Weighted Eval", 0.28, ["maia", "replies"], level="VERIFICATION", group="human")
def m178(c):  # 0.72*eval + 0.28*EBG: the eval part is the arbitration base; this motif adds the 0.28*EBG share
    v = _ebg(c)
    return v or 0.0


# #179 presets / #180 high-leverage: controls in config.py / mind.py
restricted(181, "Regan critical-moment filter: play Maia's move on low-spread positions to keep the Regan Z-score below 1.0 (anti-detection). Archived.")


@motif(182, "Maia-3 Blunder Coupler", 1.0, ["maia", "replies"], level="VERIFICATION", group="human")
def m182(c):  # induced blunder probability on the reply ply: sum of Maia mass on replies losing >= 100 cp
    r = c.reply
    if not r or not r.maia or not r.evals:
        return 0.0
    base = min(r.evals.values())
    return sum(p for u, p in r.maia.items() if u in r.evals and r.evals[u] - base >= 100)


@motif(183, "Offensive King Vanguard", 2.10, ["eval"], group="style-extreme")
def m183(c):
    if c.piece.piece_type != chess.KING or F.non_pawn_pieces(c.nb) < 6 or c.ev(-999) < -25:
        return 0.0
    r = F.rel_rank(c.us, c.move.to_square)
    return float(max(0, r - 3)) if 4 <= r <= 6 and r > F.rel_rank(c.us, c.move.from_square) else 0.0


@motif(184, "Optical-Illusion Brilliancy", 3.40, ["replies"], level="VERIFICATION", group="sacrifice")
def m184(c):
    if c.piece.piece_type not in (chess.QUEEN, chess.ROOK, chess.BISHOP):
        return 0.0
    to = c.move.to_square
    if c.nb.attackers(c.us, to) or len(c.nb.attackers(c.them, to)) < 2 or not c.reply:
        return 0.0
    takes = [u for u in c.reply.evals if chess.Move.from_uci(u).to_square == to]
    return 1.0 if takes and len(takes) >= 2 and all(_reply_loss(c, u) >= 100 for u in takes) else 0.0


@motif(185, "Piece-Cage Imprisonment", 3.00, group="cage")
def m185(c):
    return float(max(0, F.caged_heavy_pieces(c.nb, c.them) - F.caged_heavy_pieces(c.board, c.them)))


@motif(186, "Underpromotion Taunts", 9.50, ["eval"], level="VERIFICATION", group="style-extreme")
def m186(c):  # =N/=B when eval >= +200 or mate. HARD condition (correction C-EX-186): never when it leaves insufficient material
    if c.move.promotion not in (chess.KNIGHT, chess.BISHOP):
        return 0.0
    if c.nb.is_insufficient_material() or c.nb.is_stalemate():
        return 0.0
    return 1.0 if c.nb.is_checkmate() or c.ev(-999) >= 200 else 0.0


@motif(187, "Four-Wing Pawn Avalanche", 2.35, group="opening")
def m187(c):
    if c.ply > 12 or c.piece.piece_type != chess.PAWN:
        return 0.0
    names = ("a4", "h4", "b4", "g4") if c.us == chess.WHITE else ("a5", "h5", "b5", "g5")
    cen = ("d4", "e4") if c.us == chess.WHITE else ("d5", "e5")
    return 1.0 if chess.square_name(c.move.to_square) in names and all(c.nb.piece_at(chess.parse_square(s)) is None for s in cen) else 0.0


def en_prise_captures(board, color):
    hanging = set(F.hanging_pieces(board, color))
    return [m for m in board.generate_legal_captures() if m.to_square in hanging]


@motif(188, "Triple-En-Prise Ghost Chain", 2.65, ["eval", "replies"], level="VERIFICATION", group="sacrifice")
def m188(c):
    if c.ev(-999) < -35 or not c.reply:
        return 0.0
    captures = en_prise_captures(c.nb, c.us)
    targets = {m.to_square for m in captures}
    if len(targets) < 3:
        return 0.0
    # Board §3 requires mating refutations. Missing replies are not evidence.
    return float(len(targets)) if all(c.reply.evals.get(m.uci(), 0) >= 99997 for m in captures) else 0.0


@motif(189, "Cognitive-Freeze Clock Drain", 2.90, ["replies"], level="VERIFICATION")
def m189(c):  # opponent has >= 5 natural captures that lose, and only a backward retreat survives
    if not c.reply or not c.reply.evals:
        return 0.0
    replies = list(c.nb.legal_moves)
    caps = [m for m in replies if c.nb.is_capture(m)]
    if len(caps) < 5 or any(m.uci() not in c.reply.evals for m in replies):
        return 0.0
    good = [u for u, v in c.reply.evals.items() if v - min(c.reply.evals.values()) < 100]
    back = [u for u in good if F.rel_rank(c.them, chess.Move.from_uci(u).to_square) < F.rel_rank(c.them, chess.Move.from_uci(u).from_square)]
    return 1.0 if len(good) == 1 and back and sum(1 for m in caps if m.uci() in c.reply.evals and c.reply.evals[m.uci()] - min(c.reply.evals.values()) >= 100) >= 5 else 0.0


@motif(190, "Botez-Gambit Suffocation", 4.80, ["eval"], level="VERIFICATION", group="sacrifice")
def m190(c):
    if c.piece.piece_type != chess.QUEEN or c.ev(-999) < 80:
        return 0.0
    return 1.0 if F.is_square_hanging(c.nb, c.move.to_square, c.us) or (c.nb.attackers(c.them, c.move.to_square) and not c.nb.attackers(c.us, c.move.to_square)) else 0.0


@motif(191, "Pendulum-Mockery Tempo", 2.70, ["eval", "history"], group="style-extreme")
def m191(c):
    if c.ev() < 300 or len(c.state.our_moves) < 1 or c.state.repetition_used:
        return 0.0
    last = chess.Move.from_uci(c.state.our_moves[-1])
    paralyzed = c.nb.legal_moves.count() <= 10
    return 1.0 if c.quiet and last.to_square == c.move.from_square and last.from_square == c.move.to_square and paralyzed else 0.0


@motif(192, "Castling Checkmate Override", 25.0, group="mate")
def m192(c):
    return 1.0 if c.board.is_castling(c.move) and c.nb.is_checkmate() else 0.0


@motif(193, "False-Hope Mirage", 3.20, ["replies"], level="VERIFICATION")
def m193(c):  # opponent gets checks (2-3 forcing replies) yet every check leaves them losing
    if not c.reply or not c.reply.evals:
        return 0.0
    checks = [u for u in c.reply.evals if c.nb.gives_check(chess.Move.from_uci(u))]
    return 1.0 if 2 <= len(checks) <= 3 and all(c.reply.evals[u] >= 150 for u in checks) else 0.0


@motif(194, "6-Knight Cavalry Swarm", 3.20, ["eval"], group="style-extreme")
def m194(c):
    if c.move.promotion != chess.KNIGHT or c.nb.is_insufficient_material() or c.ev(-999) < 200:
        return 0.0
    count = len(c.nb.pieces(chess.KNIGHT, c.us))
    return float(count - 2) if 3 <= count <= 6 else 0.0


@motif(195, "Symmetry-Mirror Gaslight", 4.00, ["history"], group="opening")
def m195(c):
    if c.ply > 8 or not c.board.move_stack or c.us != chess.BLACK:
        return 0.0
    last = c.board.peek()
    mir = chess.Move(chess.square_mirror(last.from_square), chess.square_mirror(last.to_square))
    return 1.0 if c.move == mir else 0.0


@motif(196, "Pacifist Pawn Guillotine", 2.50)
def m196(c):
    def wall(b):
        best = 0
        for start in range(8):
            run = 0
            for f in range(start, 8):
                if any(chess.square_file(s) == f and F.rel_rank(c.us, s) >= 4 for s in b.pieces(chess.PAWN, c.us)):
                    run += 1
                else:
                    break
            best = max(best, run)
        return best
    trade = c.is_capture and c.board.piece_type_at(c.move.to_square) == c.piece.piece_type and c.piece.piece_type != chess.PAWN
    return -1.0 if trade else (1.0 if c.piece.piece_type == chess.PAWN and wall(c.nb) >= 4 and wall(c.nb) > wall(c.board) else 0.0)


@motif(197, "Two-Time Repetition Fake-Out", 1.0, ["eval", "history"], group="style-extreme")
def m197(c):
    if c.ev() < 250:
        return 0.0
    if c.nb.is_repetition(3):
        return -18.0
    return 4.20 if c.nb.is_repetition(2) else 0.0


@motif(198, "Inverted-Center Ring", 2.20, group="space")
def m198(c):
    cen = [chess.parse_square(n) for n in ("d4", "e4", "d5", "e5")]
    ok = lambda b: all(b.piece_at(s) is None and b.is_attacked_by(c.us, s) for s in cen)
    return 1.0 if ok(c.nb) and not ok(c.board) else 0.0


@motif(199, "Back-Rank King Expedition", 2.60, ["eval"], group="style-extreme")
def m199(c):
    if c.piece.piece_type != chess.KING or c.ev(-999) < -25:
        return 0.0
    r = F.rel_rank(c.us, c.move.to_square)
    return float(r - 4) if r in (6, 7) and r > F.rel_rank(c.us, c.move.from_square) else 0.0


@motif(200, "-28 Material Smother", 4.50, ["eval"], group="mate")
def m200(c):  # in a forced mate (<= 5), prefer dumping material (sacrifice) right before a 1-piece smother
    if c.best_cp is None or c.best_cp < 99990 - 10 or c.ev(-999) < 99990 - 10:
        return 0.0
    return 1.0 if c.sac_value() >= 5 else 0.0


@motif(201, "En-Passant Mate Override", 28.0, group="mate")
def m201(c):
    return 1.0 if c.board.is_en_passant(c.move) and c.nb.is_checkmate() else 0.0


@motif(202, "Quadruple Pawn Spear", 2.80, ["eval"])
def m202(c):
    n = F.max_stacked_pawns_on_file(c.nb, c.us)
    return float(max(0, n - 2)) if n >= 3 and n > F.max_stacked_pawns_on_file(c.board, c.us) and c.ev(-999) >= -30 else 0.0


@motif(203, "4-Bishop Monochrome Cult", 3.00, ["eval"], group="style-extreme")
def m203(c):
    if c.move.promotion != chess.BISHOP or c.nb.is_insufficient_material() or c.ev(-999) < 200:
        return 0.0
    squares = chess.BB_LIGHT_SQUARES if chess.BB_SQUARES[c.move.to_square] & chess.BB_LIGHT_SQUARES else chess.BB_DARK_SQUARES
    count = len(c.nb.pieces(chess.BISHOP, c.us) & chess.SquareSet(squares))
    return float(count - 1) if 2 <= count <= 4 else 0.0


@motif(204, "Statue-of-Liberty Queen", 3.60, ["replies", "history"], level="VERIFICATION", group="sacrifice")
def m204(c):
    if len(c.board.move_stack) < 2 or not c.reply:
        return 0.0
    before = c.board.copy(stack=2)
    before.pop()
    previous = before.pop()
    for square in c.nb.pieces(chess.QUEEN, c.us):
        if square in (c.move.to_square, previous.to_square) or before.piece_at(square) != chess.Piece(chess.QUEEN, c.us):
            continue
        if not all(2 <= coord <= 5 for coord in (chess.square_file(square), chess.square_rank(square))):
            continue
        attackers = c.nb.attackers(c.them, square)
        if not attackers or c.nb.attackers(c.us, square):
            continue
        takes = [m.uci() for m in c.nb.generate_legal_captures(to_mask=chess.BB_SQUARES[square])]
        if takes and all(u in c.reply.evals and _reply_loss(c, u) >= 150 for u in takes):
            return 1.0
        if not takes and all(c.nb.is_pinned(c.them, sq) for sq in attackers):
            return 1.0
    return 0.0


@motif(205, "49.5-Move Cliffhanger", 1.0, ["eval"], group="style-extreme")
def m205(c):  # dead-won (>= +500): reward the mating move exactly at halfmove_clock == 99; this affects immediate mates only
    if c.ev() < 500:
        return 0.0
    if c.nb.is_checkmate() and c.board.halfmove_clock == 99:
        return 30.0
    return 0.0


@motif(206, "Isolated-Island Fortress", 1.90)
def m206(c):
    if c.piece.piece_type != chess.PAWN:
        return 0.0
    tied = lambda b: sum(1 for s in b.pieces(chess.ROOK, c.them) for t in b.attacks(s) if b.piece_at(t) == chess.Piece(chess.PAWN, c.us))
    return 1.0 if F.pawn_islands(c.nb, c.us) > F.pawn_islands(c.board, c.us) and tied(c.nb) >= 1 else 0.0


@motif(207, "Queen Conveyor Sacrifice", 4.10, ["history"], level="CONSTRUCTION", group="mate")
def m207(c):  # we promoted to a queen last move; now the new queen sacrifices itself to clear lines for a knight mate
    if len(c.board.move_stack) < 2 or c.ev(-999) < 99997:
        return 0.0
    promotion = c.board.move_stack[-2]
    if (promotion.promotion != chess.QUEEN or c.move.from_square != promotion.to_square
            or c.piece.piece_type != chess.QUEEN):
        return 0.0
    captures = list(c.nb.generate_legal_captures(to_mask=chess.BB_SQUARES[c.move.to_square]))
    if not captures:
        return 0.0
    for capture in captures:
        after = _after(c.nb, capture)
        knights = after.pieces_mask(chess.KNIGHT, c.us)
        if not any(after.gives_check(m) and _after(after, m).is_checkmate()
                   for m in after.generate_legal_moves(from_mask=knights)):
            return 0.0
    return 1.0


@motif(208, "Hollow-Ring Vortex", 2.45, group="space")
def m208(c):
    return 1.0 if m198(c) and sum(1 for n in (("a4", "h4", "b4", "g4") if c.us else ("a5", "h5", "b5", "g5")) if c.nb.piece_at(chess.parse_square(n)) == chess.Piece(chess.PAWN, c.us)) >= 2 else 0.0


@motif(209, "Thermobaric Zero-Retreat", 1.0, ["history"], group="attack")
def m209(c):
    if c.ply <= 16:
        return 0.0
    retreat = F.rel_rank(c.us, c.move.to_square) <= 3 and F.rel_rank(c.us, c.move.to_square) < F.rel_rank(c.us, c.move.from_square) and c.piece.piece_type != chess.KING
    return (-4.50 if retreat else 0.0) + 0.85 * max(0, F.king_ring_attack_count(c.nb, c.us) - F.king_ring_attack_count(c.board, c.us))


restricted(210, "Bimodal 'cortisol' move-time pacing (fabricated human timing / psychological pressure through delays). Archived.")


@motif(211, "Straitjacket Multi-Pin", 3.20, group="tactic")
def m211(c):
    n = F.count_pinned_pieces(c.nb, c.them)
    return float((n - 1) ** 2) if n >= 2 and n > F.count_pinned_pieces(c.board, c.them) else 0.0


@motif(212, "Poisoned-Check Roulette", 4.80, ["replies"], level="VERIFICATION")
def m212(c):
    if not c.reply or not c.reply.evals:
        return 0.0
    checks = [m.uci() for m in c.nb.legal_moves if c.nb.gives_check(m)]
    if not 2 <= len(checks) <= 4 or any(u not in c.reply.evals for u in checks):
        return 0.0
    return 1.0 if all(c.reply.evals[u] >= 200 for u in checks) else 0.0


@motif(213, "Meatgrinder Exchange Sac", 5.40, ["eval", "history", "replies"], level="VERIFICATION", group="sacrifice")
def m213(c):
    if (not m014_like(c) or F.closed_files_count(c.nb) < 5 or c.ev(-999) < -35
            or not c.reply or not c.reply.evals):
        return 0.0
    best = min(c.reply.evals.values())
    if not any(value == best and chess.Move.from_uci(uci).to_square == c.move.to_square
               for uci, value in c.reply.evals.items()):
        return 0.0
    before = c.board.root()
    minor = c.board.piece_type_at(c.move.to_square)
    moves = c.board.move_stack
    for i, move in enumerate(moves):
        capture = (before.turn == c.us and before.piece_type_at(move.from_square) == chess.ROOK
                   and before.is_capture(move)
                   and {minor, before.piece_type_at(move.to_square)} == {chess.KNIGHT, chess.BISHOP})
        before.push(move)
        if capture and i + 1 < len(moves) and moves[i + 1].to_square == move.to_square:
            return 1.0
    return 0.0


def m014_like(c):
    return c.piece.piece_type == chess.ROOK and c.is_capture and c.board.piece_type_at(c.move.to_square) in (chess.KNIGHT, chess.BISHOP)


@motif(214, "No-Castling Blood Oath", 1.0, group="style-extreme")
def m214(c):
    if not c.board.is_castling(c.move):
        return 0.0
    if c.nb.is_checkmate():
        return 25.0
    if c.nb.is_check():
        return 4.50
    return -3.80


@motif(215, "Judas Self-Entombment", 2.40, group="cage")
def m215(c):
    ek = c.nb.king(c.them)
    blocks = sum(1 for s in F.king_ring_squares(ek) if c.nb.color_at(s) == c.them)
    return float(blocks - 2) if blocks >= 3 else 0.0


@motif(216, "Phantom-Threat Engine", 5.50, ["eval", "maia", "replies"], level="VERIFICATION", group="human")
def m216(c):
    if not c.quiet or c.best_cp is None or abs(c.ev() - c.best_cp) > 25:
        return 0.0
    u, _ = _top_reply(c)
    loss = _reply_loss(c, u) if u else None
    return 1.0 if loss is not None and loss >= 120 else 0.0


@motif(217, "Untouchable Zombie Parade", 3.80, ["eval", "history"], level="VERIFICATION", group="sacrifice")
def m217(c):
    to = c.move.to_square
    if c.piece.piece_type in (chess.PAWN, chess.KING) or len(c.nb.attackers(c.them, to)) <= len(c.nb.attackers(c.us, to)) or c.ev(-999) < -35:
        return 0.0
    streak = c.state.zombie_streak + 1 if c.state.last_moved_to == c.move.from_square else 1
    return float(streak)


@motif(218, "Mirror-Soul Punisher", 3.10, ["history"], group="opening")
def m218(c):  # classify the opponent's plies 1-5 opening motif and play the same weapon back (same move shape, mirrored)
    if c.ply > 12 or len(c.state.opp_moves) < 1:
        return 0.0
    from chimera.omega.openings import classify_motif, move_shape
    mot = classify_motif(c.state.opp_moves[:5])
    return 1.0 if mot and move_shape(c.board, c.move) == mot else 0.0


@motif(219, "Mercy-Denial Stalemate", -12.0, ["eval"], group="style-extreme")
def m219(c):
    pieces = [p for p in c.board.piece_map().values() if p.color == c.them and p.piece_type != chess.KING]
    if len(pieces) != 1 or pieces[0].piece_type != chess.PAWN or not c.is_capture or c.nb.is_checkmate():
        return 0.0
    return 1.0 if c.ev() >= 300 else 0.0


@motif(220, "Silent-Executioner Mate", 1.0, ["history"], group="mate")
def m220(c):
    if c.state.checks_given != 0 or not c.gives_check:
        return 0.0
    return 18.0 if c.nb.is_checkmate() else -4.20


IMPLEMENTED = sorted(REGISTRY)


def score_move(ctx: Ctx, enabled: Optional[Set[int]] = None, weights: Optional[Dict[int, float]] = None, have: Set[str] = frozenset()):
    """Returns (total, breakdown) over motifs whose evidence needs are available. breakdown: id -> weighted value."""
    total, bd = 0.0, {}
    available = have | {"history", "clock"}
    for n, m in REGISTRY.items():
        if enabled is not None and n not in enabled:
            continue
        if not m.needs <= available:
            continue
        v = m.fn(ctx)
        if v:
            w = (weights or {}).get(n, m.weight)
            bd[n] = w * v if m.weight != 0 else 0.0
            total += bd[n]
    return total, bd
