"""Proof-carrying finite-horizon chess plans. Board adapter keeps runtime independent.
A win is only reported after every defender action is certified. Exhaustion != loss.
"""
from dataclasses import dataclass
from hashlib import sha256
import json
from board import Move, ours, KI, step
from mind import Budget, Exhausted, state_id

@dataclass
class SearchResult:
    status: str
    certificate: dict | None
    expansions: int

# A cheap ordering heuristic; not an evaluation or proof.
def order(b, moves, attacker):
    def key(m):
        n=b.push(m,False);k=n.king(not attacker)
        ring=[s for d in KI if (s:=step(k,d))>=0]
        return (int(n.check()) if b.white==attacker else int(not n.check()),
                sum(n.attacked(s,attacker) for s in ring), int(b.cells[m.b]!='.'))
    return sorted(moves,key=key,reverse=b.white==attacker)

def prove(b, attacker, horizon, budget):
    start=budget.used
    def visit(p,d):
        lm=budget.legal(p);term=p.terminal(lm,claim=False)
        if term=='mate':return {'state':state_id(p),'mate':True} if p.white!=attacker else None
        if term or d==0:return None
        attacking=p.white==attacker
        # Defender may claim now OR by announcing a legal move. Conservative refusal.
        if not attacking and (p.draw_claim() or any(p.push(m).draw_claim() for m in lm)):return None
        # Immediate mate scan costs only legal generations for checking moves.
        ms=order(p,lm,attacker)
        if attacking:
            for m in ms:
                n=p.push(m)
                if n.check() and n.terminal(budget.legal(n))=='mate':
                    return {'state':state_id(p),'move':m.uci(),'child':{'state':state_id(n),'mate':True}}
            if d==1:return None
            for m in ms:
                sub=visit(p.push(m),d-1)
                if sub is not None:return {'state':state_id(p),'move':m.uci(),'child':sub}
            return None
        if d==1:return None
        replies={}
        for m in ms:
            sub=visit(p.push(m),d-1)
            if sub is None:return None
            replies[m.uci()]=sub
        return {'state':state_id(p),'replies':replies}
    try:
        cert=visit(b,horizon)
        return SearchResult('proved' if cert else 'refuted',cert,budget.used-start)
    except Exhausted:return SearchResult('unknown',None,budget.used-start)

def verify_certificate(b,attacker,horizon,cert,budget):
    """Independent structural checker, same board rules; rejects missing branches and draw rights."""
    def check(p,d,c):
        if not isinstance(c,dict) or c.get('state')!=state_id(p):return False
        lm=budget.legal(p);term=p.terminal(lm)
        if 'mate' in c:return set(c)=={'state','mate'} and c['mate'] is True and term=='mate' and p.white!=attacker
        if term or not d:return False
        if p.white==attacker:
            if set(c)!={'state','move','child'}:return False
            m=next((m for m in lm if m.uci()==c['move']),None)
            return m is not None and check(p.push(m),d-1,c['child'])
        if p.draw_claim() or any(p.push(m).draw_claim() for m in lm):return False
        if set(c)!={'state','replies'} or not isinstance(c['replies'],dict) or set(c['replies'])!={m.uci() for m in lm}:return False
        return all(check(p.push(m),d-1,c['replies'][m.uci()]) for m in lm)
    try:return 'proved' if check(b,horizon,cert) else 'invalid'
    except Exhausted:return 'unknown'

@dataclass
class BranchMemory:
    attacker:bool
    remaining:int
    replies:dict
    @classmethod
    def after_root(cls,b,horizon,cert):
        return cls(b.white,horizon-2,cert['child'].get('replies',{}))
    def resume(self,b,budget):
        for c in self.replies.values():
            if c['state']==state_id(b):
                status=verify_certificate(b,self.attacker,self.remaining,c,budget)
                if status=='proved' and 'move' in c:
                    return Move.parse(c['move']),c,'reverified_branch'
                return None,None,status
        return None,None,'unrelated_state'
