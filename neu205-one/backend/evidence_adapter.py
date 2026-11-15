"""HTTP companion adapter to Claude's frozen Evidence API v1.
BM25 implementation frozen unchanged from upstream 448d55f0497f7f41932869edf30084419574752a.
This is an adapter, not a replacement retrieval experiment.
"""
import hashlib,json,re,time
from pathlib import Path
from frozen_bm25 import BM25,tokens
SCHEMA='neu205.evidence.v1'
class Evidence:
    def __init__(self,corpus,manifest):
        self.path=Path(corpus);self.manifest_path=Path(manifest)
        body=self.path.read_bytes();m=json.loads(self.manifest_path.read_text())
        self.sha=hashlib.sha256(body).hexdigest()
        if self.sha!=m.get('corpus_sha256'):raise ValueError('corpus digest mismatch')
        self.chunks=[json.loads(l) for l in body.splitlines() if l]
        ids=set();pages=set()
        for c in self.chunks:
            cid=c['chunk_id'];a=c['book_pdf_start_page'];b=c['book_pdf_end_page']
            if not isinstance(cid,str) or cid in ids:raise ValueError('duplicate or invalid chunk id')
            ids.add(cid)
            if not isinstance(a,int) or not isinstance(b,int) or a<1 or b<a or b>299:raise ValueError('invalid page span')
            pages.update(range(a,b+1))
            if hashlib.sha256(c['verbatim_text'].encode()).hexdigest()!=c['source_hash']:raise ValueError('chunk digest mismatch')
            if not isinstance(c['section_path'],str):raise ValueError('invalid section path')
        if not self.chunks or m.get('pages')!=299 or pages!=set(range(1,300)):raise ValueError('complete 299-page corpus required')
        if m.get('chunks')!=len(self.chunks):raise ValueError('manifest chunk count mismatch')
        self.index=BM25([c['section_path']+' :: '+c['verbatim_text'] for c in self.chunks])
        self.fingerprint=self.stat()
    def stat(self):return [(p.stat().st_size,p.stat().st_mtime_ns) for p in (self.path,self.manifest_path)]
    def search(self,r,cancel=None):
        t=time.monotonic();rid=r.get('request_id','')
        out=dict(schema=SCHEMA,request_id=rid,corpus_sha256=self.sha,strategy='bm25-v1',elapsed_ms=0,passages=[],evidence_status='INVALID_REQUEST')
        def done(status,error=None,passages=None):
            out.update(evidence_status=status,elapsed_ms=round((time.monotonic()-t)*1000,3))
            if error:out['error']=error
            if passages is not None:out['passages']=passages
            return out
        if self.stat()!=self.fingerprint:return done('INDEX_CORRUPT','Corpus assets changed since verification; restart after verified import.')
        if r.get('schema')!=SCHEMA:return done('INVALID_REQUEST','schema mismatch')
        if not isinstance(rid,str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,64}',rid):return done('INVALID_REQUEST','bad request_id')
        q=r.get('utterance_text')
        if not isinstance(q,str) or not q.strip() or len(q)>1000:return done('INVALID_REQUEST','utterance_text must be 1–1000 chars')
        k=r.get('max_passages');budget=r.get('latency_budget_ms')
        if type(k) is not int or not 1<=k<=20:return done('INVALID_REQUEST','max_passages must be 1–20')
        if type(budget) is not int or not 1<=budget<=10000:return done('INVALID_REQUEST','latency_budget_ms must be 1–10000')
        topics=r.get('conversation_topics',[])
        if not isinstance(topics,list) or len(topics)>8 or any(not isinstance(x,str) or len(x)>200 for x in topics):return done('INVALID_REQUEST','invalid conversation_topics')
        if not isinstance(r.get('corpus_sha256'),str) or not re.fullmatch('[0-9a-f]{64}',r['corpus_sha256']):return done('INVALID_REQUEST','corpus_sha256 must be 64 hex')
        if r['corpus_sha256']!=self.sha:return done('CORPUS_MISMATCH','request corpus digest does not match loaded index')
        if re.search(r'\b(it|its|they|them|their|this|that|these|those)\b',q,re.I) or len(tokens(q))<=2:q+=' '+' '.join(topics)
        if cancel and cancel.is_set():return done('CANCELLED')
        hits=self.index.search(q,k);passages=[];best=0
        for i,score in hits:
            if cancel and cancel.is_set():return done('CANCELLED')
            coverage=self.index.coverage(q,i);best=max(best,coverage)
            passages.append(dict(self.chunks[i],retrieval_scores={'bm25':score,'coverage':coverage}))
        elapsed=(time.monotonic()-t)*1000
        if elapsed>budget:return done('BUDGET_EXCEEDED',passages=passages)
        status='NONE' if not passages or best<.35 else 'WEAK' if best<.60 else 'OK'
        return done(status,passages=[] if status=='NONE' else passages)
