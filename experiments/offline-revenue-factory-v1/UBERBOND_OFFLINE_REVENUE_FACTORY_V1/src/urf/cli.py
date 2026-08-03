#!/usr/bin/env python3
"""urf command-line interface (mission Phase 2).

Subcommands: init-run, validate-input, execute, qa, render, package,
cleanup, verify-package. Every subcommand is synchronous, makes no
network requests, and writes only under the workspace (product root by
default, or --workspace for an isolated location).

Usage:
    python -m urf.cli init-run --lane hospital_mrf --fixture valid [--run-id ID] [--seed S] [--workspace DIR]
    python -m urf.cli validate-input --lane hospital_mrf --run-id ID [--workspace DIR]
    python -m urf.cli execute --lane hospital_mrf --run-id ID [--workspace DIR]
    python -m urf.cli qa --lane hospital_mrf --run-id ID [--workspace DIR]
    python -m urf.cli render --lane hospital_mrf --run-id ID --template internal_qa [--workspace DIR]
    python -m urf.cli package --lane hospital_mrf --run-id ID --template internal_qa [--workspace DIR]
    python -m urf.cli cleanup --lane hospital_mrf --run-id ID [--workspace DIR]
    python -m urf.cli verify-package --package PATH
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from urf.claim_safety import rules as claim_rules  # noqa: E402
from urf.common import jsonio  # noqa: E402
from urf.common.hashing import sha256_file  # noqa: E402
from urf.common.paths import Workspace, fixtures_dir  # noqa: E402
from urf.common.ids import make_run_id  # noqa: E402
from urf.common.runstore import RunContext  # noqa: E402
from urf.lanes import LANES, get_lane_module  # noqa: E402
from urf.lanes.base import build_report, run_qa, build_delivery_acceptance  # noqa: E402
from urf.packaging.package import build_package_dir, zip_package_dir, verify_package_dir, cleanup_run  # noqa: E402
from urf.report_engine.render import write_all  # noqa: E402
from urf.report_engine import templates as tmpl  # noqa: E402


def _workspace(args) -> Workspace:
    base = Path(args.workspace).resolve() if getattr(args, "workspace", None) else None
    return Workspace(base=base)


def _fixture_dir(lane: str, fixture_id: str) -> Path:
    lane_mod = get_lane_module(lane)
    if fixture_id not in lane_mod.FIXTURES:
        raise SystemExit(f"unknown fixture_id {fixture_id!r} for lane {lane!r}. Known: {list(lane_mod.FIXTURES)}")
    return fixtures_dir() / lane / lane_mod.FIXTURES[fixture_id]


def cmd_init_run(args) -> int:
    ws = _workspace(args)
    run_id, origin = make_run_id(args.lane, args.fixture, args.seed, args.run_id)
    fixture_dir = _fixture_dir(args.lane, args.fixture)
    input_hashes = {}
    for p in sorted(fixture_dir.rglob("*")):
        if p.is_file():
            input_hashes[str(p.relative_to(fixtures_dir()))] = sha256_file(p)
    run_ctx = RunContext(run_id, args.lane, args.fixture, ws)
    manifest = run_ctx.init_manifest(input_hashes)
    print(f"run_id={run_id} origin={origin} lane={args.lane} fixture={args.fixture}")
    print(f"manifest={run_ctx.paths.manifest_path}")
    return 0


def cmd_validate_input(args) -> int:
    ws = _workspace(args)
    run_ctx = RunContext(args.run_id, args.lane, args.fixture or "", ws)
    manifest = run_ctx.load_manifest()
    if manifest is None:
        raise SystemExit("run not initialized: run init-run first")
    fixture_dir = _fixture_dir(args.lane, manifest["fixture_id"])
    lane_mod = get_lane_module(args.lane)
    issues = lane_mod.validate_input(fixture_dir)
    for issue in issues:
        run_ctx.add_issue(**issue)
    run_ctx.mark_stage("validate-input")
    critical = [i for i in issues if i.get("severity") == "critical"]
    print(f"validate-input: {len(issues)} issue(s) recorded ({len(critical)} critical)")
    return 0


def cmd_execute(args) -> int:
    ws = _workspace(args)
    run_ctx = RunContext(args.run_id, args.lane, args.fixture or "", ws)
    manifest = run_ctx.load_manifest()
    if manifest is None:
        raise SystemExit("run not initialized: run init-run first")
    fixture_dir = _fixture_dir(args.lane, manifest["fixture_id"])
    lane_mod = get_lane_module(args.lane)
    lane_mod.execute(run_ctx, fixture_dir)
    run_ctx.mark_stage("execute")
    print(f"execute: findings={len(run_ctx.all_findings())} evidence={len(run_ctx.all_evidence())} "
          f"unknowns={len(run_ctx.all_unknowns())} human_review={len(run_ctx.all_human_reviews())}")
    return 0


def cmd_qa(args) -> int:
    ws = _workspace(args)
    run_ctx = RunContext(args.run_id, args.lane, args.fixture or "", ws)
    if run_ctx.load_manifest() is None:
        raise SystemExit("run not initialized: run init-run first")
    lane_mod = get_lane_module(args.lane)
    extra_checks = lane_mod.qa_checks(run_ctx) if hasattr(lane_mod, "qa_checks") else []
    qa = run_qa(run_ctx, extra_checks)
    run_ctx.mark_stage("qa")
    print(f"qa: overall_status={qa['overall_status']} passed={qa['passed']} failed={qa['failed']}")
    return 0 if qa["overall_status"] == "pass" else 1


def cmd_render(args) -> int:
    ws = _workspace(args)
    run_ctx = RunContext(args.run_id, args.lane, args.fixture or "", ws)
    if run_ctx.load_manifest() is None:
        raise SystemExit("run not initialized: run init-run first")
    lane_mod = get_lane_module(args.lane)
    lane_meta = lane_mod.lane_meta()
    report = build_report(run_ctx, lane_meta, args.template)

    unsafe = claim_rules.scan_text(report["executive_summary"] + " ".join(report["limitations"]))
    unsafe += claim_rules.check_synthetic_disclosure(report["executive_summary"], uses_synthetic_data=True)
    if unsafe:
        raise SystemExit(f"claim-safety violation(s) blocked render: {[v.category for v in unsafe]}")

    strip_branding = tmpl.sections_for(args.template).get("strip_branding", False)
    out_dir = run_ctx.paths.run_dir_reports
    paths = write_all(report, run_ctx.all_evidence(), out_dir, strip_branding=strip_branding)
    jsonio.write_json(out_dir / "report_record.json", report)
    run_ctx.mark_stage("render")
    print(f"render: template={args.template} out_dir={out_dir}")
    for k, v in paths.items():
        print(f"  {k}: {v}")
    return 0


def cmd_package(args) -> int:
    ws = _workspace(args)
    run_ctx = RunContext(args.run_id, args.lane, args.fixture or "", ws)
    if run_ctx.load_manifest() is None:
        raise SystemExit("run not initialized: run init-run first")
    report_path = run_ctx.paths.run_dir_reports / "report_record.json"
    if not report_path.exists():
        raise SystemExit("no rendered report found: run render first")
    report = jsonio.read_json(report_path)

    dest_dir = run_ctx.paths.run_dir_reports / "package"
    build_package_dir(run_ctx, report, dest_dir)
    zip_path = Path(args.out) if args.out else (run_ctx.paths.run_dir_reports / f"{args.run_id}.zip")
    zip_package_dir(dest_dir, zip_path)

    final_hash = sha256_file(zip_path)
    manifest = run_ctx.load_manifest()
    manifest["final_package_hash"] = final_hash
    manifest["qa_ref"] = f"qa-{run_ctx.run_id}"
    jsonio.write_json(run_ctx.paths.manifest_path, manifest)
    run_ctx.mark_stage("package")
    print(f"package: zip={zip_path} sha256={final_hash}")
    return 0


def cmd_cleanup(args) -> int:
    ws = _workspace(args)
    run_ctx = RunContext(args.run_id, args.lane, args.fixture or "", ws)
    if run_ctx.load_manifest() is None:
        raise SystemExit("run not initialized: run init-run first")
    record = cleanup_run(run_ctx)
    run_ctx.mark_stage("cleanup")
    print(f"cleanup: removed={len(record['removed_paths'])} retained={len(record['retained_paths'])}")
    return 0


def cmd_verify_package(args) -> int:
    package_path = Path(args.package)
    if package_path.suffix == ".zip":
        import tempfile
        import zipfile
        with tempfile.TemporaryDirectory() as td:
            with zipfile.ZipFile(package_path) as zf:
                zf.extractall(td)
            ok, mismatches = verify_package_dir(Path(td))
    else:
        ok, mismatches = verify_package_dir(package_path)
    print(f"verify-package: {'OK' if ok else 'FAILED'}")
    for m in mismatches:
        print(f"  - {m}")
    return 0 if ok else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="urf", description="UberBond Offline Revenue Factory CLI")
    sub = p.add_subparsers(dest="command", required=True)

    def common(sp):
        sp.add_argument("--lane", required=True, choices=LANES)
        sp.add_argument("--run-id", dest="run_id", default=None)
        sp.add_argument("--fixture", default=None)
        sp.add_argument("--workspace", default=None)

    sp = sub.add_parser("init-run"); common(sp); sp.add_argument("--seed", default=None)
    sp.set_defaults(func=cmd_init_run, run_id_required=False)

    sp = sub.add_parser("validate-input"); common(sp); sp.set_defaults(func=cmd_validate_input)
    sp = sub.add_parser("execute"); common(sp); sp.set_defaults(func=cmd_execute)
    sp = sub.add_parser("qa"); common(sp); sp.set_defaults(func=cmd_qa)

    sp = sub.add_parser("render"); common(sp)
    sp.add_argument("--template", required=True, choices=tmpl.TEMPLATES)
    sp.set_defaults(func=cmd_render)

    sp = sub.add_parser("package"); common(sp)
    sp.add_argument("--out", default=None)
    sp.set_defaults(func=cmd_package)

    sp = sub.add_parser("cleanup"); common(sp); sp.set_defaults(func=cmd_cleanup)

    sp = sub.add_parser("verify-package")
    sp.add_argument("--package", required=True)
    sp.set_defaults(func=cmd_verify_package)

    return p


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "init-run" and not args.fixture:
        raise SystemExit("init-run requires --fixture")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
