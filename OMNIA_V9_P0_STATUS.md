# OMNIA V9 P0 — Proof-Bound Admission Kernel

Status: **P0_KERNEL_VERIFIED locally; NOT production-authoritative**

## What exists now

- Deterministic canonical serialization and SHA-256 content binding.
- Ed25519 signing and verification helpers for approval digests.
- Closed schemas for `ActionIntent`, `OwnerApproval`, `EvidenceRecord`, and `ExecutionReceipt`; unknown fields fail validation.
- A fail-closed admission kernel producing `ALLOW`, `REVIEW`, or `DENY` decisions.
- Resolvable approval verification: issuer/key lookup, signature, temporal validity, revocation, tenant, actor, operation, resource, purpose, effect class, blast-radius, cost and use limits.
- Evidence verification with immutable origin, relation, validated verification claims/lifecycle flags, content digest, tenant binding, freshness/expiry, and resolved origin requirements. `EXTERNAL_SOURCE` must resolve to HTTP(S), not a fabricated placeholder.
- Kill-state and intent-revocation dominance.
- Policy adapter boundary that DENIES when no policy authorizer exists or when policy evaluation errors.
- Content-bound `ExecutionReceipt` creation plus independent receipt verification.
- Shadow-only outbound adapter that does not accept legacy `campaign.approved = true` as authority.
- 44 materially distinct semantic/adversarial tests.
- `node scripts/verify-v9.mjs` one-command P0 verifier.

## Bugs already caught by the new verifier during construction

1. Non-finite numeric input (`NaN`) originally caused canonicalization to throw instead of returning a controlled deny. The verifier exposed it; the kernel now fails closed.
2. Malformed timestamps could originally flow into comparisons as `NaN`. The verifier exposed it; intent, approval and evidence timestamp parsing now fails closed.
3. The first shadow adapter could label a missing evidence URL as `EXTERNAL_SOURCE`; it now records an internal observation and therefore cannot satisfy an external-evidence gate.
4. The first admission draft accepted a caller-supplied `effectKnown` flag; effect classes are now closed-schema facts, so callers cannot bless an unknown consequential effect.
5. A consequential `ALLOW` originally did not require resolvable policy/constitution digests; P0 now denies without both.
6. The first receipt helper could create a content-bound receipt without independently validating its schema/timestamps/cost; receipt creation now self-verifies and tampering is separately detectable.
7. Canonicalization originally accepted more JavaScript object shapes than a signing boundary should. It now rejects cycles, non-plain objects, non-finite numbers, BigInt/functions/symbols/undefined.

These are exactly the kinds of defects V9 is intended to surface before consequence.

## What is deliberately NOT claimed

P0 is not the final V9 and is not allowed to become production authority yet.

The following remain unimplemented:

- Canonical reconciliation and digesting of the existing UberBond Core Data Model + Decision Engine + Learning Engine.
- Cedar-backed production policy evaluation. P0 exposes a policy adapter and fails closed when it is absent.
- Persistent `ActionIntent`, approval, evidence, authorization-decision, revocation and execution-receipt storage.
- PostgreSQL-backed atomic consumption of bounded authority (`maxUses`, cost, recipient/action budgets) under concurrency.
- Final-admission / TOCTOU protection immediately before external side effects.
- Production integration with `Pipeline.maybeSend()` or any other consequential path.
- Signed authorization decisions and execution receipts with managed production keys.
- Derived reviewer independence and review-attestation graph.
- TLA+/TLC temporal models and Alloy relational models for the sovereignty invariants.
- Mutation-test automation beyond the explicit adversarial test cases in P0.
- Fuzzing, concurrency, crash-recovery and migration/rollback gates for V9 state.
- Cedar schema/policy bundle version registry and fail-closed adapter semantics. P0 requires policy/constitution digests for consequential ALLOW but does not yet prove that `policyDigest` cryptographically names the exact evaluator implementation/bundle.
- Cross-language standard canonicalization. P0 uses a deterministic internal JSON canonicalizer; before production signatures cross runtime/language boundaries, adopt or justify a standard such as RFC 8785 JCS or deterministic CBOR.
- Evidence verification claims are closed enums in P0 but remain metadata. P1 must resolve each material claim to an attestation/identity/source object rather than trusting the label.
- Structured resource ontology. P0 resource scope uses string prefixes; P1 should move authority decisions to typed resources/entities.
- A full `./verify-v9 --full` contract spanning software, formal, provenance and external-proof states.

## P1 admission gates

P1 should not control a live external effect until all of these are true:

1. Existing UberBond constitutional sources are reconciled into one versioned canonical policy input.
2. Cedar or an equivalently mature policy engine is integrated behind the policy adapter with closed schemas and error-to-deny semantics.
3. Proof objects and revocations are persistent and content-addressed.
4. Approval limits are consumed atomically in PostgreSQL.
5. The outbound integration performs final admission after reservation/state changes and immediately before the provider side effect.
6. The existing outbound idempotency/uncertain-send protections remain authoritative and are wrapped, not replaced.
7. A signed `ExecutionReceipt` is written for every admitted attempt, including FAILED and UNCERTAIN outcomes.
8. Security mutation tests demonstrate that removing expiry, revocation, tenant, digest, kill-state or idempotency bindings makes CI fail.
9. Critical temporal/relational invariants are modeled with TLA+/TLC and Alloy or a justified equivalent.
10. Production remains disabled until the owner explicitly approves a bounded live canary.

## Design law

**Intelligence may propose. Only resolved authority + resolved evidence + deterministic policy may admit consequence.**
