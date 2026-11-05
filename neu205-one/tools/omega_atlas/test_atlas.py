import copy
import hashlib
import json
import unittest
try:
    from .atlas import Atlas, checked_rows, terms, windows, evaluate_dev
except ImportError:
    from atlas import Atlas, checked_rows, terms, windows, evaluate_dev

def row(cid,text,sec='Synthetic section',page=1):
    return {'chunk_id':cid,'verbatim_text':text,'section_path':sec,'source_hash':hashlib.sha256(text.encode()).hexdigest(),'book_pdf_start_page':page,'book_pdf_end_page':page}

def raw(rows):return ('\n'.join(json.dumps(x) for x in rows)+'\n').encode()

class IntegrityAndIndexTests(unittest.TestCase):
    def setUp(self):
        self.rows=[row('one','Anatomy Example: The synthetic branch supplies test structure alpha. However, it does not supply structure beta.',page=1),row('two','Anatomy Example: The synthetic vessel supplies test structure beta.',page=2),row('three','The numerical concentration is 3.5 units. The negative condition is absent.',page=3)]
        self.atlas=Atlas(self.rows)
    def test_hash_of_source_rows(self):
        r=raw(self.rows);self.assertEqual(checked_rows(r,hashlib.sha256(r).hexdigest()),self.rows)
    def test_manifest_hash_different(self):
        with self.assertRaisesRegex(ValueError,'corpus hash mismatch'):checked_rows(raw(self.rows),'0'*64)
    def test_member_changed(self):
        changed=copy.deepcopy(self.rows);changed[0]['verbatim_text']+='!'
        with self.assertRaisesRegex(ValueError,'source hash mismatch'):checked_rows(raw(changed))
    def test_duplicate_ids(self):
        dupe=self.rows+[copy.deepcopy(self.rows[0])]
        with self.assertRaisesRegex(ValueError,'duplicate'):checked_rows(raw(dupe))
    def test_malformed_fields(self):
        broken=copy.deepcopy(self.rows);del broken[0]['section_path']
        with self.assertRaisesRegex(ValueError,'schema mismatch'):checked_rows(raw(broken))
    def test_page_bounds(self):
        broken=copy.deepcopy(self.rows);broken[0]['book_pdf_end_page']=300
        with self.assertRaisesRegex(ValueError,'page span'):checked_rows(raw(broken))
    def test_complete_book_requirement(self):
        with self.assertRaisesRegex(ValueError,'source coverage incomplete'):checked_rows(raw(self.rows),require_pages=True)
    def test_rank_is_deterministic(self):
        query='Which synthetic branch supplies structure alpha?'
        self.assertEqual(self.atlas.rerank(query,3),self.atlas.rerank(query,3))
    def test_no_generated_claims(self):
        q='Which test structure is NOT supplied?';out=self.atlas.excerpt(q,0)
        self.assertEqual(out['text'],self.rows[0]['verbatim_text'][out['char_start']:out['char_end']])
        self.assertTrue(out['not_semantic_entailment'])
        self.assertEqual(out['source_hash'],self.rows[0]['source_hash'])
        self.assertIn('not supply structure beta',out['text'])
    def test_paragraph_or_sentence_only(self):
        q='which vessel supplies beta';out=self.atlas.excerpt(q,1)
        self.assertIn('supplies test structure beta',out['text'])
        self.assertEqual(out['book_pdf_start_page'],2)
    def test_exact_span_hash(self):
        out=self.atlas.excerpt('numerical concentration',2)
        self.assertEqual(hashlib.sha256(out['text'].encode()).hexdigest(),out['excerpt_sha256'])
    def test_decimal_not_split(self):
        w=windows('The concentration is 3.5 units. Next sentence follows.')
        self.assertEqual(len(w),2)
        self.assertEqual(w[0][2],'The concentration is 3.5 units.')
    def test_no_cross_source_excerpts(self):
        for i in range(len(self.rows)):
            out=self.atlas.excerpt('test',i)
            self.assertIn(out['text'],self.rows[i]['verbatim_text'])
    def test_oversize_is_explicit(self):
        big=Atlas([row('large','Synthetic sentence '+('longword '*120)+' is complete.')]);o=big.excerpt('longword',0,20)
        self.assertEqual(o['status'],'EVIDENCE_UNIT_EXCEEDS_BUDGET')
        self.assertIsNone(o['text'])
    def test_out_of_bounds_budget(self):
        with self.assertRaisesRegex(ValueError,'bad word budget'):self.atlas.excerpt('structure',0,19)
    def test_existing_normalizer_lemma(self):
        self.assertEqual(terms('Innervation of nerves'),['innervate','nerv'])
    def test_zero_hits(self):
        self.assertEqual(self.atlas.rerank('hyperunicornterm',5),[])
    def test_no_quote_substitution(self):
        q='supply alpha';out=self.atlas.excerpt(q,0)
        self.assertIn(out['text'],self.rows[0]['verbatim_text'])
        self.assertNotIn('LLM',out['text'])

if __name__=='__main__':unittest.main()