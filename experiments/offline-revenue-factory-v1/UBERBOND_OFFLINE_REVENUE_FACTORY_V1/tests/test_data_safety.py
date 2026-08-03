import unittest

import _pathsetup  # noqa: F401

from urf.data_safety import classify


class TestDataSafety(unittest.TestCase):
    def test_aws_key_detected(self):
        result = classify.scan_for_credentials("key=AKIAABCDEFGHIJKLMNOP")
        self.assertFalse(result.is_clean)
        self.assertTrue(any(c == "aws_access_key" for c, _ in result.hits))

    def test_private_key_block_detected(self):
        result = classify.scan_for_credentials("-----BEGIN RSA PRIVATE KEY-----\nMIIExample\n-----END RSA PRIVATE KEY-----")
        self.assertFalse(result.is_clean)

    def test_password_assignment_detected(self):
        result = classify.scan_for_credentials("password: SuperSecret123")
        self.assertFalse(result.is_clean)

    def test_ssn_detected_as_phi(self):
        result = classify.scan_for_phi("patient ssn 123-45-6789 on file")
        self.assertFalse(result.is_clean)

    def test_medical_record_number_detected_as_phi(self):
        result = classify.scan_for_phi("Medical Record Number: MRN-000123")
        self.assertFalse(result.is_clean)

    def test_clean_text_has_no_hits(self):
        result = classify.scan_for_prohibited("This is a synthetic fixture describing a hospital MRF file.")
        self.assertTrue(result.is_clean)

    def test_classify_and_maybe_quarantine_forces_prohibited(self):
        effective, result = classify.classify_and_maybe_quarantine(
            "api_key: abcd1234efgh5678ijkl", "SYNTHETIC"
        )
        self.assertEqual(effective, "PROHIBITED")
        self.assertFalse(result.is_clean)

    def test_classify_and_maybe_quarantine_passes_through_clean_text(self):
        effective, result = classify.classify_and_maybe_quarantine(
            "hospital_name: Example General Hospital", "SYNTHETIC"
        )
        self.assertEqual(effective, "SYNTHETIC")
        self.assertTrue(result.is_clean)

    def test_unknown_classification_rejected(self):
        with self.assertRaises(ValueError):
            classify.classify_and_maybe_quarantine("clean text", "NOT_A_REAL_CLASS")


if __name__ == "__main__":
    unittest.main()
