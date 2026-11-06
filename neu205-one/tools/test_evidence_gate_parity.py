"""Cross-language routing tests on synthetic source only; no medical accuracy claim."""
import hashlib,json,os,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from evidence_adapter import Evidence,evidence_status,SCHEMA

class GateParity(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory();cls.addClassCleanup(cls.tmp.cleanup);cls.path=Path(cls.tmp.name)
  java_home=Path(os.environ.get('JAVA_HOME','/workspace/neu205-tools/jdk/jdk-21.0.13+9'))
  cls.java_binary=str(java_home/'bin/java');javac=str(java_home/'bin/javac')
  sources=list((ROOT/'core/src/main/java').rglob('*.java'))+[ROOT/'core/src/test/java/ai/neu205/one/evidence/GateParityProbe.java']
  subprocess.run([javac,'--release','11','-d',str(cls.path/'classes'),*map(str,sources)],check=True,capture_output=True)
  rows=[]
  for page in range(1,300):
   text=('Left alpha supplies beta, not right gamma. The distance is 3 millimetres.' if page==1 else 'Neutral widget inventory.')
   rows.append(dict(chunk_id=f's{page}',book_pdf_start_page=page,book_pdf_end_page=page,section_path='Synthetic',verbatim_text=text,source_hash=hashlib.sha256(text.encode()).hexdigest()))
  cls.corpus=cls.path/'corpus.jsonl';cls.corpus.write_text(''.join(json.dumps(r)+'\n' for r in rows))
  cls.sha=hashlib.sha256(cls.corpus.read_bytes()).hexdigest();cls.manifest=cls.path/'manifest.json';cls.manifest.write_text(json.dumps(dict(pages=299,chunks=299,corpus_sha256=cls.sha)))
  cls.evidence=Evidence(cls.corpus,cls.manifest)
 def java(self,*args):
  return subprocess.check_output([self.__class__.java_binary,'-cp',str(self.path/'classes'),'ai.neu205.one.evidence.GateParityProbe',*map(str,args)],text=True,stderr=subprocess.PIPE).splitlines()
 def test_boundary_parity_and_historical_regressions(self):
  points=[.19,.20,.24,.25,.44,.45,.49,.50]
  native=self.java('--gate',*points);companion=[evidence_status(1,x) for x in points]
  self.assertEqual(native,companion)
  self.assertEqual(['NONE','NONE','NONE','WEAK','WEAK','WEAK','WEAK','OK'],native)
  # Candidate is no more permissive than either historical route for every grid point.
  order={'NONE':0,'WEAK':1,'OK':2}
  for i in range(1001):
   x=i/1000;old_native='NONE' if x<.20 else 'WEAK' if x<.50 else 'OK';old_companion='NONE' if x<.25 else 'WEAK' if x<.45 else 'OK'
   self.assertLessEqual(order[evidence_status(1,x)],min(order[old_native],order[old_companion]))
 def test_nonfinite_empty_and_invalid_coverage_fail_closed(self):
  self.assertEqual(['NONE']*4,self.java('--gate','NaN','Infinity','-1','2'))
  for x in [float('nan'),float('inf'),-1,2]:self.assertEqual('NONE',evidence_status(1,x))
  self.assertEqual('NONE',evidence_status(0,1))
 def test_same_source_query_coverage_hash_and_status(self):
  queries=['left alpha supplies beta','beta supplies left alpha','right alpha supplies beta','alpha does not supply beta','alpha supplies beta not gamma','distance 3 millimetres','unknown zeppelin satellite','it supplies beta']
  reqs=[dict(schema=SCHEMA,request_id=f't{i}',utterance_text=q,max_passages=5,latency_budget_ms=10000,conversation_topics=['left alpha'],corpus_sha256=self.sha) for i,q in enumerate(queries)]
  p=self.path/'requests.jsonl';p.write_text(''.join(json.dumps(r)+'\n' for r in reqs))
  native=[json.loads(s) for s in self.java(self.corpus,self.manifest,p)]
  for req,j in zip(reqs,native):
   py=self.evidence.search(req)
   self.assertEqual(py['evidence_status'],j['evidence_status']);self.assertEqual(py['corpus_sha256'],j['corpus_sha256'])
   self.assertEqual([v['chunk_id'] for v in py['passages']],[v['chunk_id'] for v in j['passages']])
   for a,b in zip(py['passages'],j['passages']):
    self.assertEqual(a['source_hash'],b['source_hash']);self.assertEqual(a['verbatim_text'],b['verbatim_text'])
    self.assertAlmostEqual(a['retrieval_scores']['coverage'],b['retrieval_scores']['coverage'],delta=.000051)
  # Lexical identity does NOT establish relation direction, negation, or laterality.
  self.assertEqual('OK',native[0]['evidence_status']);self.assertEqual('OK',native[1]['evidence_status'])
 def test_changed_source_fails_closed(self):
  original=self.corpus.read_bytes()
  try:
   self.corpus.write_bytes(original.replace(b'Left alpha',b'Right alpha',1))
   with self.assertRaises(ValueError):Evidence(self.corpus,self.manifest)
   p=self.path/'empty.jsonl';p.write_text('')
   with self.assertRaises(subprocess.CalledProcessError):self.java(self.corpus,self.manifest,p)
  finally:
   self.corpus.write_bytes(original)
   self.__class__.evidence=Evidence(self.corpus,self.manifest)

if __name__=='__main__':unittest.main()
