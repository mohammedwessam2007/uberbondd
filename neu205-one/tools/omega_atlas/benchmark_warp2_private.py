#!/usr/bin/env python3
"""PRIVATE source-only historical DEV evaluation. Prints aggregate metrics only.
No questions, answers, source quotations or PDF text are written to outputs.
This set is exposed DEV; results are not medical answers or blind evaluation.
"""
from __future__ import annotations
import json,sys,time,zipfile,hashlib,math,statistics,re,collections
from pathlib import Path
import argparse
from warp2_offline_page_index import WARP2,extract_verified_pages,hash_bytes

def percentile(nums,p):
    return sorted(nums)[max(0,math.ceil(len(nums)*p)-1)]

def main(path:Path):
    with zipfile.ZipFile(path) as z:
        pdf=z.read('private/NEU205 Neuroscience Text Only.pdf')
        probes=[p for fn in ('probes_p001_100.json','probes_p101_200.json','probes_p201_299.json')
                  for p in json.loads(z.read('private/v05/probes/'+fn))
                  if p.get('split')=='dev' and p.get('kind')=='supported' and p.get('pages') and p.get('source_quote')]
    pages=extract_verified_pages(pdf)
    t0=time.perf_counter();index=WARP2(pages,hash_bytes(pdf));build_ms=(time.perf_counter()-t0)*1000
    assert len(probes)==150
    norm=lambda s:re.sub(r'\W+',' ',s.casefold()).strip()
    original_support=sum(any(norm(p['source_quote']) in norm(pages[k-1]) for k in p['pages']) for p in probes)
    positions=[];sizes=[];query_times=[];found_at={1:0,3:0,5:0,10:0,20:0,40:0};routes=collections.Counter()
    for p in probes:
        t0=time.perf_counter();result=index.candidate_pages(p['question'],20);query_times.append((time.perf_counter()-t0)*1000)
        got=[x['page'] for x in result['pages']]
        sizes.append(len(got));gold=set(p['pages'])
        positions.append(next((i+1 for i,v in enumerate(got) if v in gold),None))
        for k in found_at:found_at[k]+=bool(gold & set(got[:k]))
        for r in result['pages'][:5]:
            for x in r['routes']:routes[x]+=1
    out={'scope':'HISTORICAL_EXPOSED_DEV_SOURCE_PAGE_RECALL_NOT_CLINICAL_QA','source_pdf_sha256':hash_bytes(pdf),'source_pages':len(pages),
         'questions':len(probes),'gold_normalized_present_in_original_pdf':original_support,
         'sparse_candidate_routes':['character_word_boundary_3_5','word_1_2'],
         'per_route_limit':20,'page_candidate_count_mean':round(statistics.mean(sizes),2),'page_candidate_count_max':max(sizes),
         'page_recall_at_rank':{str(k):v for k,v in found_at.items()},
         'unrecovered_pages_at_rank40':len(probes)-found_at[40],
         'index_build_ms_host':round(build_ms,2),'query_ms_host':{'p50':round(statistics.median(query_times),3),'p95':round(percentile(query_times,.95),3),'max':round(max(query_times),3)},
         'not_a_medical_answer_result':True,'not_fresh_blind_test':True,'independent_clinical_review':False,'on_phone_benchmarked':False,
         'page_source_text_exported':False,'private_questions_exported':False}
    print(json.dumps(out,indent=2,sort_keys=True))
if __name__=='__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--private-zip', type=Path, required=True, help='Explicit owner-private original source archive')
    args = p.parse_args()
    main(args.private_zip)
