# OMNIA V9 Canary Concurrency Report

All drills in this report ran against a genuine PostgreSQL 16 server (`OMNIA_V9_TEST_DATABASE_URL`), not PGlite. Tests: [`tests/omnia-v9-canary-concurrency-races.test.mjs`](../../tests/omnia-v9-canary-concurrency-races.test.mjs).

## Double-spend

**Setup**: one canary approval, `maxUses: 1`. **8 concurrent candidates** (`Promise.all`), each a distinct resource, all covered by the same approval.

**Result**: exactly 1 of 8 executed. The other 7 were denied at the `reserveAuthority()` stage (`no-execution:reservation-denied:uses-exhausted`), not at the `admitAction()` stage — several of the 7 legitimately saw `ALLOW` from `admitAction()`'s point-in-time usage snapshot (since usage hadn't yet been incremented when they checked), but only one could win the atomic reservation transaction. `adapter.executionCount()` confirmed exactly 1.

**Mechanism**: the frozen, already-concurrency-tested `OmniaV9ProofStore.reserveAuthority()` — an `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING` racing on a real Postgres unique constraint, with the losing side reading the committed winner's row via `SELECT ... FOR UPDATE`. This mission did not build new concurrency-control logic; it wired the canary's execution gate to depend on the existing one, and then proved the wiring is correct.

## Idempotency

**Setup**: one approval, `maxUses: 5`. **6 concurrent identical retries** (same intent, same idempotency key) of one allowed action.

**Result**: all 6 calls reported `executed: true` (the logical consequence occurred), but the null sink itself was called **exactly once** (`adapter.executionCount() === 1`), all 6 observed the **same receipt digest**, and the approval's usage counter incremented **exactly once** (`uses === 1`).

**A genuine bug found and fixed while building this drill**: the first implementation of idempotent-replay lookup returned the raw Postgres row (snake_case: `receipt_digest`) for a converged duplicate, while a fresh execution returned a camelCase JS object (`receiptDigest`) — every retry beyond the first observed `receipt.receiptDigest === undefined`, which the test correctly caught as "2 distinct receipt digests" (one real value, five `undefined`s). Fixed with a `normalizeStoredReceipt()` mapping so both code paths return an identical shape. This was found by the test failing honestly on first run, not assumed to work.

**A real race this drill exposed and how it's bounded**: `reserveAuthority()`'s row lock guarantees the winning reservation has committed by the time a duplicate caller observes `duplicate: true`, but receipt persistence happens in a separate step after that commit — a concurrent duplicate can legitimately arrive before the winner's receipt write completes. `evaluateAndGateCanaryNull()` polls for the receipt (20ms interval, 500ms budget) before concluding it's a genuine crash-recovery gap and executing once more. Under the timings this mission observed (sub-millisecond to low-tens-of-milliseconds full-path latency — see [`artifacts/omnia-v9/canary-latency.json`](../../artifacts/omnia-v9/canary-latency.json)), the winner's receipt write completes well within the poll budget, so this bound is not a live risk at these latencies; it is documented, not hidden, in [`V9_CANARY_CRASH_RECOVERY_REPORT.md`](./V9_CANARY_CRASH_RECOVERY_REPORT.md)'s checkpoint C.

## Contradictory receipt

**Setup**: persist a receipt for a reservation, then attempt to persist a **different** result (different `receiptDigest`) for the same `reservationId`.

**Result**: the second call is rejected with `CanaryReceiptStoreError` code `CONTRADICTORY_RECEIPT`. The original receipt remains the durable record — read back and confirmed unchanged. Enforced by a real Postgres `PRIMARY KEY (reservation_id)` plus explicit content comparison, not application-level trust.

## Conflicting authorization

**Setup**: persist a receipt bound to one `authorizationDigest`, then attempt to bind a **different** `authorizationDigest` to the same `reservationId`.

**Result**: rejected with code `CONFLICTING_AUTHORIZATION`. Two different authorization histories can never both claim the same consequence.

## Revocation race

**Setup**: issue an approval, execute one candidate successfully (`before: ALLOW`, executed), revoke the approval, then evaluate **5 concurrent candidates** against the same (now-revoked) approval.

**Result**: `before` executed once; all 5 `after` candidates resolved `executed: false`. `adapter.executionCount()` stayed at exactly 1 across the whole drill — no candidate whose final admission occurred after the revocation write completed was able to execute. Authority is re-resolved from the database on every single evaluation; nothing is cached across calls.

## Expiry race (sub-second boundary)

**Setup**: a 1.5-second-lived approval. One candidate evaluated 400ms after issuance (within window): executed. A second candidate evaluated 300ms after the expiry boundary: did not execute.

**Result**: correct on both sides of a sub-second boundary, using real `Date.parse()`/millisecond comparison against real PostgreSQL-stored timestamps — no string-rounding regression, matching the same timestamp-precision discipline already proven in this codebase's frozen closure suite.

## A pre-existing test-infrastructure race found (not a canary defect)

While running the full deterministic suite together with real Postgres, an intermittent `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` appeared. Root cause: Node's test runner executes test *files* concurrently by default, and several ad-hoc test migration helpers in this repo (including one frozen test file) run `CREATE TABLE IF NOT EXISTS` DDL directly against a shared database with no locking — Postgres's `IF NOT EXISTS` check is not atomic against concurrent DDL, so two files migrating the same database at the same instant can both pass the existence check and then race on the system catalog.

This mission's own new test file's migration helper was fixed with the exact `pg_advisory_lock` pattern `src/store.mjs`'s production `migrate()` already uses. The frozen file's helper was left unmodified (not a frozen-core defect, out of scope). **Verified fix**: the full 396-test deterministic suite passes cleanly, 0 failures, when run with `--test-concurrency=1` against one real, shared Postgres database — this serializes test files and removes the shared-DDL race entirely. This is the recommended invocation whenever many real-Postgres-gated test files share one physical database in a single run.
