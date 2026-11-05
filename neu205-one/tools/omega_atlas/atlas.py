#!/usr/bin/env python3
"""NEU205 Atlas v0.1: optional diagnostic lexical proximity index.

No model, internet, patient data, secret key, release signing, or clinical inference.
Every passage remains verbatim and pinned to its source hash. This ranker
DOES NOT prove entailment, and it never replaces the original BM25 index.
"""
import argparse
import collections
import hashlib
import json
import math
import re
import sys
from pathlib import Path

STOP = set('''a an the is are was were be been being and or of in on for from to by with at into about as that this these those it its what which who whom whose how why where when does do did can could should would may might there here tell me please describe explain define give list name main you your i my we our s also then than so such any all'''.split())
ION = re.compile(r'\b(K|Na|Ca|Cl|Mg|H|Fe|Zn)(?:\d?\+{1,2}|-)(?=\W|$)')
TOK = re.compile(r'[a-z0-9]+')
LEMMA = dict(x.split('=') for x in '''contain=content contains=content contained=content containing=content contents=content innervation=innervate innervated=innervate innervates=innervate innervating=innervate originate=origin originates=origin arise=origin arises=origin arising=origin arose=origin inserted=insertion inserts=insertion insert=insertion drains=drainage drain=drainage drained=drainage draining=drainage located=site location=site situated=site lies=lie lying=lie functions=function functional=function supplies=supply supplied=supply branches=branch branching=branch terminates=termination terminate=termination ends=termination'''.split())
SUFFIX = [('ational','ate',8),('ization','ize',8),('iveness','ive',8),('fulness','ful',8),('ousness','ous',8),('ies','y',5),('ied','y',5),('sses','ss',5),('ing','',6),('edly','',7),('ed','',5),('ly','',5),('es','',5),('s','',4)]

def stem(w):
    if w in LEMMA:return LEMMA[w]
    if len(w)<=3:return w
    for suf,rep,minlen in SUFFIX:
        if w.endswith(suf) and len(w)>=minlen and not(suf=='s' and w.endswith(('ss','us','is'))) and not(suf=='ed' and w.endswith('eed')):
            return w[:-len(suf)]+rep
    return w

def terms(t, drop_stop=True):
    t=ION.sub(lambda m:' '+m.group(1).lower()+'ion ',t).lower().replace('-',' ')
    return [stem(w) for w in TOK.findall(t) if not(drop_stop and (w in STOP or len(w)<2))]

# Mechanical relation families. Applied to query and document alike; not asserted as medical facts.
RELATIONS={'innervate':'nerve', 'nerve':'nerve', 'supply':'supply','artery':'supply','vascular':'supply', 'blood':'supply', 'drainage':'drainage', 'vein':'drainage', 'origin':'origin', 'insertion':'insertion', 'boundary':'boundary', 'boundaries':'boundary','medial':'laterality','lateral':'laterality','left':'laterality','right':'laterality', 'anterior':'direction','posterior':'direction','superior':'direction','inferior':'direction'}
NEGATIVE=set('not no never without absent absence except excluding neither nor lack lacks deficient'.split())

def sha(b):return hashlib.sha256(b).hexdigest()

def checked_rows(raw, expected_corpus_sha=None, require_pages=False):
    if expected_corpus_sha and sha(raw)!=expected_corpus_sha:raise ValueError('corpus hash mismatch')
    rows=[]; ids=set(); pages=set()
    for line in raw.decode('utf-8').splitlines():
        if not line.strip():continue
        r=json.loads(line)
        if not isinstance(r,dict) or not all(k in r for k in ('chunk_id','section_path','verbatim_text','source_hash','book_pdf_start_page','book_pdf_end_page')):raise ValueError('schema mismatch')
        if not isinstance(r['chunk_id'],str) or r['chunk_id'] in ids:raise ValueError('duplicate/bad id')
        ids.add(r['chunk_id']); text=r['verbatim_text']; page=r['book_pdf_start_page']; end=r['book_pdf_end_page']
        if not isinstance(text,str) or sha(text.encode())!=r['source_hash']:raise ValueError('source hash mismatch')
        if not (isinstance(page,int) and isinstance(end,int) and 1<=page<=end<=299):raise ValueError('page span mismatch')
        pages.update(range(page,end+1));rows.append(r)
    if not rows or (require_pages and len(pages)!=299):raise ValueError('source coverage incomplete')
    return rows

