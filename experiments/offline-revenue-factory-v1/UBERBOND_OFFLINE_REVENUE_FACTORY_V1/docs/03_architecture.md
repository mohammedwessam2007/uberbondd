# Architecture

## Layout
```
src/urf/
  common/        schema validator, models, hashing, jsonio, ids, paths, runstore, validation
  lanes/         one module per lane + base.py (shared report/qa/acceptance helpers)
  claim_safety/  regex-based outbound-claim scanner (rules.py)
  data_safety/   regex-based credential/PHI/live-payment scanner (classify.py)
  packaging/     package.py — build/zip/verify a delivery package, checksums
  report_engine/ templates.py (4 role-based templates) + render.py (markdown/html/json/csv)
  economics/     recorder.py (real-fact recorder) + pricing.py (labeled-assumption scenario calculator)
  cli.py         the one entry point wiring all of the above together
schemas/         JSON Schema Draft 2020-12 documents, one per record type
examples/        one valid example instance per schema
fixtures/        synthetic input fixtures, organized fixtures/<lane>/<fixture_id>/
templates/commercial/  human-facing commercial paperwork (Phase 9)
tests/           stdlib unittest self-test suite
example_deliveries/     5 real, generated, verified delivery packages (Phase 14)
```

## Data flow for one run
`init-run` creates a `RunContext` bound to a `run_id` and a
`Workspace` (resolved paths). Every subsequent stage re-opens the same
`RunContext` from the same `run_id` + `--workspace`, reads whatever the
prior stage wrote to disk, and appends. Nothing is held only in
memory across CLI invocations — the run directory is the single
source of truth, which is what makes every stage resumable.

## The evidence model (`common/models.py`)
11 record types (`evidence_item`, `source_artifact`, `finding`,
`issue`, `unknown`, `human_review_request`, `report`, `run_manifest`,
`qa_result`, `delivery_acceptance`, `cleanup_record`), each a
`@dataclass` with a matching JSON Schema in `schemas/`, wired together
in `SCHEMA_REGISTRY`. Every record is validated against its schema
before being written to disk (`common/validation.py::validate_record_or_raise`)
— a lane cannot accidentally write a malformed record.

## The lane plugin contract (`lanes/base.py`)
Every lane module exposes exactly:
```python
FIXTURES: dict[str, str]                                  # fixture_id -> directory name
def validate_input(fixture_dir: Path) -> list[dict]: ...  # issue dicts
def execute(run_ctx: RunContext, fixture_dir: Path) -> None: ...
def qa_checks(run_ctx: RunContext) -> list[dict]: ...      # {check_id, description, status, detail}
def lane_meta() -> dict: ...                                # executive_summary, scope, exclusions, methods, mandatory_disclaimers, buyer_role
```
`cli.py` and `lanes/base.py` consume this contract uniformly — adding
a sixth lane means writing one module that satisfies it (see
`11_adding_a_new_lane.md`), no changes to `cli.py` itself.

## Safety gates are structural, not advisory
- **Claim safety** (`claim_safety/rules.py`) runs at `render` time over the report's executive summary + limitations and **blocks the render** (raises, does not warn) on any detected guarantee/certification/eligibility/uplift/professional-advice claim, unsupported number, or missing synthetic-data disclosure.
- **Data safety** (`data_safety/classify.py`) force-reclassifies any input matching a credential/PHI/live-payment pattern to `PROHIBITED`, overriding whatever classification was declared.
- **QA gate** (`lanes/base.py::run_qa` + each lane's `qa_checks`) runs deterministic, code-level checks (evidence refs resolve, finding labels valid, human-review consistency, plus lane-specific certification/claim bans) and blocks `package` in practice because a real operator should not package a `failed` QA result (nothing technically stops `package` after a failed `qa` — the discipline is enforced by `04_delivery_checklist.md`, not the code).
- **Chain of custody** (`packaging/package.py`) — every packaged file is checksummed; `verify_package_dir` independently recomputes and catches tampering, missing files, or extra uncovered files.
