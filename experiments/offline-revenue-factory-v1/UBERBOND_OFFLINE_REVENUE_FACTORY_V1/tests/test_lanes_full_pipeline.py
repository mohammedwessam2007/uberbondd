"""Runs the real `urf.cli` entry point end-to-end for every lane x fixture
combination, each in an isolated --workspace temp dir, exactly as the
CLI would be invoked by an operator. Exercises the actual runtime entry
point (subprocess to `python3 -m urf.cli`), not an in-process shortcut.
"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import _pathsetup  # noqa: F401

from urf.lanes import LANES, get_lane_module

PRODUCT_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = PRODUCT_ROOT / "src"

# Lanes whose execute() always ends in an explicit "blocked conclusion"
# finding (submit/certify/no-bid-style decisions the system must never
# make on its own). hospital_mrf is a data-integrity lane, not a
# decision lane: it flags human_review_required on individual findings
# instead of emitting a single closing blocked-conclusion finding.
LANES_WITH_BLOCKED_CONCLUSION = ("msft_csp", "agency_rfp", "accessibility", "lead_path")


def _lane_fixture_pairs():
    pairs = []
    for lane in LANES:
        lane_mod = get_lane_module(lane)
        for fixture_id in lane_mod.FIXTURES:
            pairs.append((lane, fixture_id))
    return pairs


def _run_cli(args, workspace=None):
    cmd = [sys.executable, "-m", "urf.cli", *args]
    if workspace is not None:
        cmd += ["--workspace", str(workspace)]
    env = {"PYTHONPATH": str(SRC_DIR), "PATH": "/usr/bin:/bin"}
    result = subprocess.run(cmd, cwd=str(SRC_DIR), env=env, capture_output=True, text=True, timeout=60)
    return result


class TestLanesFullPipeline(unittest.TestCase):
    pass


def _make_test(lane, fixture_id):
    def test(self):
        with tempfile.TemporaryDirectory() as td:
            workspace = Path(td)
            run_id = f"test-{lane}-{fixture_id}"[:60]

            r = _run_cli(["init-run", "--lane", lane, "--fixture", fixture_id, "--run-id", run_id], workspace)
            self.assertEqual(r.returncode, 0, r.stderr)

            r = _run_cli(["validate-input", "--lane", lane, "--run-id", run_id], workspace)
            self.assertEqual(r.returncode, 0, r.stderr)

            r = _run_cli(["execute", "--lane", lane, "--run-id", run_id], workspace)
            self.assertEqual(r.returncode, 0, r.stderr)

            r = _run_cli(["qa", "--lane", lane, "--run-id", run_id], workspace)
            self.assertEqual(r.returncode, 0, f"qa failed: {r.stdout}\n{r.stderr}")

            r = _run_cli(["render", "--lane", lane, "--run-id", run_id, "--template", "internal_qa"], workspace)
            self.assertEqual(r.returncode, 0, r.stderr)

            r = _run_cli(["package", "--lane", lane, "--run-id", run_id], workspace)
            self.assertEqual(r.returncode, 0, r.stderr)

            zip_path = workspace / "reports" / "runs" / run_id / f"{run_id}.zip"
            self.assertTrue(zip_path.exists(), f"expected package zip at {zip_path}")

            r = _run_cli(["verify-package", "--package", str(zip_path)])
            self.assertEqual(r.returncode, 0, f"verify-package failed: {r.stdout}\n{r.stderr}")

            r = _run_cli(["cleanup", "--lane", lane, "--run-id", run_id], workspace)
            self.assertEqual(r.returncode, 0, r.stderr)

            findings_path = workspace / "evidence" / "runs" / run_id / "findings.json"
            findings = json.loads(findings_path.read_text(encoding="utf-8"))
            self.assertGreater(len(findings), 0, f"expected at least one finding for {lane}/{fixture_id}")

            human_reviews_path = workspace / "evidence" / "runs" / run_id / "human_review_requests.json"
            human_reviews = json.loads(human_reviews_path.read_text(encoding="utf-8")) if human_reviews_path.exists() else []

            if lane in LANES_WITH_BLOCKED_CONCLUSION:
                # Decision-adjacent lanes (submit/certify/no-bid style calls) must
                # never conclude on their own: always a blocked-conclusion finding
                # plus at least one human_review_request, on every fixture.
                self.assertTrue(
                    any(f.get("label") == "blocked conclusion" for f in findings),
                    f"expected at least one 'blocked conclusion' finding for {lane}/{fixture_id}",
                )
                self.assertGreater(
                    len(human_reviews), 0,
                    f"expected at least one human_review_request for {lane}/{fixture_id}",
                )
            else:
                # hospital_mrf is a data-integrity lane: human review is only
                # requested when a finding actually flags human_review_required
                # (e.g. stale/malformed/duplicate-key fixtures), not on clean data.
                # But every flagged finding must have a corresponding, trackable
                # human_review_request -- a flag with no request is a dead end.
                flagged = [f for f in findings if f.get("human_review_required")]
                if flagged:
                    self.assertGreater(
                        len(human_reviews), 0,
                        f"expected human_review_request(s) for {lane}/{fixture_id} given flagged findings",
                    )
                else:
                    self.assertEqual(
                        len(human_reviews), 0,
                        f"unexpected human_review_request(s) for {lane}/{fixture_id} with no flagged findings",
                    )

    return test


for _lane, _fixture_id in _lane_fixture_pairs():
    _name = f"test_full_pipeline_{_lane}_{_fixture_id}"
    setattr(TestLanesFullPipeline, _name, _make_test(_lane, _fixture_id))


if __name__ == "__main__":
    unittest.main()
