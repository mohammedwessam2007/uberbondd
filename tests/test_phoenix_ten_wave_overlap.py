"""Offline constrained first-pass PHOENIX-to-UberBond legacy title overlap tests."""
import importlib.util
import pathlib
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('phoenix_overlap',ROOT/'scripts/phoenix-ten-wave-overlap.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class OverlapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.report=module.probe()
    def test_complete_recovered_set(self):
        self.assertEqual(self.report['proposals'],1560)
        self.assertGreater(self.report['legacy_static_name_pairs'],0)
    def test_never_claims_semantic_dedupe(self):
        self.assertIn('NOT_SEMANTIC_DEDUP',self.report['limitation'])
        self.assertEqual(self.report['authority'],'NONE')
        self.assertTrue(all(x['status']=='RESEARCH_ONLY_REQUIRES_SEMANTIC_REVIEW' for x in self.report['matches']))
    def test_partial_legacy_is_not_declared_novelty_proof(self):
        self.assertEqual(module.similarity('model-free scheduling','model free scheduling'),1)
        self.assertEqual(module.similarity('model-free scheduling','payments ledger'),0)
if __name__=='__main__':unittest.main()
