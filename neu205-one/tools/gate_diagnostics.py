#!/usr/bin/env python3
"""Ungraded fixed diagnostic queries: source/routing parity, never medical accuracy.
No evaluation questions, keys, or source excerpts are read from an evaluation set.
"""
import argparse,hashlib,json,os,subprocess,sys,tempfile
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from evidence_adapter import Evidence,SCHEMA,evidence_status
QUERIES=['left optic nerve','right optic nerve','optic nerve does not supply retina',
 'retina supplies optic nerve','cerebellum function','cerebellum left right exception',
 'What is the resting membrane potential?', 'How many millimetres?',
 'unknown zeppelin telemetry','unknown zeppelin nerve protocol',
 'it supplies the left nerve','What does it contain?']
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--corpus',type=Path,required=True);p.add_argument('--manifest',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 e=Evidence(a.corpus,a.manifest)
 requests=[dict(schema=SCHEMA,request_id=f'd{i}',utterance_text=q,max_passages=5,latency_budget_ms=10000,conversation_topics=[],corpus_sha256=e.sha) for i,q in enumerate(QUERIES)]
 java=str(Path(os.environ.get('JAVA_HOME','/workspace/neu205-tools/jdk/jdk-21.0.13+9'))/'bin/java')
 with tempfile.TemporaryDirectory() as tmp:
  req=Path(tmp)/'requests.jsonl';req.write_text(''.join(json.dumps(r)+'\n' for r in requests))
  raw=subprocess.check_output([java,'-cp',str(ROOT/'build/core')+os.pathsep+str(ROOT/'build/test'),'ai.neu205.one.evidence.GateParityProbe',str(a.corpus),str(a.manifest),str(req)],text=True)
  native=[json.loads(s) for s in raw.splitlines()]
 transitions=Counter();mismatch=0;coverage_mismatch=0;source_mismatch=0;status_counts=Counter()
 for r,j in zip(requests,native):
  py=e.search(r);status_counts[py['evidence_status']]+=1
  mismatch+=py['evidence_status']!=j['evidence_status']
  source_mismatch+=py['corpus_sha256']!=j['corpus_sha256'] or [(v['chunk_id'],v['source_hash']) for v in py['passages']]!=[(v['chunk_id'],v['source_hash']) for v in j['passages']]
  for x,y in zip(py['passages'],j['passages']):coverage_mismatch+=abs(x['retrieval_scores']['coverage']-y['retrieval_scores']['coverage'])>.000051
  hits=e.index.search(r['utterance_text'],5);best=max((e.index.coverage(r['utterance_text'],i) for i,_ in hits),default=0)
  oldn='NONE' if not hits or best<.20 else 'WEAK' if best<.50 else 'OK';oldp='NONE' if not hits or best<.25 else 'WEAK' if best<.45 else 'OK'
  transitions[f'native:{oldn}->{py["evidence_status"]}']+=1;transitions[f'companion:{oldp}->{py["evidence_status"]}']+=1
 report=dict(scope='UNLABELED_DIAGNOSTICS_NOT_SUPPORTED_OR_UNSUPPORTED_DENOMINATOR',queries=len(requests),corpus_sha256=e.sha,status_mismatches=mismatch,source_or_rank_mismatches=source_mismatch,coverage_mismatches=coverage_mismatch,status_counts=dict(status_counts),transitions=dict(transitions),semantic_entailment_verified=False,medical_correctness_measured=False)
 fd=os.open(a.out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:json.dump(report,f,indent=2);f.write('\n')
 print(json.dumps(report,sort_keys=True))
 if mismatch or source_mismatch or coverage_mismatch:raise SystemExit(1)
if __name__=='__main__':main()
