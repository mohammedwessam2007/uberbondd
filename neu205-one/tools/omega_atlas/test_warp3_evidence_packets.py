import hashlib,unittest
from warp3_evidence_packets import WARP3
from warp2_offline_page_index import PDF_SHA,hash_bytes

class WARP3Tests(unittest.TestCase):
 def setUp(self):
  self.pages=[
    ('The left beacon is anterior to the right beacon. The sensor does not connect to the red arch. '*22),
    ('The right beacon is posterior to the left beacon. Except when its cable is disconnected, the bridge remains active. '*22),
    ('Anatomy review: a neural structure branches near a different structure. The reader must verify the exact page. '*22),
  ]
  self.x=WARP3(self.pages,PDF_SHA,expected_pages=3,window_words=75,stride_words=22)
 def test_index_all_pages(self):self.assertEqual(len(self.x.by_page),3)
 def test_stable_query(self):self.assertEqual(self.x.pack('beacon anterior left'),self.x.pack('beacon anterior left'))
 def test_bounded_packed_words(self):
  t=self.x.pack('left beacon right',word_budget=140,max_windows=5)
  self.assertLessEqual(t['packed_words'],140)
  self.assertLessEqual(len(t['evidence']),5)
 def test_defaults_not_relationally_verified(self):
  x=self.x.pack('does left beacon connect to bridge')
  self.assertFalse(x['claim_entailment_verified'])
  self.assertTrue(all(not e['relation_verified'] for e in x['evidence']))
 def test_exact_hash_warrants(self):
  r=self.x.pack('left beacon',metadata_only=False)
  for e in r['evidence']:
   self.assertEqual(hash_bytes(e['exact_text'].encode()),e['source_excerpt_sha256'])
   p=self.pages[e['source_page']-1]
   self.assertEqual(p[e['char_start']:e['char_end']],e['exact_text'])
 def test_metadata_only_does_not_leak_original(self):
  x=self.x.pack('left beacon')
  self.assertNotIn('The left beacon',repr(x))
 def test_changed_page_digest_fails(self):
  w=self.x.windows[0]
  self.x.pages=(self.pages[0]+'X',)+tuple(self.pages[1:])
  with self.assertRaisesRegex(ValueError,'hash'):self.x.warrant(0)
 def test_wrong_side_refused(self):
  j=next(i for i,w in enumerate(self.x.windows) if w.page==1)
  self.assertEqual(self.x.exact_quote_gate('The right beacon is anterior to the left beacon.',j)['decision'],'REJECT')
 def test_exact_quote_not_truth(self):
  j=next(i for i,w in enumerate(self.x.windows) if w.page==1)
  r=self.x.exact_quote_gate('The left beacon is anterior to the right beacon.',j)
  self.assertEqual(r['decision'],'SOURCE_SUBSTRING_ONLY')
  self.assertFalse(r['medical_accuracy_verified'])
 def test_cancel_before_search(self):
  self.assertEqual(self.x.pack('beacon',cancel=lambda:True)['status'],'CANCELLED')
 def test_cancel_after_lookup(self):
  times=[0]
  def c():
   times[0]+=1;return times[0]>1
  self.assertEqual(self.x.pack('beacon',cancel=c)['status'],'CANCELLED')
 def test_invalid_arguments_rejected(self):
  for a in [dict(question=''),dict(question='x'*1001),dict(question='beacon',max_windows=0),dict(question='beacon',word_budget=99),dict(question='beacon',per_page_cap=0),dict(question='beacon',per_route=90)]:
   with self.assertRaises(ValueError):self.x.pack(**a)
 def test_index_config_limits(self):
  with self.assertRaises(ValueError):WARP3(self.pages,PDF_SHA,expected_pages=3,window_words=70,stride_words=60)
 def test_literal_span_matches_source_offsets(self):
  j=next(i for i,w in enumerate(self.x.windows) if w.page==1)
  r=self.x.exact_quote_gate('The left beacon is anterior to the right beacon.',j)
  self.assertEqual(self.pages[0][r['absolute_char_start']:r['absolute_char_end']],'The left beacon is anterior to the right beacon.')
 def test_laterality_question_requires_relation_check(self):
  r=self.x.pack('Does the left beacon supply the right beacon?')
  self.assertTrue(r['qualifier_sensitive_question'])
  self.assertTrue(r['independent_relation_check_required'])
 def test_non_laterality_question_is_still_unproven(self):
  r=self.x.pack('Tell me the beacon anatomy')
  self.assertFalse(r['qualifier_sensitive_question'])
  self.assertTrue(r['not_enough_evidence_to_certify_an_answer'])
 def test_no_unsupported_magic_confidence(self):
  r=self.x.pack('unknown unlisted biomedical relation')
  self.assertFalse(r['unsupported_question_refusal_calibrated'])
if __name__=='__main__':unittest.main()
