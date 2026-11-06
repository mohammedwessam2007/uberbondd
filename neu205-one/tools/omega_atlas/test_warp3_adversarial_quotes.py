"""Synthetic hostile cases for WARP3's *literal* quote boundary.

These tests do not measure medical accuracy or establish semantic entailment.
All examples are invented and contain no textbook or examination content.
"""
import unittest

from warp2_offline_page_index import PDF_SHA
from warp3_evidence_packets import WARP3


class AdversarialQuoteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (
            'Aster sends signals to Birch. Birch does not send signals to Aster. '
            'The left lamp is anterior to the right lamp. '
            'The blue valve opens only after the red switch closes. '
            'The dose is 4 mg, not 40 mg. '
            'No sensor connects to the green wheel. '
            'The output is higher before cooling and lower after cooling. '
            'A café marker identifies the source. '
        ) * 8
        cls.index = WARP3([cls.source], PDF_SHA, expected_pages=1,
                          window_words=160, stride_words=48)

    def test_altered_direction_and_qualifiers_are_rejected(self):
        mutations = [
            'Birch sends signals to Aster.',
            'The right lamp is anterior to the left lamp.',
            'The blue valve opens only before the red switch closes.',
            'The dose is 40 mg, not 4 mg.',
            'A sensor connects to the green wheel.',
            'The output is lower before cooling and higher after cooling.',
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                self.assertEqual('REJECT', self.index.exact_quote_gate(mutation, 0)['decision'])

    def test_context_stripped_literal_quote_is_not_a_proof(self):
        # A true substring can invert the surrounding sentence's meaning.
        result = self.index.exact_quote_gate('sensor connects to the green wheel', 0)
        self.assertEqual('SOURCE_SUBSTRING_ONLY', result['decision'])
        self.assertFalse(result['semantic_entailment_verified'])
        self.assertFalse(result['medical_accuracy_verified'])

    def test_literal_direction_is_still_not_a_proof(self):
        result = self.index.exact_quote_gate('Aster sends signals to Birch.', 0)
        self.assertEqual('SOURCE_SUBSTRING_ONLY', result['decision'])
        self.assertFalse(result['semantic_entailment_verified'])
        self.assertFalse(result['medical_accuracy_verified'])

    def test_unicode_offsets_select_original_characters(self):
        result = self.index.exact_quote_gate('café marker', 0)
        self.assertEqual('café marker', self.source[result['absolute_char_start']:result['absolute_char_end']])

    def test_candidate_packet_never_certifies_qualifier_or_entailment(self):
        for query in ('Does Aster send signals to Birch?',
                      'Is the right lamp anterior to the left lamp?',
                      'Does the valve open before the switch closes?',
                      'Is the dose 40 mg?',
                      'Does a sensor connect to the green wheel?'):
            with self.subTest(query=query):
                result = self.index.pack(query)
                self.assertTrue(result['independent_relation_check_required'])
                self.assertTrue(result['not_enough_evidence_to_certify_an_answer'])
                self.assertFalse(result['claim_entailment_verified'])
                self.assertTrue(all(not item['relation_verified'] for item in result['evidence']))


if __name__ == '__main__':
    unittest.main()
