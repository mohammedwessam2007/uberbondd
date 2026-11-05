#!/usr/bin/env python3
"""DEV-only source-location/quote-retention and memory stress; NOT answer accuracy.

Never reads examination answers or a held-out key. Developer cases are derived
only from original source capsules on digital pages1–60 by a declared algorithm.
Questions include source terms and are deliberately NOT a generalization set.
"""
import argparse,ast,collections,hashlib,json,re,resource,statistics,sys,time,types
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from active_memory_v11 import ActiveMemory,MemoryFailure,pack_capsules,tokens,sha
from evidence_adapter import Evidence,SCHEMA
from bridge import Brain,Flight
PDF='c3298e8c5f7f807604be10f7376d67f05eb315dd982276263e8f6ad2e8e70940'
def norm(s):return ' '.join(s.split())
def main():
 p=argparse.ArgumentParser();p.add_argument('--memory',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--corpus',type=Path,required=True);p.add_argument('--corpus-manifest',type=Path,required=True);p.add_argument('--claude-source',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 m=json.loads(a.corpus_manifest.read_text());memory=ActiveMemory(a.memory,a.manifest,PDF,m['corpus_sha256']);baseline=Evidence(a.corpus,a.corpus_manifest)
 # Execute the unchanged public donor's documented function after explicit source review.
 sys.path.insert(0,str(a.claude_source/'retrieval'))
 source=(a.claude_source/'retrieval/qwen_eval.py').read_text();tree=ast.parse(source)
 # Load only the reviewed, dependency-free donor function unchanged. Importing
 # its unrelated tournament module would require unused ONNX model libraries.
 selected=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='sentence_evidence' or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SENT' for t in n.targets)]
 namespace={'re':re,'tokens':tokens};exec(compile(ast.Module(body=selected,type_ignores=[]),str(a.claude_source/'retrieval/qwen_eval.py'),'exec'),namespace)
 donor=types.SimpleNamespace(sentence_evidence=namespace['sentence_evidence'])
 eligible=[]
 for cid in memory.lengths:
  c=memory.capsule(cid)
  if c['book_pdf_start_page']<1 or c['book_pdf_end_page']>60:continue
  lines=[s.strip() for s in c['verbatim_text'].splitlines() if len(s.split())>=6]
  if not lines:continue
  qualified=[s for s in lines if any(q in s.lower().split() for q in ('not','only','except','left','right','usually'))]
  quote=(qualified or lines)[-1]
  words=tokens(c['section_path'])[:6]+tokens(quote)[:4]
  if not words:continue
  eligible.append(dict(id='dev-source-'+cid,question='Describe '+' '.join(dict.fromkeys(words)),source_id=cid,quote=quote,page=c['book_pdf_start_page']))
 # Fixed deterministic breadth sample, without inspecting any answer model output.
 step=max(1,len(eligible)//120);cases=eligible[::step][:120]
 counters={str(w):collections.Counter() for w in (110,160,220)};rows=[];dur=[];failure_codes=collections.Counter();prompt=Brain.__new__(Brain);prompt.tokenizer_supported=False
 for case in cases:
  started=time.perf_counter();v=memory.search(case['question'],8);dur.append((time.perf_counter()-started)*1000)
  req=dict(schema=SCHEMA,request_id=case['id'],utterance_text=case['question'],conversation_topics=[],max_passages=8,latency_budget_ms=150,corpus_sha256=baseline.sha)
  b=baseline.search(req)['passages'];gold=norm(case['quote']);gold_unit=memory.capsule(case['source_id']);record=dict(case,baseline_raw_contains=any(gold in norm(c['verbatim_text']) for c in b),v11_raw_contains=any(gold in norm(c['verbatim_text']) for c in v['passages']),budgets={})
  for budget in (110,160,220):
   c=counters[str(budget)];c['n']+=1
   old=donor.sentence_evidence(case['question'],b,budget);old_hit=any(gold in norm(x['verbatim_text']) for x in old);c['v05_sentence_retained']+=old_hit
   c['v05_raw_contains']+=record['baseline_raw_contains'];c['v11_raw_contains']+=record['v11_raw_contains'];packed=[];code=None
   try:packed=pack_capsules(v['passages'],budget)['passages']
   except MemoryFailure as e:code=e.code;c['v11_explicit_budget_refusal']+=1;failure_codes[e.code]+=1
   new_hit=any(gold in norm(x['verbatim_text']) for x in packed);c['v11_retained']+=new_hit;c['paired_wins']+=new_hit and not old_hit;c['paired_losses']+=old_hit and not new_hit;c['paired_same']+=old_hit==new_hit
   oracle_hit=False
   try:oracle=pack_capsules([gold_unit]+v['passages'],budget,required_quote=case['quote']);oracle_hit=any(gold in norm(x['verbatim_text']) for x in oracle['passages'])
   except MemoryFailure:c['oracle_explicit_budget_refusal']+=1
   c['oracle_retained']+=oracle_hit
   final_hit=False;fallback_error=None
   if packed:
    try:
     messages,selected,pb=prompt.budget_messages(case['question'],[],packed,False,Flight());final_hit=any(gold in norm(x['verbatim_text']) for x in selected)
    except Exception as e:fallback_error=getattr(e,'code',type(e).__name__);c['fallback_prompt_refusal']+=1
   c['fallback_final_prompt_retained']+=final_hit
   record['budgets'][str(budget)]={'v05_sentence_retained':old_hit,'v11_retained':new_hit,'v11_error':code,'oracle_retained':oracle_hit,'fallback_final_prompt_retained':final_hit,'fallback_error':fallback_error}
  rows.append(record)
 #1000 actual index reads over DEV-derived source queries, not1000 medical questions.
 lat=[];stress_pass=0
 for i in range(1000):
  q=cases[i%len(cases)]['question'];t=time.perf_counter();result=memory.search(q,3);lat.append((time.perf_counter()-t)*1000);stress_pass+=bool(result['passages'])
 lat.sort();dur.sort()
 out={'scope':'DEV_SOURCE_DERIVED_LOCATION_AND_QUOTE_PROXY_NOT_MEDICAL_ACCURACY','dev_digital_pages':[1,60],'questions_contain_source_terms':True,'candidate_model_calls':0,'phone_tested':False,'real_tokenizer_used':False,'v07_v10_donors_recovered':False,'cases':len(cases),'eligible_source_capsules':len(eligible),'index_sha256':memory.manifest['index_sha256'],'baseline_corpus_sha256':baseline.sha,'donor_sentence_function_sha256':sha((a.claude_source/'retrieval/qwen_eval.py').read_bytes()),'retention':{k:dict(v) for k,v in counters.items()},'stress':{'queries':1000,'source_read_success':stress_pass,'p50_ms':statistics.median(lat),'p95_ms':lat[949],'max_ms':max(lat),'process_peak_rss_kb':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss},'rows':rows,'interpretation':'Exact whitespace-normalized quote retention only. Whole primary units never cropped; oversize primary units are explicit failures in the unchanged denominator. Oracle tests source availability/packing only, not medical comprehension. No held-out questions or examination key were read.'}
 a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(out,indent=2));print(json.dumps({k:v for k,v in out.items() if k!='rows'},indent=2))
if __name__=='__main__':main()
