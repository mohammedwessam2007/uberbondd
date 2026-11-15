"""Synthetic integrity/arithmetic tests; never medical answer evaluation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

spec=importlib.util.spec_from_file_location('sealed_source_eval',Path(__file__).with_name('sealed_source_eval.py'))
evaluation=importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


class IntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)

    def write(self,name,rows):
        p=self.root/name
        p.write_text(''.join(json.dumps(r)+'\n' for r in rows))
        return p

    def fixture(self,confidence=.9):
        gold=self.write('gold.jsonl',[
            {'id':'opaque-a','supported':True},
            {'id':'opaque-b','supported':False}])
        questions=self.write('questions.jsonl',[
            {'id':'opaque-a','question':'Synthetic integrity item A'},
            {'id':'opaque-b','question':'Synthetic integrity item B'}])
        prereg=self.root/'prereg.md'
        prereg.write_text('Synthetic script fixture, not medical evidence.\n')
        manifest=self.root/'manifest.json'
        manifest.write_text(json.dumps({
            'total':2,
            'gold_sha256':evaluation.digest(gold),
            'questions_sha256':evaluation.digest(questions),
            'preregistration_sha256':evaluation.digest(prereg)}))
        predictions=self.write('predictions.jsonl',[
            {'id':'opaque-a','answer':'Synthetic A','status':'completed','confidence':confidence},
            {'id':'opaque-b','answer':'Unavailable','status':'completed','confidence':confidence}])
        grades=self.write('grades.jsonl',[
            dict(id=i,label=label,reviewer_id='synthetic-test-fixture',
                 reviewer_qualifications='Not a medical review; test fixture only',
                 review_method='independent_source_review',rationale='Script fixture.',
                 prediction_file_sha256=evaluation.digest(predictions))
            for i,label in [('opaque-a','correct'),('opaque-b','refusal')]])
        args=SimpleNamespace(gold=gold,questions=questions,preregistration=prereg,
            manifest=manifest,predictions=predictions,grades=grades,
            predictions_manifest=self.root/'predictions-manifest.json')
        self.seal(args)
        return args

    def seal(self,args):
        args.predictions_manifest.unlink(missing_ok=True)
        evaluation.seal_predictions(SimpleNamespace(predictions=args.predictions,
            questions=args.questions,key_manifest=args.manifest,manifest=args.predictions_manifest))

    def edit_grades(self,args,edit):
        rows=evaluation.read_jsonl(args.grades)
        edit(rows)
        self.write('grades.jsonl',rows)

    def test_duplicate_ids_rejected(self):
        p=self.write('duplicates.jsonl',[{'id':'a'},{'id':'a'}])
        with self.assertRaisesRegex(ValueError,'Duplicate'):
            evaluation.read_jsonl(p)

    def test_empty_rate_is_unavailable(self):
        self.assertIsNone(evaluation.rate(0,0)['value'])
        self.assertIsNone(evaluation.wilson(0,0))

    def test_zero_errors_has_nonzero_upper_interval(self):
        lo,hi=evaluation.wilson(0,64)
        self.assertGreaterEqual(lo,0)
        self.assertGreater(hi,0)

    def test_perfect_fixture_does_not_pass_release_gate(self):
        report=evaluation.grade(self.fixture())
        self.assertEqual(report['supported_correctness']['denominator'],1)
        self.assertFalse(report['full_release_gate_passed'])
        self.assertFalse(report['thresholds']['target_sample_size_met'])

    def test_missing_confidence_cannot_pass_gate(self):
        report=evaluation.grade(self.fixture(None))
        self.assertEqual(report['missing_pregrading_confidence'],2)
        self.assertEqual(report['thresholds']['confident_wrong_at_most_2'],'unavailable')

    def test_partial_is_not_correct_and_is_confident_wrong(self):
        args=self.fixture()
        self.edit_grades(args,lambda rows:rows[0].update(label='partial'))
        report=evaluation.grade(args)
        self.assertEqual(report['supported_correctness']['numerator'],0)
        self.assertEqual(report['supported_confident_wrong']['numerator'],1)

    def test_failed_prediction_stays_in_denominator(self):
        args=self.fixture()
        predictions=evaluation.read_jsonl(args.predictions)
        predictions[0].update(status='failed',answer='',confidence=None)
        self.write('predictions.jsonl',predictions)
        self.seal(args)
        prediction_hash=evaluation.digest(args.predictions)
        def update(rows):
            rows[0]['label']='error'
            for row in rows:row['prediction_file_sha256']=prediction_hash
        self.edit_grades(args,update)
        report=evaluation.grade(args)
        self.assertEqual(report['supported_correctness']['denominator'],1)
        self.assertEqual(report['supported_correctness']['numerator'],0)
        self.assertEqual(report['labels']['error'],1)

    def test_missing_prediction_cannot_be_sealed(self):
        args=self.fixture()
        self.write('predictions.jsonl',[evaluation.read_jsonl(args.predictions)[1]])
        with self.assertRaisesRegex(ValueError,'coverage mismatch'):
            self.seal(args)

    def test_exactly_one_run_header_allowed(self):
        args=self.fixture()
        rows=evaluation.read_jsonl(args.predictions)
        header={'run':{'fixture':True},'config_sha256':'0'*64}
        self.write('predictions.jsonl',[header]+rows)
        parsed_header,parsed_rows=evaluation.read_predictions(args.predictions)
        self.assertEqual(parsed_header,header)
        self.assertEqual(len(parsed_rows),2)
        self.write('predictions.jsonl',[header,header]+rows)
        with self.assertRaisesRegex(ValueError,'Unknown/repeated'):
            evaluation.read_predictions(args.predictions)

    def test_unknown_metadata_line_rejected(self):
        p=self.write('unknown.jsonl',[{'something':'unexpected'}])
        with self.assertRaisesRegex(ValueError,'Invalid prediction header'):
            evaluation.read_predictions(p)

    def test_prediction_edit_after_freeze_rejected(self):
        args=self.fixture()
        args.predictions.write_text(args.predictions.read_text()+'\n')
        with self.assertRaisesRegex(ValueError,'changed after prediction freeze'):
            evaluation.grade(args)

    def test_unsupported_correct_label_rejected(self):
        args=self.fixture()
        self.edit_grades(args,lambda rows:rows[1].update(label='correct'))
        with self.assertRaisesRegex(ValueError,'Unsupported success'):
            evaluation.grade(args)

    def test_changed_key_rejected(self):
        args=self.fixture()
        args.gold.write_text(args.gold.read_text()+'\n')
        with self.assertRaisesRegex(ValueError,'Frozen gold changed'):
            evaluation.grade(args)

    def test_grade_prediction_hash_mismatch_rejected(self):
        args=self.fixture()
        self.edit_grades(args,lambda rows:rows[0].update(prediction_file_sha256='0'*64))
        with self.assertRaisesRegex(ValueError,'different prediction file'):
            evaluation.grade(args)

    def test_nonfinite_confidence_rejected(self):
        args=self.fixture(float('nan'))
        with self.assertRaisesRegex(ValueError,'Invalid pre-grading confidence'):
            evaluation.grade(args)

    def test_missing_grade_rejected(self):
        args=self.fixture()
        self.write('grades.jsonl',evaluation.read_jsonl(args.grades)[:1])
        with self.assertRaisesRegex(ValueError,'Every frozen item'):
            evaluation.grade(args)


if __name__=='__main__':
    unittest.main()
