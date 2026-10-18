"""Read-only receipt verification for all 243 public GitHub HEAD references."""
import hashlib
import json
import pathlib
import re
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
DIR=ROOT/'artifacts/research/phoenix-ten-wave-intake'
class HeadReceiptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result=json.loads((DIR/'public-head-243-20261018.json').read_text())
        cls.manifest=(DIR/'repositories.urls.txt').read_bytes()
    def test_complete_unique_source_coverage(self):
        m=self.manifest.decode().splitlines()
        self.assertEqual(len(m),243);self.assertEqual(len(set(m)),243)
        self.assertEqual(self.result['checked'],243)
        self.assertEqual([r['url'] for r in self.result['rows']],m)
        self.assertEqual(hashlib.sha256(self.manifest).hexdigest(),self.result['source_manifest_sha256'])
    def test_only_public_ref_observation(self):
        self.assertTrue(self.result['no_source_executed'])
        self.assertEqual(self.result['supplier_promotion'],'NONE')
        self.assertEqual(self.result['license_status'],'NOT_VERIFIED')
        self.assertEqual(self.result['public_head_observed'],243)
        self.assertTrue(all(r['status']=='PUBLIC_HEAD_OBSERVED' for r in self.result['rows']))
    def test_all_source_shas_syntactically_valid(self):
        self.assertTrue(all(re.fullmatch('[a-f0-9]{40}',r['head_sha'] or '') for r in self.result['rows']))
        self.assertTrue(all(r['index']==i for i,r in enumerate(self.result['rows'])))
if __name__=='__main__':unittest.main()
