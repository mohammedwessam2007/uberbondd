import unittest

import _pathsetup  # noqa: F401

from urf.economics import pricing
from urf.economics.recorder import record_run_economics


class TestRecorder(unittest.TestCase):
    def test_duration_computed_from_real_timestamps(self):
        manifest = {
            "run_id": "run-1",
            "lane": "msft_csp",
            "fixture_id": "complete",
            "started_at": "2026-08-03T10:00:00Z",
            "finished_at": "2026-08-03T10:00:05Z",
            "finding_count": 3,
            "unknown_count": 0,
            "human_review_count": 1,
            "warning_count": 0,
        }
        econ = record_run_economics(manifest)
        self.assertEqual(econ["wall_clock_duration_seconds"], 5.0)
        self.assertEqual(econ["wall_clock_duration_label"], "observed fact")

    def test_duration_unknown_when_finished_at_missing(self):
        manifest = {
            "run_id": "run-1", "lane": "msft_csp", "fixture_id": "complete",
            "started_at": "2026-08-03T10:00:00Z", "finished_at": None,
            "finding_count": 0, "unknown_count": 0, "human_review_count": 0, "warning_count": 0,
        }
        econ = record_run_economics(manifest)
        self.assertIsNone(econ["wall_clock_duration_seconds"])
        self.assertEqual(econ["wall_clock_duration_label"], "unknown")

    def test_counts_pass_through_from_manifest(self):
        manifest = {
            "run_id": "run-1", "lane": "msft_csp", "fixture_id": "complete",
            "started_at": None, "finished_at": None,
            "finding_count": 4, "unknown_count": 2, "human_review_count": 1, "warning_count": 3,
        }
        econ = record_run_economics(manifest)
        self.assertEqual(econ["finding_count"], 4)
        self.assertEqual(econ["unknown_count"], 2)
        self.assertEqual(econ["human_review_count"], 1)
        self.assertEqual(econ["warning_count"], 3)
        self.assertEqual(econ["counts_label"], "observed fact")

    def test_package_size_unknown_when_no_path_given(self):
        manifest = {
            "run_id": "run-1", "lane": "msft_csp", "fixture_id": "complete",
            "started_at": None, "finished_at": None,
            "finding_count": 0, "unknown_count": 0, "human_review_count": 0, "warning_count": 0,
        }
        econ = record_run_economics(manifest)
        self.assertIsNone(econ["final_package_byte_size"])
        self.assertEqual(econ["package_size_label"], "unknown")

    def test_minutes_default_to_unknown(self):
        manifest = {
            "run_id": "run-1", "lane": "msft_csp", "fixture_id": "complete",
            "started_at": None, "finished_at": None,
            "finding_count": 0, "unknown_count": 0, "human_review_count": 0, "warning_count": 0,
        }
        econ = record_run_economics(manifest)
        self.assertIsNone(econ["owner_minutes"])
        self.assertIsNone(econ["ai_minutes"])
        self.assertEqual(econ["minutes_label"], "unknown")

    def test_minutes_labeled_observed_when_operator_supplied(self):
        manifest = {
            "run_id": "run-1", "lane": "msft_csp", "fixture_id": "complete",
            "started_at": None, "finished_at": None,
            "finding_count": 0, "unknown_count": 0, "human_review_count": 0, "warning_count": 0,
        }
        econ = record_run_economics(manifest, owner_minutes=12.5)
        self.assertEqual(econ["owner_minutes"], 12.5)
        self.assertEqual(econ["minutes_label"], "observed fact")


class TestPricing(unittest.TestCase):
    def test_build_scenario_arithmetic(self):
        scenario = pricing.build_scenario(1, 250.0)
        # (30/60 * 75 + 0.10) * 1.15 = 43.24
        self.assertAlmostEqual(scenario["modeled_cost_per_delivery_usd"], 43.24, places=2)
        self.assertAlmostEqual(scenario["modeled_revenue_per_month_usd"], 250.0, places=2)
        self.assertAlmostEqual(scenario["modeled_margin_per_month_usd"], 206.76, places=2)

    def test_build_scenario_scales_with_volume(self):
        s10 = pricing.build_scenario(10, 250.0)
        self.assertAlmostEqual(s10["modeled_revenue_per_month_usd"], 2500.0, places=2)
        self.assertAlmostEqual(s10["modeled_margin_per_month_usd"], 2067.6, places=1)

    def test_every_dollar_field_is_labeled_assumption_or_modeled(self):
        scenario = pricing.build_scenario(1, 250.0)
        self.assertEqual(scenario["price_label"], "assumption")
        self.assertEqual(scenario["assumptions_label"], "assumption")
        self.assertEqual(scenario["modeled_cost_label"], "modeled")
        self.assertEqual(scenario["modeled_revenue_label"], "modeled")
        self.assertEqual(scenario["modeled_margin_label"], "modeled")

    def test_build_all_scenarios_covers_all_volume_tiers(self):
        scenarios = pricing.build_all_scenarios(250.0)
        volumes = [s["volume_per_month"] for s in scenarios]
        self.assertEqual(volumes, pricing.DELIVERY_VOLUME_SCENARIOS_PER_MONTH)

    def test_custom_assumptions_override_defaults(self):
        scenario = pricing.build_scenario(1, 250.0, assumptions={"assumed_hourly_review_rate_usd": 100.0})
        self.assertEqual(scenario["assumptions"]["assumed_hourly_review_rate_usd"], 100.0)
        self.assertEqual(scenario["assumptions"]["assumed_compute_cost_usd_per_delivery"], 0.10)


if __name__ == "__main__":
    unittest.main()
