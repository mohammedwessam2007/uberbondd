# OMNIA V9 P1 — Persistent Proof + Atomic Authority Reservation

Status: **IMPLEMENTED ON STACKED BRANCH; P0 44/44 VERIFIED LOCALLY; P1 DATABASE VERIFICATION CURRENTLY INCOMPLETE**

P1 builds on P0. It still does not control any production side effect.

## What P1 adds

- `omnia_v9_objects`: proof-object storage for intents, approvals, evidence, authorization decisions and execution receipts.
- P1 stores only proof types with an explicitly registered digest algorithm. Future proof types cannot silently enter the trust boundary.
- Every supported object is re-canonicalized and re-hashed before persistence. A record merely naming a digest is not enough.
- Type-specific identity binding. A valid approval cannot be aliased under a different object ID; evidence, intents, decisions and receipts are likewise bound to their canonical identifiers.
- `omnia_v9_revocations`: revocation records that first resolve the target object and verify tenant ownership before taking effect.
- `omnia_v9_approval_usage`: database-owned use/cost counters.
- `omnia_v9_authority_reservations`: idempotent authority reservations bound to exact intent digest + approval + tenant.
- Reservation-time cryptographic re-verification of the stored owner approval. Persistence never equals authority.
- Atomic transaction flow: create idempotency reservation -> resolve signed approval -> verify stored digest/signature/time/tenant -> check revocation -> lock usage -> enforce signed limits -> consume usage -> mark `RESERVED`.
- Duplicate identical reservations do not consume authority twice.
- The same idempotency key with a different intent/approval/tenant is rejected.
- `RELEASED` reservations refund reserved use/cost once; `COMMITTED` and `UNCERTAIN` keep authority consumed.
- `persistAndReserveAdmission()`: persists P0 proof objects, evaluates policy/evidence/approval, then performs database-owned authority reservation. `executable=true` requires both policy `ALLOW` and successful authority reservation.
- `scripts/verify-v9-p1.mjs`: graded verifier returning `P1_DATABASE_VERIFIED`, `INCOMPLETE`, or `FAIL`. Missing database verification can never become PASS.

## Verification truth

Verified locally in the available sandbox:

- P0 remains **44/44 passing, 0 failing, 0 skipped**.
- A direct PGlite dependency probe returns `ERR_MODULE_NOT_FOUND` in this sandbox.

The P1 branch is wired so the real repository's normal deterministic check will execute both the P1 proof-store suite and migration `005` once dependencies/runners are available.

Not currently executable here:

- PGlite SQL integration tests, because this sandbox's restricted npm mirror does not contain `@electric-sql/pglite` even though the real repository declares it as a dev dependency.
- GitHub Actions, because the repository account is currently prevented from starting runners by a GitHub billing lock. Earlier jobs received no runner and never executed code.

Therefore P1 is **not** labeled database-verified yet. Running `npm run verify:v9:p1` in an environment without PGlite is designed to return **INCOMPLETE**, not PASS.

## P1 database test suite added

There are **14 materially distinct PGlite integration tests** on the branch:

1. migration creates all four V9 proof/authority tables;
2. proof-object content is re-hashed and immutable by identity;
3. object identity binding prevents signed-object aliasing;
4. unsupported future proof types cannot bypass an undefined digest algorithm;
5. content-valid but cryptographically forged approvals cannot spend authority;
6. one reservation consumes use/cost once;
7. duplicate idempotent reservation does not double-consume;
8. the same idempotency key cannot bind a different intent;
9. `maxUses` enforcement;
10. cumulative cost enforcement;
11. expired approval cannot spend persistent authority;
12. revocation resolves target tenant and blocks future reservation;
13. revocation cannot target a nonexistent object;
14. release refunds exactly once while commit retains usage, and the end-to-end persistent-admission case verifies `executable` only after reservation.

The last test function also exercises a second admission against an exhausted one-use approval, so execution cannot be inferred from policy ALLOW alone.

## Important remaining P2 gates

- Execute the PGlite suite and then a **true multi-connection PostgreSQL race test** once CI/runners are available. PGlite's single embedded connection is not sufficient evidence for a real two-worker race.
- Consider database-role/trigger hardening so direct SQL writers cannot mutate proof rows outside the proof-store API.
- Bind policy digest to the exact Cedar policy bundle and evaluator version.
- Canonically reconcile Core Data Model + Decision Engine + Learning Engine and produce the real constitution digest.
- Move from string resource prefixes to typed resources.
- Replace verification-claim labels with resolvable attestations.
- Add final-admission recheck after existing outbound reservation and immediately before provider side effect.
- Persist signed execution receipts for `SUCCEEDED`, `FAILED`, and `UNCERTAIN` attempts.
- Add formal temporal/relational invariants and mutation/fuzz/concurrency gates.

## Design law added by P1

**Stored approval is not spendable authority. Authority exists only when the exact signed approval is freshly re-verified, unrevoked, in scope, and atomically reserved against its database-owned budget.**
