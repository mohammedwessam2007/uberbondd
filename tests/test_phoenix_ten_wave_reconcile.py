"""No-network tests for scripts/phoenix-ten-wave-reconcile.py."""
import csv
import hashlib
import importlib.util
import os
import pathlib
import tempfile
import unittest

MODULE=pathlib.Path(__file__).resolve().parents[1]/'scripts'/'phoenix-ten-wave-reconcile.py'
spec=importlib.util.spec_from_file_location('phoenix_reconcile',MODULE)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name)
        self.repos=self.root/'repos.csv'
        self.caps=self.root/'caps.csv'
        self.old_hash=mod.EXPECTED_URL_SHA
        self.addCleanup(lambda: setattr(mod,'EXPECTED_URL_SHA',self.old_hash))
        self.urls=[f'https://github.com/fixture/r{i:03d}' for i in range(243)]
        mod.EXPECTED_URL_SHA=hashlib.sha256(('\n'.join(self.urls)+'\n').encode()).hexdigest()
        self.repo_rows=[{'canonical_url':u,'classification':'REVIEW_REQUIRED','raw_row_count':'1'} for u in self.urls]
        self.cap_rows=[{'id':f'phoenix-test-{i:04d}','name':f'Ability {i}', 'wave':'10',
                        'family':'Test class','donor_urls':self.urls[0] if i%3==0 else 'https://arxiv.org/abs/test' if i%3==1 else '',
                        'status_as_recorded':'RESEARCH_DESIGN_CANDIDATE'} for i in range(1304)]
        self.save()
    def save(self):
        for path,rows in [(self.repos,self.repo_rows),(self.caps,self.cap_rows)]:
            with path.open('w',newline='') as f:
                out=csv.DictWriter(f,fieldnames=rows[0].keys());out.writeheader();out.writerows(rows)
    def test_all_research_never_promotes(self):
        r=mod.reconcile(self.repos,self.caps)
        self.assertEqual(r['summary']['canonical_repository_urls'],243)
        self.assertEqual(r['summary']['capability_proposals'],1304)
        self.assertEqual(r['summary']['external_or_document_reference_urls'],1)
        self.assertTrue(all(x['promotion_state']=='RESEARCH_ONLY_NOT_ADMITTED' and not x['runtime_verified'] for x in r['ranked_supplier_research_only']))
    def test_mutated_manifest_rejected(self):
        self.repo_rows[0]['canonical_url']='https://github.com/fixture/changed';self.save()
        with self.assertRaises(AssertionError):mod.reconcile(self.repos,self.caps)
    def test_missing_capability_rejected(self):
        self.cap_rows.pop();self.save()
        with self.assertRaises(AssertionError):mod.reconcile(self.repos,self.caps)
    def test_duplicate_ids_rejected(self):
        self.cap_rows[-1]['id']=self.cap_rows[0]['id'];self.save()
        with self.assertRaises(AssertionError):mod.reconcile(self.repos,self.caps)
    def test_invalid_classification_rejected(self):
        self.repo_rows[0]['classification']='APPROVED';self.save()
        with self.assertRaises(AssertionError):mod.reconcile(self.repos,self.caps)

@unittest.skipUnless(os.environ.get('PHOENIX_KIT_DIR'),'Optional full research catalog not mounted')
class RealSourceTests(unittest.TestCase):
    def test_recoverable_1304_records(self):
        p=pathlib.Path(os.environ['PHOENIX_KIT_DIR'])
        result=mod.reconcile(p/'repositories.normalized.csv',p/'CAPABILITY_PROPOSALS_1304.csv',p/'ORIGINAL_REPOSITORIES_269_RAW.csv')
        self.assertEqual(result['summary']['original_repository_rows'],269)
        self.assertEqual(result['summary']['families'],106)
        self.assertEqual(result['summary']['missing_wave4_expected'],256)
        self.assertEqual(result['summary']['github_repository_donor_links_not_in_manifest'],0)
        self.assertEqual(result['summary']['proposals_without_donor_links'],200)

if __name__=='__main__':unittest.main()
