import unittest
from measure_session import summarize


class AcousticMeasurements(unittest.TestCase):
    def test_callbacks_are_not_acoustic_evidence(self):
        with self.assertRaises(ValueError):
            summarize([{'scope': 'tts-onStart', 'speech_end_ms': 0, 'first_correct_audible_word_ms': 1}])

    def test_nonfinite_and_negative_are_rejected(self):
        for end in [float('nan'), float('inf'), -1]:
            with self.assertRaises(ValueError):
                summarize([{'scope': 'physical-phone-acoustic', 'observation_reference': 'private-recording-1',
                            'speech_end_ms': 0, 'first_correct_audible_word_ms': end}])

    def test_slow_turn_fails_target_and_never_implies_release(self):
        rows = [{'scope': 'physical-phone-acoustic', 'observation_reference': 'private-recording-1',
                 'speech_end_ms': 100, 'first_correct_audible_word_ms': n + 100} for n in [1000, 2000, 6000]]
        r = summarize(rows)
        self.assertEqual(2000, r['p50_ms'])
        self.assertEqual(6000, r['p95_ms'])
        self.assertFalse(r['latency_target_pass'])
        self.assertFalse(r['release_qualified'])


if __name__ == '__main__':
    unittest.main()
