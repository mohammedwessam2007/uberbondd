#!/usr/bin/env python3
"""Source-scoped *lexical* overlap probe: PHOENIX versus static UberBond graph.

This is not semantic dedup, capability admission, installation, or a negative
claim about the thousands of capabilities outside this one legacy graph.
"""
import argparse
import importlib.util
import json
import pathlib
import re

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('phoenix_doctor',ROOT/'scripts/phoenix-ten-wave-genome-doctor.py')
DOCTOR=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(DOCTOR)
PAIR_RE=re.compile(r"\bid:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'")
WORDS=re.compile(r'[a-z0-9]+')
STOP={'capability','agent','system','tool','tools','engine','and','for','with','the','a','to','of','in','from','work','data'}
def tokens(x):return set(WORDS.findall(x.lower()))-STOP
def similarity(a,b):
    a=tokens(a);b=tokens(b)
    return round(len(a&b)/max(1,len(a|b)),4)

def probe(root=ROOT):
    index=DOCTOR.build(root)
    source=root/'src/capability-graph.mjs'
    if not source.is_file():raise ValueError('LEGACY_CAPABILITY_GRAPH_MISSING')
    # Partial by design: the REGISTRY also includes computed or rewrapped entries.
    legacy=[{'id':m.group(1),'title':m.group(2)} for m in PAIR_RE.finditer(source.read_text())]
    if not legacy:raise ValueError('STATIC_LEGACY_CAPABILITY_PAIRS_MISSING')
    matches=[];high=0
    for row in index['records']:
        scores=sorted(((similarity(row['title'],old['title']),old['id'],old['title']) for old in legacy),reverse=True)
        score,cid,title=scores[0]
        if score>=0.5:high+=1
        matches.append({'proposal_id':row['id'],'wave':row['wave'],'best_legacy_id':cid,'best_legacy_title':title,'lexical_jaccard':score,
                        'status':'RESEARCH_ONLY_REQUIRES_SEMANTIC_REVIEW','existing_capability_callability':'UNKNOWN'})
    return {'schema':'uberbond.phoenix.lexical-overlap.v1','method':'JACCARD_TITLE_TERMS_ON_PARTIAL_STATIC_GRAPH',
            'source':'src/capability-graph.mjs','legacy_static_name_pairs':len(legacy),'proposals':len(matches),'title_similarity_ge_05':high,
            'limitation':'NOT_SEMANTIC_DEDUP; NOT_FULL_REPO_AUDIT; NOT_OPERATIONAL_PROOF',
            'authority':'NONE','matches':matches}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output');p.add_argument('--min-score',type=float,default=0.5);a=p.parse_args()
    if not 0<=a.min_score<=1:p.error('--min-score out of bounds')
    result=probe()
    if a.output:
        dest=pathlib.Path(a.output);dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    short=[x for x in result['matches'] if x['lexical_jaccard']>=a.min_score]
    print(json.dumps({k:v for k,v in result.items() if k!='matches'}|{'matches_above_threshold':len(short),'examples':short[:15]},indent=2))
if __name__=='__main__':main()
