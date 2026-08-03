# Adding a new lane

Adding a sixth lane means writing one module that satisfies the lane
plugin contract (`lanes/base.py`) and registering it — `cli.py` itself
needs no changes, because it consumes every lane uniformly through
that contract.

## 1. Register the lane
Add the lane's key to `LANES` in `src/urf/lanes/__init__.py`:
```python
LANES = ("msft_csp", "hospital_mrf", "agency_rfp", "accessibility", "lead_path", "your_new_lane")
```
`get_lane_module(lane)` does `importlib.import_module(f"urf.lanes.{lane}")`,
so the module must be named `src/urf/lanes/your_new_lane.py`.

## 2. Implement the four required functions
```python
FIXTURES: dict[str, str]                                  # fixture_id -> directory name under fixtures/your_new_lane/
def validate_input(fixture_dir: Path) -> list[dict]: ...  # Issue-shaped dicts, not yet persisted
def execute(run_ctx: RunContext, fixture_dir: Path) -> None: ...
def qa_checks(run_ctx: RunContext) -> list[dict]: ...      # [{check_id, description, status, detail}]
def lane_meta() -> dict: ...                                # executive_summary, scope, exclusions, methods, mandatory_disclaimers, buyer_role
```

`execute` is where all evidence production happens, via `RunContext`'s
validated writers — never write evidence/findings JSON by hand:
```python
run_ctx.add_evidence(source_type=..., source_path=..., source_hash=...,
                      data_classification=..., observed_value=...,
                      parser=..., parser_version=..., deterministic_transform=...,
                      confidence=..., limitation=..., prohibited_interpretation=...,
                      human_review_required=...)
run_ctx.add_finding(label=..., statement=..., evidence_refs=[...],
                     confidence=..., human_review_required=...)
run_ctx.add_issue(severity=..., category=..., description=..., ...)
run_ctx.add_unknown(...)
run_ctx.add_human_review(reason=..., required_role=..., blocking=...)
```
Every one of these validates the record against its schema
(`schemas/<record_type>.schema.json`) before writing — an invalid call
raises immediately rather than corrupting the run.

## 3. Follow the no-fabrication invariant
This is the single most important rule carried across every existing
lane, and the one `tests/test_lanes_full_pipeline.py` enforces
mechanically: **whenever `execute` sets `human_review_required=True`
on a finding, it must also call `add_human_review` with a matching,
specific reason.** A flagged finding with no corresponding request is
an audit-trail dead end — this was a real defect found and fixed in
`hospital_mrf.py` and `msft_csp.py` this session (see
`05_lane_reference.md`). If your lane reaches a point where it
genuinely cannot determine something, record an `unknown` finding
(never a guess) and, if a human must resolve it, a matching
`human_review_request`.

Decide up front whether your lane is a **decision lane** (like
`msft_csp`, `agency_rfp`, `accessibility`, `lead_path` — it always
concludes with a `"blocked conclusion"` finding, because the actual
decision is structurally reserved for a human/partner channel this
offline system cannot reach) or a **data-integrity lane** (like
`hospital_mrf` — it reports anomalies individually rather than
producing one final blocked decision). Either shape is fine; be
consistent about which one you're building and update
`LANES_WITH_BLOCKED_CONCLUSION` in `test_lanes_full_pipeline.py`
accordingly if it's a decision lane.

## 4. Add fixtures
`fixtures/your_new_lane/<fixture_id>/` — at least one clean/happy-path
fixture and enough edge-case fixtures to exercise every
finding/unknown/human-review branch in `execute`. Fixtures are
synthetic data only (see the mission's data-safety rules) —
`DATA_CLASSES` includes `SYNTHETIC` for exactly this reason.

## 5. Write `lane_meta()` claim-safety-clean
`executive_summary`, `scope`, `exclusions`, `methods`, and
`mandatory_disclaimers` all feed directly into the rendered report
text that `claim_safety/rules.py::scan_text` checks at `render` time
(see `06_claim_safety.md`). Do not write "this guarantees...",
"...is fully compliant", or a bare dollar/percent figure with no
evidence marker into any of these fields — `render` will block on it.

## 6. Test it
Add the lane to `LANES` and `test_lanes_full_pipeline.py` picks it up
automatically (it iterates `LANES` and each lane module's `FIXTURES`).
Run the targeted module first, then the full suite:
```
cd tests
python3 -m unittest test_lanes_full_pipeline -v
./../scripts/run_tests.sh
```
