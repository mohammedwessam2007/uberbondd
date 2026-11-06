#!/usr/bin/env python3
"""NEU205 WARP v0.3 opt-in proof packet, code only.

Precompute nested, source-offset source windows once. Query uses WARP2's sparse
page postings and two window inverted indexes; no PDF file scan at query time.
Every excerpt has a byte-verifiable SHA citation, NEVER a semantic fact claim.

This is an experimental retrieval index, NOT an answerer or clinical verifier.
"""
from __future__ import annotations
from dataclasses import dataclass
from collections import defaultdict
import hashlib
import re
from typing import Callable
try:
    from warp2_offline_page_index import WARP2, SparseTfidf, _chargrams, _wordgrams, hash_bytes
except ImportError:
    from .warp2_offline_page_index import WARP2, SparseTfidf, _chargrams, _wordgrams, hash_bytes

WORD = re.compile(r'\S+')
QUALIFIER = re.compile(r'(?i)\b(left|right|bilateral|unilateral|medial|lateral|anterior|posterior|not|never|except|without|only|always|before|after|higher|lower)\b')

@dataclass(frozen=True)
class Window:
    page: int
    char_start: int
    char_end: int
    words: int
    page_hash: str
    snippet_hash: str

class WARP3:
    def __init__(self, pages: list[str], pdf_sha256: str,
                 expected_pages: int = 299, window_words: int = 160,
                 stride_words: int = 48):
        if type(window_words) is not int or type(stride_words) is not int or not (60 <= window_words <= 320) or not (1 <= stride_words <= window_words - 48):
            raise ValueError('Unsafe window/stride')
        self.locator = WARP2(pages,pdf_sha256,expected_pages=expected_pages)
        self.pages = tuple(pages)
        self.windows = []
        self.by_page = defaultdict(list)
        snippets = []
        for page,source in enumerate(self.pages,1):
            words=list(WORD.finditer(source))
            for i in range(0,len(words),stride_words):
                end=min(i+window_words,len(words))
                if end-i<20 and i>0:break
                first=words[i].start();last=words[end-1].end()
                excerpt=source[first:last]
                w=Window(page,first,last,end-i,hash_bytes(source.encode()),hash_bytes(excerpt.encode()))
                idx=len(self.windows);self.windows.append(w);self.by_page[page].append(idx);snippets.append(excerpt)
                if end==len(words):break
        if len(self.windows)<len(self.pages):
            raise ValueError('Each source page must be indexed')
        self.word_index=SparseTfidf(snippets,_wordgrams)
        self.char_index=SparseTfidf(snippets,_chargrams)
        self.schema='warp3.exact-source-windows.v1'

    def _validate_window(self,idx:int):
        if type(idx) is not int or not 0<=idx<len(self.windows):raise ValueError('Unknown indexed window')
        w=self.windows[idx]
        src=self.pages[w.page-1]
        if not self.locator.check(w.page) or hash_bytes(src.encode())!=w.page_hash:
            raise ValueError('Original source page hash mismatch')
        text=src[w.char_start:w.char_end]
        if hash_bytes(text.encode())!=w.snippet_hash:raise ValueError('Indexed source window mismatch')
        return w,text

    def warrant(self,idx:int,metadata_only:bool=True):
        w,text=self._validate_window(idx)
        res={'source_document_sha256':self.locator.index_source_pdf_sha256,
             'source_page':w.page,'page_sha256':w.page_hash,
             'char_start':w.char_start,'char_end':w.char_end,
             'source_excerpt_sha256':w.snippet_hash,'source_word_count':w.words,
             'literal_text_verified':True,'relation_verified':False,'medical_accuracy_verified':False}
        if not metadata_only:res['exact_text']=text
        return res

    def pack(self,question:str,per_route:int=20,max_windows:int=5,word_budget:int=650,
             per_page_cap:int=2,cancel:Callable[[],bool]|None=None,
             metadata_only:bool=True):
        if not isinstance(question,str) or not 1<=len(question.strip())<=1000:raise ValueError('Invalid query')
        if type(max_windows) is not int or not 1<=max_windows<=12:raise ValueError('Invalid max_windows')
        if type(word_budget) is not int or not 100<=word_budget<=1600:raise ValueError('Invalid word budget')
        if type(per_page_cap) is not int or not 1<=per_page_cap<=4:raise ValueError('Invalid per_page_cap')
        if cancel is not None and cancel():return {'status':'CANCELLED','evidence':[]}
        loc=self.locator.candidate_pages(question,per_route,cancel)
        if loc['status']=='CANCELLED':return {'status':'CANCELLED','evidence':[]}
        page_rank={d['page']:i for i,d in enumerate(loc['pages'])}
        c_score=self.char_index.scores(question); w_score=self.word_index.scores(question)
        # Candidate-ID-only scan of sparse postings plus per-page window lookup.
        candidates=[i for pg in page_rank for i in self.by_page[pg]]
        def key(idx):
            page=self.windows[idx].page
            # Small prior favours the independent high-recall page ranking.
            rank=page_rank[page]
            return (-((float(c_score.get(idx,0))+float(w_score.get(idx,0)))/2+.045/(1+rank/4)),idx)
        candidates.sort(key=key)
        selected=[];spent=0;page_counts=defaultdict(int)
        # These are attention flags, NOT evidence of semantic support or contradiction.
        query_has_qualifier = bool(QUALIFIER.search(question))
        for i in candidates:
            if cancel is not None and cancel():return {'status':'CANCELLED','evidence':[]}
            v=self.windows[i]
            if len(selected)==max_windows:break
            if spent+v.words>word_budget or page_counts[v.page]>=per_page_cap:continue
            # Protect context from redundant heavily overlapping windows on same page.
            intersects=False
            for j in selected:
                other=self.windows[j]
                if other.page!=v.page:continue
                overlap=max(0,min(other.char_end,v.char_end)-max(other.char_start,v.char_start))
                if overlap/max(1,min(other.char_end-other.char_start,v.char_end-v.char_start))>.50:
                    intersects=True;break
            if intersects:continue
            selected.append(i);spent+=v.words;page_counts[v.page]+=1
        if cancel is not None and cancel():return {'status':'CANCELLED','evidence':[]}
        evid=[self.warrant(i,metadata_only) for i in selected]
        return {'status':'EXACT_SOURCE_CANDIDATES_NOT_VERIFIED_ANSWERS',
                'schema':self.schema,'evidence':evid,
                'window_ids':selected,'total_source_pages':len(self.pages),
                'candidate_pages':len(page_rank),'window_candidates_considered':len(candidates),
                'packed_words':spent,'word_budget':word_budget,
                'page_scan_at_question_time':False,
                'qualifier_sensitive_question':query_has_qualifier,
                'independent_relation_check_required':True,
                'not_enough_evidence_to_certify_an_answer':True,
                'claim_entailment_verified':False,
                'unsupported_question_refusal_calibrated':False}

    def exact_quote_gate(self,claim:str,idx:int):
        if not isinstance(claim,str) or not claim.strip():return {'decision':'REJECT','reason':'EMPTY_CLAIM'}
        w,text=self._validate_window(idx)
        a=text.find(claim)
        if a<0:return {'decision':'REJECT','reason':'NOT_EXACTLY_QUOTED'}
        return {'decision':'SOURCE_SUBSTRING_ONLY','source_page':w.page,
                'absolute_char_start':w.char_start+a,'absolute_char_end':w.char_start+a+len(claim),
                'quote_sha256':hash_bytes(claim.encode()),
                'semantic_entailment_verified':False,'medical_accuracy_verified':False}
