# OMNIA V9 P1 — Persistent Proof + Atomic Authority Reservation

Status: **IMPLEMENTED ON STACKED BRANCH; P0 44/44 VERIFIED LOCALLY; P1 DATABASE VERIFICATION CURRENTLY INCOMPLETE**

P1 builds on P0. It still does not control any production side effect.

## What P1 adds

- `omnia_v9_objects`: proof-object storage for intents, approvals, evidence, authorization decisions and execution receipts.
- P1 stores only proof types with an explicitly registered digest algorithm. Future proof types cannot silently enter the trust boundary.
- Every supported object is re-canonicalized and re-hashed before persistence. A record merely naming a digest is not enough.
- Type-specific identity binding. A valid approval cannot be aliased under a different object ID; evidence, intents, decisions and receipts are likewise bound to their canonical identifiers.
- Database tenant metadata must equal the tenant carried by signed/content-bound objects.
- `omnia_v9_revocations`: revocation records that first resolve the target object and verify tenant ownership before taking effect.
- `omnia_v9_approval_usage`: database-owned use/cost counters.
- `omnia_v9_authority_reservations`: idempotent authority reservations bound to exact intent digest + approval + tenant.
- Reservation-time resolution and re-verification of the exact stored `ActionIntent`. A digest string by itself cannot spend authority.
- Reservation-time cryptographic re-verification of the stored owner approval. Persistence never equals authority.
- Reservation-time scope verification of the approval against the stored intent after the usage row is locked.
- Caller-supplied cost, blast radius and idempotency key must match the content-bound intent; P1 permits exactly one use per intent.
- Revoked action intents cannot reserve authority even when their approval remains valid.
- Atomic transaction flow: create idempotency reservation -> resolve/verify intent -> resolve/verify signed approval -> check revocations -> lock usage -> recheck scope -> consume usage -> mark `RESERVED`.
- Duplicate identical reservations do not consume authority twice.
- The same idempotency key with a different intent/approval/tenant is rejected.
- `RELEASED` reservations refund reserved use/cost once; `COMMITTED` and `UNCERTAIN` keep authority consumed.
- `persistAndReserveAdmission()`: persists P0 proof objects, evaluates policy/evidence/approval, then performs database-owned authority reservation. `executable=true` requires both policy `ALLOW` and successful exact-intent authority reservation.
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

There are **20 materially distinct PGlite integration tests** on the branch covering:

1. migration creates all four V9 proof/authority tables;
2. proof-object content is re-hashed and immutable by identity;
3. object identity binding prevents signed-object aliasing;
4. database tenant metadata cannot disagree with content tenant;
5. unsupported future proof types cannot bypass an undefined digest algorithm;
6. content-valid but cryptographically forged approvals cannot spend authority;
7. an arbitrary/unstored intent digest cannot spend authority;
8. reservation independently rechecks approval scope against the stored intent;
9. caller cost, blast radius and idempotency key must match the stored intent;
10. one intent cannot be reinterpreted as multiple use-deltas;
11. one reservation consumes use/cost once;
12. duplicate idempotent reservation does not double-consume;
13. the same idempotency key cannot bind a different intent;
14. `maxUses` enforcement;
15. cumulative cost enforcement;
16. expired approval cannot spend persistent authority;
17. revocation resolves target tenant and blocks future approval reservation;
18. a revoked action intent cannot reserve authority;
19. revocation cannot target a nonexistent object;
20. release refunds exactly once while commit retains usage, plus the end-to-end persistent-admission path requires successful reservation before `executable=true`.

The end-to-end test also exercises a second admission against an exhausted one-use approval, so execution cannot be inferred from policy ALLOW alone.

## Red-team weaknesses already repaired in P1

1. Persistence originally risked treating stored approval limits as authority; reservation now cryptographically re-verifies the exact signed approval every time.
2. A signed object could have been aliased under a different database ID; type-specific identity binding rejects that.
3. Persistence originally checked a declared digest without recomputing it from stored content; supported objects are now re-hashed before insertion.
4. Revocation originally accepted arbitrary target/tenant metadata; it now resolves the target and tenant.
5. Future proof-object classes without a registered digest algorithm are rejected.
6. Reservation originally accepted an arbitrary intent digest and trusted prior in-memory scope evaluation; it now resolves the exact stored intent, verifies it, checks intent revocation, and re-runs approval scope inside the transaction against locked usage.
7. Caller-supplied reservation cost/blast/idempotency could diverge from intent content; P1 now rejects divergence.

## Important remaining P2 gates

- Execute the PGlite suite and then a **true multi-connection PostgreSQL race test** once CI/runners are available. PGlite's single embedded connection is not sufficient evidence for a real two-worker race.
- Consider database-role/trigger hardening so direct SQL writers cannot mutate proof rows outside the proof-store API.
- Turn revocation itself into a resolved, authorized proof object. P1 currently treats a caller who can invoke `revoke()` as authorized to deny future work; this is fail-safe for integrity but still an availability/authority boundary.
- Bind policy digest to the exact Cedar policy bundle/evaluator.
- Canonically reconcile Core Data Model + Decision Engine + Learning Engine and produce the real constitution digest.
- Move from string resource prefixes to typed resources.
- Replace verification-claim labels with resolvable attestations.
- Add final-admission recheck after existing outbound reservation and immediately before provider side effect.
- Persist signed execution receipts for `SUCCEEDED`, `FAILED`, and `UNCERTAIN` attempts.
- Add formal temporal/relational invariants and mutation/fuzz/concurrency gates.

## Design law added by P1

**A digest is not authority. Stored approval is not spendable authority. Authority exists only when the exact stored intent and exact signed approval are freshly re-verified, unrevoked, in scope, and atomically reserved against database-owned usage.**
