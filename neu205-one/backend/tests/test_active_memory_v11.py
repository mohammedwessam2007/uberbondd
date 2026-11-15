"""Synthetic source-integrity/retention tests, not medical accuracy or donor-suite results."""
import hashlib,json,sys,tempfile,threading,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from active_memory_v11 import *
from memory_tools_v11 import request_tools

class MemoryTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
  self.rows=[{'pdf_page_1based':1,'text':'AMBER NUCLEUS\nContents:\n- Left branch only, not the right.\n- Calcium entry is not exit; 2.5 mV.\nExceptions remain here.\n'}, {'pdf_page_1based':2,'text':'AZURE PATHWAY\nA long paragraph contains a synthetic source observation. '+('Context remains unchanged. '*24)+'\nFinal exception: never transpose medial and lateral.\n'}, {'pdf_page_1based':3,'text':'OTHER TOPIC\nFictional violet axons are near amber structures.\nNearness does not establish supply or causation.\n'}]
  self.pages=self.root/'pages.jsonl';self.pages.write_text(''.join(json.dumps(r)+'\n' for r in self.rows));self.path=self.root/'memory.sqlite'
  self.man=compile_memory(self.pages,self.path,'a'*64,'b'*64,expected_pages=3)
  self.memory=ActiveMemory(self.path,str(self.path)+'.manifest.json','a'*64,'b'*64)
 def tearDown(self):self.tmp.cleanup()
 def session(self):return MemorySession(self.memory,'gen-1',threading.Event())
 def test_source_units_preserve_lists_qualifiers_and_bytes(self):
  result=self.memory.search('amber nucleus contents');self.assertTrue(result['passages'])
  combined=''.join(p['verbatim_text'] for p in result['passages']);self.assertIn('Left branch only, not the right.',combined);self.assertIn('Calcium entry is not exit; 2.5 mV.',combined)
  for p in result['passages']:
   self.assertEqual(sha(p['verbatim_text'].encode()),p['source_hash']);self.assertFalse(p['semantic_relations_verified'])
   for r in p['source_spans']:
    raw=self.rows[r['page']-1]['text'].encode()[r['byte_start']:r['byte_end']];self.assertEqual(sha(raw),r['source_hash'])
 def test_every_original_nonwhite_character_covered(self):self.assertEqual(0,self.man['source_nonwhite_characters_omitted'])
 def test_no_overwriting_existing_version(self):
  before=file_sha(self.path)
  with self.assertRaises(MemoryFailure):compile_memory(self.pages,self.path,'a'*64,'b'*64,expected_pages=3)
  self.assertEqual(before,file_sha(self.path))
 def test_partial_source_rejected(self):
  p=self.root/'incomplete';p.write_text(json.dumps(self.rows[0])+'\n')
  with self.assertRaises(MemoryFailure):compile_memory(p,self.root/'other','a'*64,'b'*64,expected_pages=3)
 def test_mcq_stem_not_distractor_bag(self):
  q='Which is a content of the amber nucleus?\nA) Violet unrelated pathway\nB) Other distraction\nC) Different structure\nD) None'
  stem,options=stem_question(q);self.assertNotIn('Violet',stem);self.assertEqual(4,len(options))
  out=self.memory.search(q);self.assertEqual(4,out['option_count']);self.assertEqual(1,out['passages'][0]['book_pdf_start_page'])
 def test_cancelled_search_and_tools_fail_closed(self):
  event=threading.Event();event.set()
  with self.assertRaises(MemoryFailure) as f:self.memory.search('amber nucleus',cancel=event)
  self.assertEqual('CANCELLED',f.exception.code)
 def test_unapproved_ids_paths_pages_refused(self):
  s=self.session()
  for name,args in [('memory.lookup',{'chunk_id':'../../etc/passwd'}),('source.page_in',{'page':1}),('memory.prove',{'claim':'Invented claim','source_ids':['m-unapproved']})]:
   with self.assertRaises(MemoryFailure):s.call(dict(tool=name,arguments=args,generation_id='gen-1'))
 def test_typed_schema_and_generation_checked(self):
  s=self.session()
  for req in [dict(tool='shell.exec',arguments={},generation_id='gen-1'),dict(tool='topic.search',arguments={'query':'amber','path':'/etc/passwd'},generation_id='gen-1'),dict(tool='topic.search',arguments={'query':'amber'},generation_id='old')]:
   with self.assertRaises(MemoryFailure):s.call(req)
 def test_lookup_expand_and_pagein_are_source_only(self):
  s=self.session();out=s.call(dict(tool='topic.search',arguments={'query':'amber contents','limit':1},generation_id='gen-1'));p=out['result']['passages'][0];cid=p['chunk_id']
  out=s.call(dict(tool='memory.expand',arguments={'chunk_id':cid,'hops':1},generation_id='gen-1'));self.assertFalse(out['result']['medical_transitivity_used']);self.assertTrue(out['result']['source_neighbor_expansion_only'])
  out=s.call(dict(tool='source.page_in',arguments={'page':p['book_pdf_start_page']},generation_id='gen-1'));self.assertEqual(self.rows[p['book_pdf_start_page']-1]['text'],out['result']['verbatim_text'])
 def test_lexical_proof_never_certifies_medicine(self):
  s=self.session();p=self.memory.search('amber nucleus contents',1)['passages'][0];s.approve([p])
  out=s.call(dict(tool='memory.prove',arguments={'claim':'Left branch only, not the right.','source_ids':[p['chunk_id']]},generation_id='gen-1'))['result'];self.assertTrue(out['exact_quote_present']);self.assertEqual('NOT_VERIFIED',out['clinical_semantic_entailment'])
 def test_tool_call_cap(self):
  s=self.session()
  for _ in range(4):s.call(dict(tool='topic.search',arguments={'query':'amber','limit':1},generation_id='gen-1'))
  with self.assertRaises(MemoryFailure) as f:s.call(dict(tool='topic.search',arguments={'query':'amber'},generation_id='gen-1'))
  self.assertEqual('TOOL_BUDGET',f.exception.code)
 def test_capsules_not_cropped_to_word_budget(self):
  p=self.memory.search('azure pathway',1)['passages'][0]
  if len(p['verbatim_text'].split())>110:
   with self.assertRaises(MemoryFailure) as f:pack_capsules([p],110)
   self.assertEqual('EVIDENCE_UNIT_EXCEEDS_BUDGET',f.exception.code)
  else:
   out=pack_capsules([p],110);self.assertFalse(out['source_text_rewritten']);self.assertEqual(out['passages'][0]['verbatim_text'],p['verbatim_text'])
 def test_oracle_quote_retained_or_explicit_failure(self):
  passages=self.memory.search('amber nucleus contents',3)['passages'];quote='Left branch only, not the right.'
  out=pack_capsules(passages,110,quote);self.assertTrue(any(quote in p['verbatim_text'] for p in out['passages']))
  with self.assertRaises(MemoryFailure) as f:pack_capsules(passages,110,'missing gold reference')
  self.assertEqual('ORACLE_QUOTE_NOT_RETAINED',f.exception.code)
 def test_corrupt_or_changed_index_fails_closed(self):
  with self.path.open('ab') as f:f.write(b'corrupt')
  with self.assertRaises(MemoryFailure):self.memory.search('amber')
  with self.assertRaises(MemoryFailure):ActiveMemory(self.path,str(self.path)+'.manifest.json','a'*64,'b'*64)
 def test_stable_prefix_debounce_and_revision_invalidation(self):
  p=StablePrefixPrefetch(self.memory);ev=threading.Event()
  self.assertIsNone(p.update('g1','amber',1,True,ev,now=0)['result'])
  self.assertIsNone(p.update('g1','amber nucleus',2,True,ev,now=.10)['result'])
  out=p.update('g1','amber nucleus',3,True,ev,now=.20);self.assertIsNotNone(out['result']);self.assertFalse(out['inference_started'])
  changed=p.update('g1','azure pathway',4,True,ev,now=.3);self.assertTrue(changed['invalidated_previous']);self.assertIsNone(changed['result'])
  ev.set()
  with self.assertRaises(MemoryFailure):p.update('g1','azure pathway',5,True,ev,now=.5)
 def test_followup_uses_last_meaningful_topic_without_contaminating_new_topic(self):
  out=self.memory.search('what are its contents',topics=['amber nucleus','shorter']);self.assertTrue(out['topic_expansion_used']);self.assertEqual(1,out['passages'][0]['book_pdf_start_page'])
  out=self.memory.search('azure pathway',topics=['amber nucleus']);self.assertFalse(out['topic_expansion_used']);self.assertEqual(2,out['passages'][0]['book_pdf_start_page'])
 def test_main_unit_cannot_be_replaced_with_smaller_distractor(self):
  big={'chunk_id':'big','verbatim_text':'qualifier '*200,'source_hash':'a'};small={'chunk_id':'small','verbatim_text':'unrelated shorter fragment','source_hash':'b'}
  with self.assertRaises(MemoryFailure) as f:pack_capsules([big,small],110)
  self.assertEqual('EVIDENCE_UNIT_EXCEEDS_BUDGET',f.exception.code)
 def test_planner_budget_checked_before_each_qwen_call(self):
  s=self.session();calls=[]
  def never(path,body):calls.append(body);raise AssertionError('Must not invoke Qwen after budget refusal')
  def guard(messages):raise MemoryFailure('CONTEXT_BUDGET','synthetic refusal')
  with self.assertRaises(MemoryFailure):request_tools(never,'qwen-SYNTHETIC',[],s,s.cancel,budget_guard=guard)
  self.assertFalse(calls)
 def test_tool_planner_executes_only_approved_typed_calls(self):
  s=self.session();calls=[]
  def fake(path,body):
   calls.append(body)
   if len(calls)==1:return {'choices':[{'message':{'tool_calls':[{'id':'call-1','type':'function','function':{'name':'topic.search','arguments':json.dumps({'query':'amber','limit':1})}}]}}],'usage':{'prompt_tokens':123}}
   return {'choices':[{'message':{'content':'Planner text is not an answer to speak.'}}]}
  out=request_tools(fake,'qwen-SYNTHETIC',[],s,s.cancel);self.assertEqual(2,out['qwen_planning_calls']);self.assertEqual(1,len(out['tool_receipts']));self.assertTrue(out['passages']);self.assertNotIn('answer',out)
 def test_tool_planner_cannot_execute_shell_or_foreign_generation(self):
  s=self.session()
  def fake(path,body):return {'choices':[{'message':{'tool_calls':[{'id':'x','type':'function','function':{'name':'shell.exec','arguments':'{"cmd":"cat /etc/passwd"}'}}]}}]}
  with self.assertRaises(MemoryFailure):request_tools(fake,'qwen-SYNTHETIC',[],s,s.cancel)
 def test_thousand_query_stress_source_checks(self):
  for n in range(1000):
   result=self.memory.search('amber nucleus' if n%2 else 'azure pathway',1);self.assertTrue(result['passages'])

if __name__=='__main__':unittest.main()
