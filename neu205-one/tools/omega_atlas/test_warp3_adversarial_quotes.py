"""Synthetic hostile cases for WARP3's *literal* quote boundary.

These tests do not measure medical accuracy or establish semantic entailment.
All examples are invented and contain no textbook or examination content.
"""
from dataclasses import replace
import hashlib
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

    def test_utf8_offsets_address_extracted_page_bytes_not_pdf(self):
        source = 'α 🧠 e\u0301 ' + ('ordinary text ' * 100) + 'café β🧠 marker. ' + ('tail words ' * 60)
        index = WARP3([source], PDF_SHA, expected_pages=1, window_words=80, stride_words=24)
        page_bytes = source.encode('utf-8')
        for i, window in enumerate(index.windows):
            result = index.warrant(i, metadata_only=False)
            self.assertEqual('EXTRACTED_PAGE_TEXT_UTF8_NOT_PDF_BINARY', result['byte_offset_basis'])
            snippet_bytes = page_bytes[result['page_utf8_byte_start']:result['page_utf8_byte_end']]
            self.assertEqual(result['exact_text'].encode('utf-8'), snippet_bytes)
            self.assertEqual(hashlib.sha256(snippet_bytes).hexdigest(), result['source_excerpt_sha256'])
            self.assertEqual(source[window.char_start:window.char_end], result['exact_text'])
        quote = 'café β🧠 marker.'
        i = next(i for i, w in enumerate(index.windows) if quote in source[w.char_start:w.char_end])
        result = index.exact_quote_gate(quote, i)
        self.assertEqual(quote, source[result['absolute_char_start']:result['absolute_char_end']])
        actual = page_bytes[result['page_utf8_byte_start']:result['page_utf8_byte_end']]
        self.assertEqual(quote.encode('utf-8'), actual)
        self.assertEqual(hashlib.sha256(actual).hexdigest(), result['quote_sha256'])
        self.assertNotEqual(result['absolute_char_start'], result['page_utf8_byte_start'])
        self.assertFalse(result['semantic_entailment_verified'])

    def test_corrupted_byte_offsets_fail_closed(self):
        source = 'α 🧠 café marker. ' * 12
        index = WARP3([source], PDF_SHA, expected_pages=1, window_words=75, stride_words=22)
        original = index.windows[0]
        index.windows[0] = replace(original, page_utf8_byte_start=original.page_utf8_byte_start + 1)
        with self.assertRaisesRegex(ValueError, 'byte offsets mismatch'):
            index.warrant(0)
        with self.assertRaisesRegex(ValueError, 'byte offsets mismatch'):
            index.exact_quote_gate('café marker', 0)

    def test_repeated_identical_text_cannot_swap_byte_locations(self):
        source = 'α β γ δ ε ' * 200
        index = WARP3([source], PDF_SHA, expected_pages=1, window_words=60, stride_words=12)
        original = index.windows[0]
        page_bytes = source.encode('utf-8')
        excerpt = page_bytes[original.page_utf8_byte_start:original.page_utf8_byte_end]
        second = page_bytes.find(excerpt, original.page_utf8_byte_start + 1)
        self.assertGreater(second, original.page_utf8_byte_start)
        index.windows[0] = replace(original, page_utf8_byte_start=second,
                                   page_utf8_byte_end=second + len(excerpt))
        # A matching hash and identical bytes at another location do not bind
        # a citation to the original character coordinates.
        with self.assertRaisesRegex(ValueError, 'byte offsets mismatch'):
            index.warrant(0)

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
