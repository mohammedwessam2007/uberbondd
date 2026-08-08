# OMNIA V9 P6 Status

## Layer

P6: database-enforced immutable execution-receipt identity.

## Implemented

- Migration `006_omnia_v9_execution_receipt_uniqueness.sql`.
- `omnia_v9_execution_receipt_bindings` with:
  - `reservation_id` as the consequence identity primary key;
  - globally unique `receipt_digest`;
  - tenant, outcome, pre-effect context digest, pre-effect observation digest, immutable receipt JSON, and creation time.
- `OmniaV9ExecutionReceiptStore.persistOnce()`:
  - verifies the P5 receipt before persistence;
  - writes the consequence binding and generic P1 `EXECUTION_RECEIPT` proof in one transaction;
  - treats same reservation + same digest + same tenant as an idempotent replay;
  - rejects same reservation + different digest or tenant as `CONSEQUENCE_CONFLICT`;
  - rejects one digest rebound to another reservation as `RECEIPT_IDENTITY_CONFLICT`;
  - rejects generic proof-ledger disagreement as `PROOF_LEDGER_CONFLICT` and rolls back the consequence binding.
- PGlite-backed P6 tests cover schema, first insert, idempotent replay, contradictory receipts, tenant mismatch, tampering, proof-ledger rollback, and missing generic proof.
- Two real multi-connection PostgreSQL race tests are implemented behind `OMNIA_V9_TEST_DATABASE_URL`:
  - concurrent identical writers must yield one insert and one idempotent replay;
  - concurrent contradictory receipts for one reservation must yield one winner and one `CONSEQUENCE_CONFLICT`.
- Migration `006` is included in the repo-wide PostgreSQL schema gate, with direct uniqueness tests for both reservation identity and receipt-digest identity.
- `scripts/verify-v9-p6.mjs` refuses to return VERIFIED unless the disposable real-Postgres race tests actually run.

## Deliberate non-claims

- P6 is not production authorization or enforcement.
- P6 does not prove Gmail delivery, customer acceptance, reply, or commercial success.
- The real PostgreSQL contention tests have not been executed in this connector-only environment.
- GitHub Actions runner execution remains externally blocked by the previously observed account billing lock.
- `tenantId` is currently bound by the persistence call/database row, but P5 receipts do not yet cryptographically carry tenant identity. Caller-supplied tenant context is therefore not sufficient for future enforcement.
- P6 receipts are not yet bound to a resolved P1 ActionIntent + AuthorizationDecision + P2 constitution digest + P3 policy digest chain.

## Current truth state

**IMPLEMENTED / CONCURRENCY VERIFICATION INCOMPLETE**

P6 is structurally designed to let PostgreSQL arbitrate receipt races, but no claim of real multi-connection correctness is made until `npm run verify:v9:p6` succeeds against a disposable PostgreSQL database.

## Next hard gate: P7

Bind execution receipts to the exact authorization chain rather than caller context.

A future P7 receipt must carry and resolve at least:

- `tenantId`
- `intentDigest`
- `authorizationDecisionDigest`
- `policyDigest`
- `constitutionDigest`
- consequence/reservation identity
- pre-effect observation/context digests
- execution outcome

Before a receipt can become eligible for enforcement-grade status, V9 must prove that the referenced intent and authorization objects exist, match the same tenant and consequence, remain unrevoked where applicable, and bind the policy/constitution versions that actually admitted the action.
