import unittest

import _pathsetup  # noqa: F401

from urf.claim_safety import rules


class TestClaimSafety(unittest.TestCase):
    def test_guaranteed_recovery_blocked(self):
        v = rules.scan_text("We guarantee you will recover the full credit.")
        self.assertTrue(any(x.category == rules.CATEGORY_GUARANTEED_RECOVERY for x in v))

    def test_compliance_claim_blocked(self):
        v = rules.scan_text("This site is fully compliant with WCAG.")
        self.assertTrue(any(x.category == rules.CATEGORY_COMPLIANCE_CLAIM for x in v))

    def test_wcag_certification_claim_blocked(self):
        v = rules.scan_text("This page is WCAG 2.1 AA certified.")
        self.assertTrue(any(x.category == rules.CATEGORY_ACCESSIBILITY_CERT for x in v))

    def test_ms_eligibility_claim_blocked(self):
        v = rules.scan_text("Customer is eligible for a Microsoft SLA credit.")
        self.assertTrue(any(x.category == rules.CATEGORY_MSFT_ELIGIBILITY for x in v))

    def test_conversion_uplift_claim_blocked(self):
        v = rules.scan_text("This fix will increase conversions by 20%.")
        self.assertTrue(any(x.category == rules.CATEGORY_CONVERSION_UPLIFT for x in v))

    def test_clean_disclaimer_text_has_no_violations_besides_expected(self):
        text = "This output is not a claim and is not an eligibility decision."
        v = rules.scan_text(text)
        self.assertEqual(v, [])

    def test_unsupported_number_flagged(self):
        text = "The overlap window lasted 4500 seconds and cost $500 total."
        v = rules.scan_text(text)
        self.assertTrue(any(x.category == rules.CATEGORY_UNSUPPORTED_NUMBER for x in v))

    def test_number_with_evidence_marker_not_flagged_as_unsupported(self):
        text = "The overlap window lasted 4500 seconds [ev-run-1-0001]."
        v = rules.scan_text(text)
        self.assertFalse(any(x.category == rules.CATEGORY_UNSUPPORTED_NUMBER for x in v))

    def test_synthetic_disclosure_required_when_using_synthetic_data(self):
        v = rules.check_synthetic_disclosure("This report summarizes findings from the evidence pack.", True)
        self.assertEqual(len(v), 1)
        self.assertEqual(v[0].category, rules.CATEGORY_SYNTHETIC_DISCLOSURE_MISSING)

    def test_synthetic_disclosure_satisfied(self):
        v = rules.check_synthetic_disclosure("This report is built entirely from synthetic fixtures.", True)
        self.assertEqual(v, [])

    def test_is_safe_true_for_clean_text(self):
        self.assertTrue(rules.is_safe("This is a synthetic evidence summary.", uses_synthetic_data=True))

    def test_is_safe_false_for_prohibited_text(self):
        self.assertFalse(rules.is_safe("This is ADA compliant."))


if __name__ == "__main__":
    unittest.main()
