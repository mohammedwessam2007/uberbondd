# Evidence model

## The 9 finding labels (`common/models.py::FINDING_LABELS`)
Every `Finding` record must use exactly one. The QA base check
`qa-finding-labels-valid` enforces this at runtime, and the schema's
`enum` constraint rejects anything else at write time.

| Label | Meaning | Example |
|---|---|---|
| `observed fact` | Directly read from input, no transform | "File X is 1,204 bytes." |
| `parsed fact` | Extracted via a deterministic parser from structured/semi-structured input | "Requirement REQ-003 is marked MANDATORY." |
| `deterministic calculation` | Computed via fixed, reproducible arithmetic/logic over evidence | "Incident overlaps service-health window for 340 seconds." |
| `source-derived rule` | A rule stated by the source document itself, not inferred | "Amendment supersedes due date per AMENDS field." |
| `model interpretation` | An interpretive read that isn't pure arithmetic (used sparingly; not used by any current lane's happy path) | — |
| `assumption` | An explicit, labeled assumption, never presented as fact | Used throughout `economics/pricing.py` scenario output. |
| `unknown` | Something the system could not determine, disclosed rather than guessed | "No service-health entry matches this incident." |
| `blocked conclusion` | The lane's final, explicit refusal to conclude on a decision it must not make alone | "Overall SLA-credit eligibility is BLOCKED." |
| `human-review requirement` | (label value distinct from the `human_review_required` boolean flag every finding also carries) | — |

## The 8 data classifications (`common/models.py::DATA_CLASSES`)
`PUBLIC`, `SYNTHETIC`, `CUSTOMER_PROVIDED`, `CONFIDENTIAL`,
`PERSONAL_DATA`, `PHI`, `CREDENTIAL`, `PROHIBITED`. Every
`EvidenceItem.data_classification` must be one of these.
`data_safety.classify.classify_and_maybe_quarantine` can force the
*effective* classification to `PROHIBITED` regardless of what was
declared — see `07_data_safety.md`.

## The 11 record types (`common/models.py::SCHEMA_REGISTRY`)
`evidence_item`, `source_artifact`, `finding`, `issue`, `unknown`,
`human_review_request`, `report`, `run_manifest`, `qa_result`,
`delivery_acceptance`, `cleanup_record`. Each has:
- a `@dataclass` in `common/models.py` with a `.to_dict()` and a `record_type` class attribute,
- a matching schema at `schemas/<record_type>.schema.json`,
- a matching example at `examples/<record_type>.example.json`.

`tests/test_schema_and_examples.py` proves every schema loads and
every example validates against it, plus that additional properties,
missing required fields, and invalid enum values are all rejected.

## Schema validator (`common/schema.py`)
A minimal, hand-rolled JSON Schema Draft 2020-12 validator supporting
only: `type`, `properties`, `additionalProperties`, `required`,
`enum`, `items`, `pattern`, `minLength`, `minimum`, `maximum`. It
raises `NotImplementedError` on any unsupported keyword rather than
silently ignoring it — a schema author cannot accidentally rely on a
constraint the validator doesn't actually check. No third-party
`jsonschema` package is used or required.

## Every append is validated before it's written
`RunContext`'s `add_evidence`/`add_finding`/`add_issue`/`add_unknown`/
`add_human_review` all call `validate_record_or_raise` before the
record ever touches disk. A lane module cannot write a record that
violates its own schema.
