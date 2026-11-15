import json
from pathlib import Path
import tempfile
import unittest
from run_frozen_predictions import questions


class FrozenInputs(unittest.TestCase):
    def test_sealed_answers_refused_before_solver(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'questions.jsonl'
            p.write_text(json.dumps({'id': 'q1', 'question': 'Question?', 'gold': 'key'}) + '\n')
            with self.assertRaises(ValueError): questions(p)

    def test_empty_or_duplicate_run_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'questions.jsonl'; p.write_text('')
            with self.assertRaises(ValueError): questions(p)
            p.write_text((json.dumps({'id': 'q1', 'question': 'Question?'}) + '\n') * 2)
            with self.assertRaises(ValueError): questions(p)


    def test_question_only_schema_rejects_disguised_keys_and_metadata(self):
        # The evaluator requires exactly these two fields, not just a denylist.
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'questions.jsonl'
            for extra in ('answer_key', 'explanation', 'source_pages', 'unsupported'):
                p.write_text(json.dumps({'id': 'q1', 'question': 'Question?', extra: 'private'}) + '\n')
                with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, 'Question-only'):
                    questions(p)
            p.write_text(json.dumps({'id': 'q1', 'question': 'Question?'}) + '\n')
            self.assertEqual(['q1'], [r['id'] for r in questions(p)])

    def test_malformed_question_rows_fail_cleanly(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'questions.jsonl'
            for row in ([], None, {'id': '', 'question': 'Question?'}):
                p.write_text(json.dumps(row) + '\n')
                with self.subTest(row=row), self.assertRaises(ValueError):
                    questions(p)


if __name__ == '__main__':
    unittest.main()