class BM25:
    """Exact scoring/stemming semantics ported from current repository Python baseline."""
    def __init__(self,docs,k1=1.2,b=0.75):
        self.k1,self.b=k1,b
        self.docs=[terms(d) for d in docs];self.n=len(self.docs)
        self.avg=sum(map(len,self.docs))/max(1,self.n)
        self.tf=[];self.df=collections.Counter();self.post=collections.defaultdict(list)
        for i,d in enumerate(self.docs):
            tf=collections.Counter(d);self.tf.append(tf)
            for w in tf:self.df[w]+=1;self.post[w].append(i)
    def idf(self,w):return math.log(1+(self.n-self.df.get(w,0)+.5)/(self.df.get(w,0)+.5))
    def search(self,q,k=20):
        scores=collections.defaultdict(float)
        for w in set(terms(q)):
            if w not in self.post:continue
            idf=self.idf(w)
            for i in self.post[w]:
                tf=self.tf[i][w];dl=len(self.docs[i]);scores[i]+=idf*tf*(self.k1+1)/(tf+self.k1*(1-self.b+self.b*dl/self.avg))
        return sorted(scores.items(),key=lambda x:-x[1])[:k]
    def coverage(self,q,i):
        ts=set(terms(q));den=sum(self.idf(t) for t in ts) or 1
        return sum(self.idf(t) for t in ts if t in self.tf[i])/den

# Exact source span boundary. Never split a source sentence at a decimal point or blindly
# around abbreviation punctuation. Whole sentence/context retained unmodified.
SENT_BOUND = re.compile(r'(?<=[.!?:;])\s+(?=[A-Z(0-9])')

def windows(source):
    # Source is already normalized by the original book corpus compiler; exact substring policy.
    parts=[];offset=0
    for m in SENT_BOUND.finditer(source):
        s,e=offset,m.start();
        if e>s:parts.append((s,e,source[s:e]))
        offset=m.end()
    if offset<len(source):parts.append((offset,len(source),source[offset:]))
    return parts or [(0,len(source),source)]

