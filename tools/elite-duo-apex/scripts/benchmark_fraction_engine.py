#!/usr/bin/env python3
from __future__ import annotations
import argparse,json
from pathlib import Path
ap=argparse.ArgumentParser(); ap.add_argument('baseline'); ap.add_argument('candidate'); ap.add_argument('--output',default='FRACTION_ENGINE_BENCHMARK.json'); a=ap.parse_args(); b=json.loads(Path(a.baseline).read_text()); c=json.loads(Path(a.candidate).read_text())
required=['acceptance_score','review_defects','input_tokens','output_tokens','duration_seconds']
for name,x in [('baseline',b),('candidate',c)]:
 for k in required:
  if k not in x: raise SystemExit(f'{name} missing {k}')
quality_ok=c['acceptance_score']>=b['acceptance_score'] and c['review_defects']<=b['review_defects']
base_tokens=b['input_tokens']+b['output_tokens']; cand_tokens=c['input_tokens']+c['output_tokens']
result={'quality_preserved':quality_ok,'token_reduction_fraction':(base_tokens-cand_tokens)/max(1,base_tokens),'duration_reduction_fraction':(b['duration_seconds']-c['duration_seconds'])/max(1,b['duration_seconds']),'baseline':b,'candidate':c,'verdict':'PROMOTE' if quality_ok and cand_tokens<base_tokens else 'DO_NOT_PROMOTE'}
Path(a.output).write_text(json.dumps(result,indent=2)+'\n'); print(json.dumps(result,indent=2))
