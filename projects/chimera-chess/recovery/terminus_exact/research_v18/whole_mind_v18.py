"""Local proof-tree experimental runtime. Preserves V17 fallback and actual shared budget.
The frozen Terminus engine is separate. No external move-time simulation.
"""
import time
from mind import Exhausted, Budget
from whole_mind_v17 import Mind as V17, Meter
from board import Move
from plan_tree import prove, verify_certificate, BranchMemory

class Mind(V17):
    def __init__(self,student,style=True,memory=True):
        super().__init__(student,style,memory);self.branch_memory=None;self.plan_depth=5
    def reset(self):self.branch_memory=None;self.intent=None
    def choose(self,h,limit=256,deadline=None,stop=None,external=None):
        start=time.monotonic();b=h.board;meter=Meter(limit,deadline,stop);logs=[]
        old=self.branch_memory;self.branch_memory=None
        def finish(m,c,depth,source):
            if self.memory and c and c.get('child',{}).get('replies'):
                self.branch_memory=BranchMemory.after_root(b,depth,c)
            return m,{'source':source,'move':m.uci() if m else None,'used':meter.used,'ms':1000*(time.monotonic()-start),'plan_attempts':logs,'plan_horizon':depth,'certificate':c,'memory_branches':len(self.branch_memory.replies) if self.branch_memory else 0,'assessment':'bounded_exact_mate_proof_local_rules','selected_pdf_ids':[]}
        try:
            # For all nonterminal roots first search immediate mate, including when memory exists.
            legal=meter.legal(b)
            if b.terminal(legal):return finish(None,None,0,'terminal')
            p=prove(b,b.white,1,meter);logs.append({'horizon':1,'status':p.status,'used':p.expansions})
            if p.status=='proved':return finish(Move.parse(p.certificate['move']),p.certificate,1,'immediate_mate')
            if old and self.memory:
                m,c,event=old.resume(b,meter);logs.append({'memory':event})
                if m:return finish(m,c,old.remaining,'branch_memory_reverified')
            # Reserve one quarter for baseline fallback. Only allocate remaining proof budget.
            cap=max(meter.used,3*limit//4);meter.limit=cap
            for depth in range(3,self.plan_depth+1,2):
                p=prove(b,b.white,depth,meter);logs.append({'horizon':depth,'status':p.status,'used':p.expansions})
                if p.status=='proved':return finish(Move.parse(p.certificate['move']),p.certificate,depth,'branch_plan_proved')
                if p.status=='unknown':break
        except Exhausted:pass
        # Avoid double-spending the counted legal generations. Emergency move if exhausted.
        remaining=limit-meter.used
        if remaining<4 or (deadline is not None and time.monotonic()>=deadline) or (stop and stop.is_set()):
            legal=b.legal();m=legal[0] if legal and not b.terminal(legal) else None
            return finish(m,None,0,'emergency_fallback')
        m,r=super().choose(h,remaining,deadline,stop,external);r['used']+=meter.used;r['plan_attempts']=logs;r['ms']=1000*(time.monotonic()-start);return m,r
