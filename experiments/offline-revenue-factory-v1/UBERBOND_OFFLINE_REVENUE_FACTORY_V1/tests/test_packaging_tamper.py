import tempfile
import unittest
from pathlib import Path

import _pathsetup  # noqa: F401

from urf.common.models import QAResult
from urf.common.paths import Workspace
from urf.common.runstore import RunContext, now_iso
from urf.packaging.package import build_package_dir, verify_package_dir, zip_package_dir


def _build_minimal_run(base: Path) -> RunContext:
    ws = Workspace(base=base)
    run_ctx = RunContext(run_id="test-run-0001", lane="msft_csp", fixture_id="complete", workspace=ws)
    run_ctx.init_manifest(input_hashes={"fixture.json": "deadbeef"})
    run_ctx.add_evidence(
        source_type="synthetic_fixture",
        source_path="fixture.json",
        source_hash=None,
        data_classification="SYNTHETIC",
        observed_value={"example": "value"},
        parser="test_packaging_tamper.synthetic",
        parser_version="1.0.0",
        deterministic_transform=None,
        confidence="high",
        limitation="Synthetic evidence for the packaging self-test only.",
        prohibited_interpretation="Do not treat as a real evidence item.",
        human_review_required=False,
    )
    run_ctx.add_finding(
        label="observed fact",
        statement="A synthetic finding for the packaging self-test.",
        evidence_refs=[],
        confidence="high",
        human_review_required=False,
    )
    run_ctx.mark_stage("execute")
    qa = QAResult(
        qa_id="qa-test-run-0001",
        run_id=run_ctx.run_id,
        lane=run_ctx.lane,
        checks=[{"check_id": "qa-example", "description": "example check", "status": "pass", "detail": "n/a"}],
        passed=1,
        failed=0,
        overall_status="pass",
        evaluated_at=now_iso(),
    )
    run_ctx.save_qa(qa)
    run_ctx.mark_stage("qa")
    return run_ctx


class TestPackagingTamper(unittest.TestCase):
    def test_build_and_verify_round_trip(self):
        with tempfile.TemporaryDirectory() as td:
            run_ctx = _build_minimal_run(Path(td))
            dest_dir = Path(td) / "package_out"
            report = {"report_id": "rpt-test", "run_id": run_ctx.run_id, "lane": run_ctx.lane}
            build_package_dir(run_ctx, report, dest_dir)
            self.assertTrue((dest_dir / "CHECKSUMS.sha256").exists())
            ok, mismatches = verify_package_dir(dest_dir)
            self.assertTrue(ok, mismatches)
            self.assertEqual(mismatches, [])

    def test_zip_package_dir_produces_zip(self):
        with tempfile.TemporaryDirectory() as td:
            run_ctx = _build_minimal_run(Path(td))
            dest_dir = Path(td) / "package_out"
            report = {"report_id": "rpt-test", "run_id": run_ctx.run_id, "lane": run_ctx.lane}
            build_package_dir(run_ctx, report, dest_dir)
            zip_path = zip_package_dir(dest_dir, Path(td) / "out.zip")
            self.assertTrue(zip_path.exists())
            self.assertGreater(zip_path.stat().st_size, 0)

    def test_tamper_detected_on_content_mutation(self):
        with tempfile.TemporaryDirectory() as td:
            run_ctx = _build_minimal_run(Path(td))
            dest_dir = Path(td) / "package_out"
            report = {"report_id": "rpt-test", "run_id": run_ctx.run_id, "lane": run_ctx.lane}
            build_package_dir(run_ctx, report, dest_dir)
            (dest_dir / "report.json").write_text('{"tampered": true}\n', encoding="utf-8")
            ok, mismatches = verify_package_dir(dest_dir)
            self.assertFalse(ok)
            self.assertTrue(any("report.json" in m for m in mismatches))

    def test_tamper_detected_on_missing_file(self):
        with tempfile.TemporaryDirectory() as td:
            run_ctx = _build_minimal_run(Path(td))
            dest_dir = Path(td) / "package_out"
            report = {"report_id": "rpt-test", "run_id": run_ctx.run_id, "lane": run_ctx.lane}
            build_package_dir(run_ctx, report, dest_dir)
            (dest_dir / "findings.json").unlink()
            ok, mismatches = verify_package_dir(dest_dir)
            self.assertFalse(ok)
            self.assertTrue(any("findings.json" in m for m in mismatches))

    def test_tamper_detected_on_uncovered_extra_file(self):
        with tempfile.TemporaryDirectory() as td:
            run_ctx = _build_minimal_run(Path(td))
            dest_dir = Path(td) / "package_out"
            report = {"report_id": "rpt-test", "run_id": run_ctx.run_id, "lane": run_ctx.lane}
            build_package_dir(run_ctx, report, dest_dir)
            (dest_dir / "sneaky_extra_file.txt").write_text("not part of the original package\n", encoding="utf-8")
            ok, mismatches = verify_package_dir(dest_dir)
            self.assertFalse(ok)
            self.assertTrue(any("sneaky_extra_file.txt" in m for m in mismatches))

    def test_verify_reports_missing_checksums_file(self):
        with tempfile.TemporaryDirectory() as td:
            run_ctx = _build_minimal_run(Path(td))
            dest_dir = Path(td) / "package_out"
            report = {"report_id": "rpt-test", "run_id": run_ctx.run_id, "lane": run_ctx.lane}
            build_package_dir(run_ctx, report, dest_dir)
            (dest_dir / "CHECKSUMS.sha256").unlink()
            ok, mismatches = verify_package_dir(dest_dir)
            self.assertFalse(ok)
            self.assertTrue(any("CHECKSUMS.sha256" in m for m in mismatches))


if __name__ == "__main__":
    unittest.main()
