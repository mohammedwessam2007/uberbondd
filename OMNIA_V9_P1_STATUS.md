# OMNIA V9 P1 — Persistent Proof + Atomic Authority Reservation

Status: **IMPLEMENTED ON STACKED BRANCH; JS SYNTAX VERIFIED LOCALLY; SQL INTEGRATION TESTS ADDED BUT NOT EXECUTED LOCALLY**

P1 builds on P0. It still does not control any production side effect.

## What P1 adds

- `omnia_v9_objects`: content-bound proof objects for intents, approvals, evidence, decisions, receipts and later policy/constitution bundles.
- Type-specific digest binding and identity binding. A valid approval cannot be aliased under a different object ID.
- `omnia_v9_revocations`: append-style revocation records that are consulted before authority is reserved.
- `omnia_v9_approval_usage`: database-owned use/cost counters.
- `omnia_v9_authority_reservations`: idempotent authority reservations bound to exact intent digest + approval + tenant.
- Reservation-time cryptographic re-verification of the stored owner approval. Persistence never equals authority.
- Atomic transaction flow: create idempotency reservation -> resolve signed approval -> check revocation/time/tenant -> lock usage -> enforce signed limits -> consume usage -> mark RESERVED.
- Duplicate identical reservation does not consume authority twice.
- Same idempotency key with a different intent/approval/tenant is rejected.
- `RELEASED` reservations refund reserved use/cost once; `COMMITTED` and `UNCERTAIN` keep authority consumed.
- `persistAndReserveAdmission()`: persists the P0 proof objects, evaluates policy/evidence/approval, then performs the database-owned authority reservation. `executable=true` requires both policy `ALLOW` and successful reservation.

## Verification truth

Locally verified now:

- P0 remains **44/44 passing**.
- `proof-store.mjs`, `persistent-admission.mjs`, and the new SQL integration test file all pass Node syntax checks.

Not locally executed:

- PGlite SQL integration tests, because this sandbox's restricted npm mirror does not contain `@electric-sql/pglite` even though the real repo declares it as a dev dependency.
- GitHub Actions, because the repository account is currently prevented from starting runners by a GitHub billing lock.

Therefore P1 is **not** labeled database-verified yet.

## P1 database tests added

The repository test suite covers:

1. migration creates all four V9 proof/authority tables;
2. proof-object content immutability by identity;
3. object identity binding prevents signed-object aliasing;
4. stored but cryptographically invalid approval cannot spend authority;
5. one reservation consumes use/cost once;
6. duplicate idempotent reservation does not double-consume;
7. same idempotency key cannot bind a different intent;
8. `maxUses` enforcement;
9. cumulative cost enforcement;
10. revocation blocks future reservation;
11. release refunds exactly once while commit does not;
12. persistent admission becomes executable only after authority reservation.

## Important remaining P2 gates

- Run the PGlite tests and a true multi-connection PostgreSQL race test once CI/runners are available.
- Bind policy digest to the exact Cedar policy bundle/evaluator.
- Canonically reconcile Core Data Model + Decision Engine + Learning Engine and produce the real constitution digest.
- Move from string resource prefixes to typed resources.
- Replace verification-claim labels with resolvable attestations.
- Add final-admission recheck after existing outbound reservation and immediately before provider side effect.
- Persist signed execution receipts for `SUCCEEDED`, `FAILED`, and `UNCERTAIN` attempts.
- Add formal temporal/relational invariants and mutation/fuzz/concurrency gates.

## Design law added by P1

**Stored approval is not spendable authority. Authority exists only when the exact signed approval is freshly re-verified, unrevoked, in scope, and atomically reserved against its database-owned budget.**
