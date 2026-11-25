"""Optional exact mating-plan memory. Never a positional evaluation or a rating claim."""
from dataclasses import dataclass
import time


class Exhausted(Exception):
    pass


@dataclass
class Allowance:
    maximum: int = 512
    deadline: float | None = None
    stopped: object = None
    used: int = 0

    def check(self):
        if ((self.deadline is not None and time.monotonic() >= self.deadline)
                or (self.stopped is not None and self.stopped())):
            raise Exhausted

    def visit(self):
        self.check()
        if self.used >= self.maximum:
            raise Exhausted
        self.used += 1


class ChessOps:
    """python-chess adapter; retain complete rule history on every child."""
    def turn(self, b): return b.turn
    def key(self, b): return (b.root().fen(), tuple(m.uci() for m in b.move_stack), b.fen())
    def moves(self, b): return list(b.legal_moves)
    def code(self, m): return m.uci()
    def child(self, b, m):
        n = b.copy(stack=True)
        n.push(m)
        return n
    def check(self, b): return b.is_check()
    def drawn(self, b):
        return b.is_insufficient_material() or b.is_seventyfive_moves() or b.is_fivefold_repetition()
    def claim(self, b): return b.can_claim_fifty_moves() or b.can_claim_threefold_repetition()
    def checking(self, b, m): return b.gives_check(m)


def search(b, attacker, horizon, ops, allowance, fixed=None):
    """An AND/OR proof. A certificate exists only if every defense is covered."""
    def visit(p, d, first=None):
        allowance.visit()
        moves = ops.moves(p)
        key = ops.key(p)
        if not moves:
            return ('mate', key) if ops.check(p) and ops.turn(p) != attacker else None
        if d == 0 or ops.drawn(p):
            return None
        attacking = ops.turn(p) == attacker
        if not attacking and ops.claim(p):
            return None
        if attacking:
            if first is not None:
                moves = [m for m in moves if ops.code(m) == first]
            else:
                moves.sort(key=lambda m: not ops.checking(p, m))
            for m in moves:
                allowance.check()
                if d == 1 and not ops.checking(p, m):
                    continue
                child = visit(ops.child(p, m), d - 1)
                if child is not None:
                    return ('move', key, ops.code(m), child)
            return None
        if d == 1:
            return None
        replies = {}
        for m in moves:
            allowance.check()
            child = visit(ops.child(p, m), d - 1)
            if child is None:
                return None
            replies[ops.code(m)] = child
        return ('replies', key, replies)
    try:
        cert = visit(b, horizon, fixed)
        return ('proved', cert) if cert is not None else ('refuted', None)
    except Exhausted:
        return 'unknown', None


def verify(b, attacker, horizon, cert, ops, allowance):
    """Separate checker: exact identity, rules, full reply set, and terminal proof."""
    def visit(p, d, c):
        allowance.visit()
        if not isinstance(c, tuple) or len(c) < 2 or c[1] != ops.key(p):
            return False
        moves = {ops.code(m): m for m in ops.moves(p)}
        if c[0] == 'mate':
            return len(c) == 2 and not moves and ops.check(p) and ops.turn(p) != attacker
        if not moves or d <= 0 or ops.drawn(p):
            return False
        if ops.turn(p) == attacker:
            return (len(c) == 4 and c[0] == 'move' and c[2] in moves
                    and visit(ops.child(p, moves[c[2]]), d - 1, c[3]))
        if ops.claim(p) or len(c) != 3 or c[0] != 'replies' or not isinstance(c[2], dict) or set(c[2]) != set(moves):
            return False
        return all(visit(ops.child(p, m), d - 1, c[2][u]) for u, m in moves.items())
    try:
        return 'proved' if visit(b, horizon, cert) else 'invalid'
    except Exhausted:
        return 'unknown'


@dataclass(frozen=True)
class Plan:
    attacker: bool
    remaining: int
    branches: dict


def after_move(attacker, horizon, cert):
    if cert and cert[0] == 'move' and cert[3][0] == 'replies':
        return Plan(attacker, horizon - 2, cert[3][2])
    return None


def resume(b, plan, ops, allowance):
    """Reject unrelated history and incomplete certificates; never return an unproved move."""
    if ops.turn(b) != plan.attacker:
        return 'unrelated', None, None
    key = ops.key(b)
    for c in plan.branches.values():
        if c[1] != key:
            continue
        status = verify(b, plan.attacker, plan.remaining, c, ops, allowance)
        if status == 'proved' and c[0] == 'move':
            return status, c[2], after_move(plan.attacker, plan.remaining, c)
        return status, None, None
    return 'unrelated', None, None
