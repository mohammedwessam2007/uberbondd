import hashlib, importlib.util, unittest
from pathlib import Path
fn=Path(__file__).with_name('warp2_offline_page_index.py')
spec=importlib.util.spec_from_file_location('warp2_offline_page_index',fn)
import sys
module=importlib.util.module_from_spec(spec);sys.modules[spec.name]=module;spec.loader.exec_module(module)
WARP2=module.WARP2; PDF_SHA=module.PDF_SHA
class WARP2Checks(unittest.TestCase):
    def setUp(self):
        self.pages=['The lateral artery lies beside the nerve. This source mentions right only.',
                    'The medial nerve is located on the left side. A distinct source.',
                    'The oval foramen allows passage of a nerve. It is not a blood vessel.',
                    'The vestibular apparatus sends impulses to autonomic centers.']
        self.x=WARP2(self.pages,PDF_SHA,expected_pages=4)
    def test_both_sparse_indices(self):
        self.assertEqual(4,self.x.character_index.page_count)
        self.assertEqual(4,self.x.phrase_index.page_count)
    def test_candidate_ranges_preserve_exact_sparse_scores(self):
        for index in (self.x.character_index,self.x.phrase_index):
            for query in ('left artery nerve', 'vestibular apparatus', 'unknown'):
                full=index.scores(query)
                subset=index.scores_in_ranges(query,[(0,1),(2,4)])
                self.assertEqual({i:v for i,v in full.items() if i in (0,2,3)},dict(subset))
                self.assertEqual({},dict(index.scores_in_ranges(query,[])))
            for ranges in ([(0,2),(1,3)], [(-1,1)], [(0,5)], [(1,1)]):
                with self.assertRaises(ValueError):index.scores_in_ranges('nerve',ranges)
    def test_search_top(self):
        self.assertEqual(4,self.x.candidate_pages('vestibular apparatus',2)['pages'][0]['page'])
    def test_no_entailment_claim(self):
        r=self.x.candidate_pages('the artery supplies the nerve',2)
        self.assertFalse(r['model_answer_verified'])
        self.assertTrue(all(not item['relation_semantically_verified'] for item in r['pages']))
    def test_bounded_union(self):
        self.assertLessEqual(self.x.candidate_pages('artery nerve',2)['candidate_page_count'],4)
    def test_empty_query(self):
        for q in ['',' ','a'*1001]:
            with self.assertRaises(ValueError):self.x.candidate_pages(q)
    def test_page_sha(self):
        self.assertEqual(hashlib.sha256(self.pages[0].encode()).hexdigest(),self.x._page_sha[0])
    def test_quote_source_hash(self):
        text=self.pages[1]
        cert=self.x.exact_span(2,0,10)
        self.assertEqual(hashlib.sha256(text[:10].encode()).hexdigest(),cert.quote_sha256)
        self.assertTrue(cert.exact_source_bytes_verified)
        self.assertFalse(cert.semantic_relation_verified)
    def test_invalid_source(self):
        with self.assertRaises(ValueError):WARP2(self.pages,'0'*64,expected_pages=4)
        with self.assertRaises(ValueError):WARP2(self.pages[:-1],PDF_SHA,expected_pages=4)
    def test_immutable_source(self):
        self.pages[0]='malicious source injection'
        self.assertTrue(self.x.check(1))
        self.assertNotIn('malicious',self.x.limited_excerpt('lateral artery',1)['text'])
    def test_cancellation(self):
        self.assertEqual('CANCELLED',self.x.candidate_pages('vestibular apparatus',cancel=lambda:True)['status'])
        self.assertEqual('CANCELLED',self.x.limited_excerpt('vestibular apparatus',4,cancel=lambda:True)['status'])
    def test_limited_excerpt(self):
        r=self.x.limited_excerpt('oval foramen',3)
        self.assertEqual('EXACT_SOURCE_ONLY_NO_ENTAILMENT',r['status'])
        self.assertIn('oval foramen',r['text'])
        self.assertFalse(r['medical_correctness_verified'])
    def test_bounded_input(self):
        with self.assertRaises(ValueError):self.x.candidate_pages('foo',per_route=1000)
        with self.assertRaises(ValueError):self.x.limited_excerpt('foo',1,max_words=800)
    def test_invalid_span(self):
        with self.assertRaises(ValueError):self.x.exact_span(4,3,900)
if __name__=='__main__':unittest.main()
