# OMNIA V9 P0 — Proof-Bound Admission Kernel

Status: **P0_KERNEL_VERIFIED locally; NOT production-authoritative**

## What exists now

- Deterministic canonical serialization and SHA-256 content binding.
- Ed25519 signing and verification helpers for approval digests.
- Closed schemas for `ActionIntent`, `OwnerApproval`, and `EvidenceRecord`; unknown fields fail validation.
- A fail-closed admission kernel producing `ALLOW`, `REVIEW`, or `DENY` decisions.
- Resolvable approval verification: issuer/key lookup, signature, temporal validity, revocation, tenant, actor, operation, resource, purpose, effect class, blast-radius, cost and use limits.
- Evidence verification with immutable origin, relation, verification claims, lifecycle flags, content digest, tenant binding, freshness/expiry, and optional external-origin requirement.
- Kill-state and intent-revocation dominance.
- Policy adapter boundary that DENIES when no policy authorizer exists or when policy evaluation errors.
- Content-bound `ExecutionReceipt` primitive.
- Shadow-only outbound adapter that does not accept legacy `campaign.approved = true` as authority.
- 27 materially distinct semantic/adversarial tests.
- `node scripts/verify-v9.mjs` one-command P0 verifier.

## Bugs already caught by the new verifier during construction

1. Non-finite numeric input (`NaN`) originally caused canonicalization to throw instead of returning a controlled deny. The verifier exposed it; the kernel now fails closed.
2. Malformed timestamps could originally flow into comparisons as `NaN`. The verifier exposed it; intent, approval and evidence timestamp parsing now fails closed.

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
- Cedar schema/policy bundle version registry and fail-closed adapter semantics.
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
