import copy
import math
import unittest
from triage_results import assess

BASE={'source_commit':'4e8e3444d695f8281a5662e68f1b70e4b1403921', 'scope':'host_native_text', 'evaluation_class':'sealed_holdout', 'review_class':'ai_source_review', 'supported':{'correct':275,'partial':28,'incorrect':22,'refusal':11,'assertive_wrong':22}, 'unsupported':{'refused':101,'answered':0}, 'host_text_p50_ms':31940, 'host_first_clause_p50_ms':29550}

class GateTests(unittest.TestCase):
    def test_exact_v12_arithmetic(self):
        r=assess(BASE)
        self.assertEqual(r['supported_total'],336)
        self.assertEqual(r['unsupported_total'],101)
        self.assertEqual(r['correct_needed_for_90pct'],28)
        self.assertEqual(r['wrong_reduction_needed_for_2pct'],16)
        self.assertEqual(r['host_first_clause_speedup_vs_2500ms'],11.82)
        self.assertEqual(r['unsupported_refusal_rate'],1)
        self.assertFalse(r['score_targets_met'])
        self.assertFalse(r['release_qualified'])
        self.assertFalse(r['medical_review_gate_met'])
    def test_improved_hypothetical_still_not_released(self):
        x=copy.deepcopy(BASE);x['supported'].update(correct=303,partial=12,incorrect=6,refusal=15,assertive_wrong=6)
        r=assess(x)
        self.assertTrue(r['score_targets_met'])
        self.assertFalse(r['medical_review_gate_met'])
        self.assertFalse(r['release_qualified'])
    def test_refusing_unsafe_cases_does_not_fake_accuracy(self):
        x=copy.deepcopy(BASE);x['supported'].update(incorrect=6,refusal=27,assertive_wrong=6)
        r=assess(x)
        self.assertEqual(r['correct_needed_for_90pct'],28)
        self.assertFalse(r['score_targets_met'])
    def test_nonfinite_rejected(self):
        x=copy.deepcopy(BASE);x['host_text_p50_ms']=math.nan
        with self.assertRaises(ValueError):assess(x)
    def test_raw_data_or_missing_denominators_rejected(self):
        x=copy.deepcopy(BASE);x['supported']['incorrect']=-1
        with self.assertRaises(ValueError):assess(x)
    def test_inconsistent_confident_wrong_rejected(self):
        x=copy.deepcopy(BASE);x['supported']['assertive_wrong']=23
        with self.assertRaises(ValueError):assess(x)
    def test_bad_sha_rejected(self):
        x=copy.deepcopy(BASE);x['source_commit']='fake'
        with self.assertRaises(ValueError):assess(x)
    def test_wrong_measurement_order_rejected(self):
        x=copy.deepcopy(BASE);x['host_first_clause_p50_ms']=32000
        with self.assertRaises(ValueError):assess(x)
    def test_unreviewed_provenance_rejected(self):
        x=copy.deepcopy(BASE);x['review_class']='probably expert'
        with self.assertRaises(ValueError):assess(x)
    def test_explicit_clinician_gate_not_phone_gate(self):
        x=copy.deepcopy(BASE);x['review_class']='clinician_review'
        r=assess(x)
        self.assertTrue(r['medical_review_gate_met'])
        self.assertFalse(r['release_qualified'])

if __name__=='__main__':unittest.main()