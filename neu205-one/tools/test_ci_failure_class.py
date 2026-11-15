import unittest
from ci_failure_class import classify


class SafeCIClassification(unittest.TestCase):
    def test_no_arbitrary_payload_can_be_emitted(self):
        private = 'SENSITIVE_BUILD_CONTENT_12345 /private/a/secret'
        self.assertEqual(['unclassified_failure'], classify(private))
        self.assertNotIn(private, str(classify('Dependency verification failed ' + private)))
        self.assertEqual(['dependency_verification'], classify('Dependency verification failed ' + private))


if __name__ == '__main__':
    unittest.main()
