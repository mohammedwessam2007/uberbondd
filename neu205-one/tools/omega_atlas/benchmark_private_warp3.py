#!/usr/bin/env python3
"""Private historical DEV benchmark: aggregates only, no questions or quotes persisted."""
import sys,zipfile,json,re,statistics,time,hashlib,math,argparse
from pathlib import Path
from warp2_offline_page_index import extract_verified_pages, hash_bytes
from warp3_evidence_packets import WARP3
argp=argparse.ArgumentParser(description=__doc__)
argp.add_argument('--private-zip', type=Path, required=True)
argp.add_argument('--output', type=Path, required=True)
options=argp.parse_args()
SRC=options.private_zip
def norm(s):return re.sub(r'\W+',' ',s.casefold()).strip()
def percentile(a,p):return sorted(a)[math.ceil(p*len(a))-1]
with zipfile.ZipFile(SRC) as z:
 pdf=z.read('private/NEU205 Neuroscience Text Only.pdf')
 cases=[x for fn in ('probes_p001_100.json','probes_p101_200.json','probes_p201_299.json') for x in json.loads(z.read('private/v05/probes/'+fn)) if x.get('split')=='dev' and x.get('kind')=='supported' and x.get('pages') and x.get('source_quote')]
pages=extract_verified_pages(pdf);sha=hash_bytes(pdf)
assert len(cases)==150
result=[]
for (win,stride,budget) in ((100,30,500),(120,40,600),(160,48,650),(160,48,900),(220,70,1100)):
 t0=time.perf_counter();idx=WARP3(pages,sha,window_words=win,stride_words=stride);built=time.perf_counter()-t0
 hits={1:0,3:0,5:0,8:0}; pagehits=0;mean_words=[];elapsed=[];nr=[]
 for q in cases:
  start=time.perf_counter();pkt=idx.pack(q['question'],max_windows=8,word_budget=budget,metadata_only=True)
  elapsed.append((time.perf_counter()-start)*1000)
  ev=pkt['evidence'];ordered=[idx.windows[i] for i in pkt['window_ids']];needle=norm(q['source_quote'])
  quote_matches=[needle in norm(pages[w.page-1][w.char_start:w.char_end]) for w in ordered]
  for k in hits:hits[k]+=int(any(quote_matches[:k]))
  pagehits+=int(any(w.page in q['pages'] for w in ordered[:5]))
  mean_words.append(pkt['packed_words']);nr.append(pkt['window_candidates_considered'])
 result.append(dict(window_words=win,stride_words=stride,word_budget=budget,top_k=8,exact_quote_recall_at_k=hits,
                    page_recall_at_5=pagehits,mean_packed_words=round(statistics.mean(mean_words),2),
                    source_windows=len(idx.windows),candidates_mean=round(statistics.mean(nr),2),
                    build_seconds=round(built,2),host_query_ms_p50=round(statistics.median(elapsed),3),host_query_ms_p95=round(percentile(elapsed,.95),3)))
 print(json.dumps(result[-1],sort_keys=True),flush=True)
out={'evaluation_class':'HISTORICAL_EXPOSED_DEV_ONLY_NOT_MEDICAL_ANSWERS','source_pdf_sha256':sha,
     'number_of_questions':len(cases),'method':'WARP3 lexical two-tier sparse page-to-window fusion, source hashes, capped word budget',
     'independent_clinician_scoring':False,'new_437_run_not_accessed':True,'phone_test':False,
     'source_or_question_content_exported':False,'results':result}
options.output.write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
