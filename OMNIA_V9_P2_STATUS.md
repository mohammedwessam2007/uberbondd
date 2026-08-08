# OMNIA V9 P2 — Canonical Constitution Binding

Status: **STRUCTURALLY IMPLEMENTED; 16/16 BINDER TESTS VERIFIED LOCALLY; REAL-SOURCE CONSTITUTION DIGEST NOT YET EXECUTED IN THIS SANDBOX**

P2 builds on P1. It still does not make Markdown executable policy and still does not control any production side effect.

## What P2 discovered

The V9 research initially emphasized three constitutional sources:

- Core Data Model;
- Decision Engine;
- Learning Engine.

Direct repository reconciliation showed that this is incomplete. The Decision and Learning engines consume the Knowledge Graph, and the Core Data Model preserves Knowledge Graph semantics/IDs alongside the other constitutional artifacts.

Therefore the first canonical source set is exactly four documents:

1. `docs/constitution/knowledge-graph-v1.md`
2. `docs/constitution/decision-engine-v1.md`
3. `docs/constitution/learning-engine-v1.md`
4. `docs/constitution/core-data-model-v1.md`

All are expected at Version `1.0.0`, effective `2026-07-14`.

## What P2 implements

- `config/omnia-v9/constitution-sources.json`: explicit normative source set, required dependencies, expected metadata, literal normative anchors, and source-anchored precedence rules.
- `src/omnia-v9/constitution.mjs`: deterministic exact-byte constitution binder.
- Every source is SHA-256 hashed from its exact bytes.
- Source title, version, effective date, required anchors, dependencies and precedence anchors must match the manifest.
- Duplicate roles or paths fail closed.
- Missing normative dependencies are `INCOMPLETE`, not silently omitted.
- Dependency cycles are `CANONICAL_CONFLICT`.
- Unexpected additional constitutional roles fail closed rather than silently expanding the source of law.
- Input order cannot change the resulting digest.
- A one-byte source change necessarily changes the source-set digest and constitution digest.
- Explicit precedence rules are accepted only when their literal anchor exists in the named normative source.
- The resulting bundle deliberately declares `EXACT_SOURCE_BINDING_NOT_EXECUTABLE_POLICY`.
- `scripts/verify-v9-p2.mjs`: graded real-repository verifier returning `P2_CONSTITUTION_BOUND`, `INCOMPLETE`, `CANONICAL_CONFLICT`, or `FAIL`.

## Explicit normative dependency graph

```text
KNOWLEDGE_GRAPH
      ↑
DECISION_ENGINE
      ↑
LEARNING_ENGINE
      ↑
CORE_DATA_MODEL
```

The arrows mean “is a required normative dependency of”, not that a lower document may override the higher one.

The Core Data Model also depends on all three companion specifications as a compatibility contract.

## Explicit precedence currently bound

### Decision hard gates over learning

The Learning Engine literally states that if it conflicts with a non-waivable Decision Engine gate, the gate wins.

### Current evidence/Decision gates over Knowledge Graph priors for external claims

The Decision Engine literally states that a graph prior such as `SUSCEPTIBLE_TO` may decide what to inspect but cannot by itself create a finding, recommendation, outreach claim, or price.

### Core canonical semantics over local projections

The Core Data Model prohibits products, APIs, agents or databases from creating a competing local meaning for a canonical entity.

P2 does not invent any additional precedence rule merely because it sounds sensible.

## Local verification truth

Verified locally against synthetic source fixtures exercising the same binder:

- **16/16 tests pass**;
- deterministic digest on repeated compilation;
- map/source order independence;
- one-byte drift changes digest;
- missing source => `INCOMPLETE`;
- unexpected source => conflict;
- duplicate role/path => conflict;
- missing dependency => `INCOMPLETE`;
- dependency cycle => conflict;
- version drift => conflict;
- effective-date drift => conflict;
- missing normative anchor => conflict;
- unanchored precedence => conflict;
- Decision-over-Learning precedence is represented;
- evidence-over-graph-prior boundary is represented;
- bundle explicitly says exact-source binding is not executable policy.

Repository searches through the connected GitHub app independently confirmed the critical literal Decision/Learning anchors used by the manifest.

## What is NOT claimed yet

- The exact-byte `constitutionDigest` of the four real repository files has not been executed in this sandbox because the GitHub repository is connector-only here and direct network cloning is unavailable.
- GitHub Actions cannot currently execute the verifier because the account is locked from starting runners due to a billing issue.
- Therefore P2 is **not** being labeled `P2_CONSTITUTION_BOUND` in this status document yet, even though the verifier is implemented.
- Structural/anchor compatibility is not a proof that every sentence in four long Markdown documents is semantically contradiction-free.
- P2 does not translate prose into Cedar policies.
- P2 does not make owner sovereignty cryptographically source-bound because there is not yet a separately signed owner-governance artifact in this source set. Existing operational owner sovereignty remains an invariant from P0/P1 and the constitutional documents, but a dedicated owner-root trust object is a later gate.

## P3 gates

1. Execute `npm run verify:v9:p2` in a repo-capable runner and freeze the resulting real constitution/source-set digests as generated build evidence, not hand-entered constants.
2. Build a versioned executable policy bundle only for high-leverage deterministic rules that can be faithfully mapped from the normative sources.
3. Use Cedar or another mature policy engine only after its exact JavaScript/WASM integration, schema validation and error behavior are verified from official sources.
4. Bind the policy digest to the exact policy source, schema, evaluator/runtime version and build artifact.
5. Never claim Cedar or any policy engine executes the entire Markdown constitution. It executes a selected, traceable projection whose provenance points back to normative anchors.
6. Add an explicit policy-coverage ledger showing which constitutional rules are executable, monitored, human-only, deferred or intentionally non-machine-enforceable.

## Design law added by P2

**V9 may execute only a traceable projection of law. The law itself remains the exact versioned normative source set, and any missing, changed, conflicting or unanchored source fails closed.**
