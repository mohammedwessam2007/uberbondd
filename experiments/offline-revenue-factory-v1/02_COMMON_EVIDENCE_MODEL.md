# Common evidence model

Full detail: `UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/04_evidence_model.md`.
This is the mission-level policy summary.

## 11 record types (`common/models.py::SCHEMA_REGISTRY`)
`evidence_item`, `source_artifact`, `finding`, `issue`, `unknown`,
`human_review_request`, `report`, `run_manifest`, `qa_result`,
`delivery_acceptance`, `cleanup_record`. Each is a `@dataclass` with a
matching `schemas/<record_type>.schema.json` and a matching
`examples/<record_type>.example.json`, proven consistent by
`tests/test_schema_and_examples.py` (5 tests: every schema loads,
every example validates, invalid instances — extra properties, missing
required fields, bad enum values — are rejected).

## Evidence item required content
Per the mission's Phase 1 requirement, every evidence item carries:
ID, lane, source type/path/hash, collection timestamp, data
classification, observed value, parser/version, deterministic
transform, confidence, limitation, prohibited interpretation,
human-review flag, and — via `report_refs`/the report's own
`evidence_refs` — chain-of-custody linkage back to whichever report(s)
cite it.

## 9 finding labels (`FINDING_LABELS`)
`observed fact`, `parsed fact`, `deterministic calculation`,
`source-derived rule`, `model interpretation`, `assumption`,
`unknown`, `blocked conclusion`, `human-review requirement`. Every
`Finding` carries exactly one; the `qa-finding-labels-valid` QA check
and the schema's `enum` constraint both enforce this — one at the
application layer, one at the serialization layer.

## Validation before every write
`common/validation.py::validate_record_or_raise` runs before any
record touches disk, via `RunContext`'s `add_evidence`/`add_finding`/
`add_issue`/`add_unknown`/`add_human_review`. A lane cannot write a
record that violates its own declared schema. The validator itself
(`common/schema.py`) is a minimal, hand-rolled JSON Schema Draft
2020-12 implementation — no third-party `jsonschema` package —
supporting `type`, `properties`, `additionalProperties`, `required`,
`enum`, `items`, `pattern`, `minLength`, `minimum`, `maximum`, and
raising `NotImplementedError` rather than silently ignoring any
unsupported keyword.

## Never invent values
Per the mission's core design rule, unavailable telemetry (e.g. owner
minutes, AI minutes, wall-clock duration when timestamps are missing)
is recorded as `null`/`"unknown"`, never a guessed number. This is
enforced by convention in `economics/recorder.py` and by the `unknown`
finding label everywhere else — see `13_ECONOMIC_INSTRUMENTATION/` and
`09_economics_and_pricing.md`.
