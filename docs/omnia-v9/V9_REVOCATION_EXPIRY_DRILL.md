# OMNIA V9 Revocation & Expiry Drill

Tests: [`tests/omnia-v9-shadow-approval.test.mjs`](../../tests/omnia-v9-shadow-approval.test.mjs), [`tests/omnia-v9-reality-shadow-failure-drills.test.mjs`](../../tests/omnia-v9-reality-shadow-failure-drills.test.mjs). Evidence: `fullStackDemo.revocation` in [`artifacts/omnia-v9/reality-shadow-report.json`](../../artifacts/omnia-v9/reality-shadow-report.json).

All drills run against a real Postgres-wire-protocol database (PGlite in the test suite; a genuine PostgreSQL 16 server for the closure gate and full deterministic regression — see [`V9_REALITY_SHADOW_REPORT.md`](./V9_REALITY_SHADOW_REPORT.md)) and the real Cedar authority.

## Revocation drill

**Procedure:** issue a shadow approval (`maxUses: 5`), evaluate one candidate, revoke the approval via [`revokeShadowApproval()`](../../src/omnia-v9/integrations/shadow-approval.mjs) (which calls the frozen, generic `OmniaV9ProofStore.revoke({targetType: 'OWNER_APPROVAL', ...})`), evaluate a second candidate.

**Result:**

| Step | Decision |
|---|---|
| Before revocation | `ALLOW` |
| After revocation | `REVIEW` |

**Why no cached authorization survives:** [`resolveShadowAuthorityContext()`](../../src/omnia-v9/integrations/shadow-approval.mjs) queries `omnia_v9_revocations` fresh on every call via `proofStore.isRevoked('OWNER_APPROVAL', approvalId)` — there is no in-process cache of approval state anywhere in this codebase. The revoked approval ID is fed into `admitAction()`'s `revokedApprovalIds` set, and the frozen `verifyApproval()` rejects any approval whose ID is in that set with `approval:revoked`, which removes it from the covering-approval search and produces `REVIEW` (`approval:no-covering-resolvable-approval`) — not a fabricated `ALLOW`.

**Concurrent evaluation around revocation:** a revocation attempt for the wrong tenant (`tenant-mismatch`) is rejected with a typed `ShadowApprovalError`, fail-closed — verified directly. True concurrent-transaction races around a revocation event are covered by the frozen closure suite's PostgreSQL concurrency tests (re-run this mission against a real PostgreSQL 16 server; all pass, including the 10 tests that specifically require true multi-connection concurrency, previously skipped for lack of a real server).

## Expiry drill

**Procedure:** issue a 2-second-lived shadow approval (`notBefore = issuedAt`, `expiresAt = issuedAt + 2000ms`), evaluate a candidate 500ms after issuance (within the window), evaluate a second candidate 500ms after expiry.

**Result:**

| Step | Decision |
|---|---|
| Within window (+500ms) | `ALLOW` |
| After expiry (+2500ms) | `REVIEW` |

**Timestamp semantics used:** real ISO-8601 timestamps, compared via `Date.parse()` against the frozen `verifyApproval()`'s `notBeforeMs`/`expiresMs`/`nowMs` millisecond comparison — no string comparison, no rounding. The transition is clean at the exact millisecond boundary the test constructs it around, with no observed precision regression.

## Combined findings

- Revocation and expiry both transition V9's answer from `ALLOW` to `REVIEW` immediately on the very next evaluation — there is no delay, no cache-invalidation step, and no additional configuration required for either to take effect.
- Neither drill required touching the frozen kernel, proof store, or schema — both are exercised entirely through the frozen `verifyApproval()`/`admitAction()` contract plus the additive shadow-approval registry and resolver built this mission.
- Both drills are reproducible on demand via `tests/omnia-v9-shadow-approval.test.mjs` (`revocation drill:` and `expiry drill:` tests).

## Limitations

- The expiry drill uses fixed, pre-computed timestamps rather than a real wall-clock sleep; this exercises the timestamp-comparison logic correctly but does not additionally measure real-world clock-skew behavior across machines.
- Revocation propagation latency in this drill is effectively zero (same process, immediately re-queries the same database); a distributed deployment with connection pooling or read replicas was not modeled.
