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


if __name__ == '__main__':
    unittest.main()