class Atlas:
    def __init__(self,rows):
        self.rows=rows;self.bm=BM25([r['section_path']+' :: '+r['verbatim_text'] for r in rows])
        self.section=[r['section_path'] for r in rows]
        self.local=[windows(r['verbatim_text']) for r in rows]
        self.lex=[[terms(x[2]) for x in loc] for loc in self.local]
        self.page_to_chunks=collections.defaultdict(list)
        for i,r in enumerate(rows):
            for p in range(r['book_pdf_start_page'],r['book_pdf_end_page']+1):self.page_to_chunks[p].append(i)

    def score(self,q,i,baseline):
        qterms=set(terms(q));dterms=self.bm.tf[i]
        covered=sum(self.bm.idf(t) for t in qterms if t in dterms)
        total=sum(self.bm.idf(t) for t in qterms) or 1
        # Co-occurrence in one intact source sentence is stronger diagnostic evidence than
        # spread-out unrelated mentions in a long chunk. Still NOT entailment.
        sent_cov=0.;near=0.;relation=0.
        for seg in self.lex[i]:
            sf=set(seg);hit=qterms & sf
            x=sum(self.bm.idf(t) for t in hit)/total
            if x>sent_cov:sent_cov=x
            if len(hit)>=2:
                pos=[j for j,w in enumerate(seg) if w in hit]
                if pos:
                    span=max(pos)-min(pos)+1
                    near=max(near,len(hit)/(max(1,span)**.5))
            qrel={RELATIONS[t] for t in qterms if t in RELATIONS}
            if qrel and any(RELATIONS.get(t) in qrel for t in sf):relation=max(relation,x)
        # Existing rank remains dominant; facet bonuses are intentionally modest and bounded.
        return baseline + 1.35*sent_cov + .25*min(near,3) + .20*relation + .12*(covered/total)

    def rerank(self,q,k=5,pool=30):
        hits=self.bm.search(q,max(k,pool))
        if not hits:return []
        ranked=sorted(hits,key=lambda pair:(-self.score(q,*pair),-pair[1],pair[0]))
        return ranked[:k]

    def excerpt(self,q,row_index,word_budget=180):
        """Return a single exact contiguous source window, or explicit refusal.
        Do not prune negations, lists, modifiers or mandatory source content.
        Caller must treat this as retrieval support, never as proven answer.
        """
        row=self.rows[row_index]
        if not 20<=word_budget<=1024:raise ValueError('bad word budget')
        seg=self.local[row_index];qset=set(terms(q));want=[]
        for j,(_,_,s) in enumerate(seg):
            ts=set(terms(s));sc=sum(self.bm.idf(t) for t in qset & ts)
            want.append((sc,j))
        if not want:return {'status':'NO_SOURCE','text':None}
        chosen=max(want,key=lambda p:(p[0],-p[1]))[1]
        # Preserve one whole neighboring sentence each side when it fits.
        chosen_ids=[chosen];center=seg[chosen][2];wordcount=len(center.split())
        if wordcount>word_budget:return {'status':'EVIDENCE_UNIT_EXCEEDS_BUDGET','text':None,'chunk_id':row['chunk_id']}
        for neighbor in (chosen-1,chosen+1):
            if neighbor>=0 and neighbor<len(seg):
                words=len(seg[neighbor][2].split())
                if wordcount+words<=word_budget:chosen_ids.append(neighbor);wordcount+=words
        left=min(chosen_ids);right=max(chosen_ids)
        start=seg[left][0];end=seg[right][1]
        # Source slice, never model-generated and not whitespace-reconstructed.
        source=row['verbatim_text'];value=source[start:end]
        assert source[start:end]==value
        return {'status':'VERBATIM_EXCERPT','chunk_id':row['chunk_id'],'source_hash':row['source_hash'], 'book_pdf_start_page':row['book_pdf_start_page'], 'book_pdf_end_page':row['book_pdf_end_page'],'char_start':start,'char_end':end,'excerpt_sha256':sha(value.encode()),'text':value,'not_semantic_entailment':True}


def evaluate_dev(atlas,probes):
    # Diagnostic only. Original V05 DEV probes on pages 1-60, never the newer 437 set.
    out={'dev_supported_total':0,'baseline_page_hit_at5':0,'atlas_page_hit_at5':0,'baseline_quote_hit_at5':0,'atlas_quote_hit_at5':0,'baseline_both':0,'atlas_both':0,'no_new_blind_score':True}
    for p in probes:
        if p.get('split')!='dev' or p.get('kind')!='supported' or not p.get('pages') or max(p['pages'])>60:continue
        out['dev_supported_total']+=1
        q=p['question'];a=[i for i,_ in atlas.bm.search(q,5)];b=[i for i,_ in atlas.rerank(q,5)]
        def hit(indices):
            page=any(not set(range(atlas.rows[i]['book_pdf_start_page'],atlas.rows[i]['book_pdf_end_page']+1)).isdisjoint(p['pages']) for i in indices)
            quote=any(p.get('source_quote','').strip().lower() in atlas.rows[i]['verbatim_text'].lower() for i in indices) if p.get('source_quote','').strip() else False
            return page,quote
        old=hit(a);new=hit(b)
        for label,(page,quote) in [('baseline',old),('atlas',new)]:
            out[label+'_page_hit_at5']+=int(page);out[label+'_quote_hit_at5']+=int(quote);out[label+'_both']+=int(page and quote)
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--corpus',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--dev-probes',type=Path,required=True)
    a=p.parse_args();manifest=json.loads(a.manifest.read_text())
    rows=checked_rows(a.corpus.read_bytes(),expected_corpus_sha=manifest['corpus_sha256'],require_pages=True)
    atlas=Atlas(rows);probes=json.loads(a.dev_probes.read_text())
    print(json.dumps({'source_chunks':len(rows),'source_pages':len(atlas.page_to_chunks),'corpus_sha256':manifest['corpus_sha256'],'comparison':evaluate_dev(atlas,probes)},indent=2))