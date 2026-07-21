# TEST LOG

No tests executed yet — Phase 1 was read-only inspection only. This file will be appended
with exact command, timestamp, environment, and result for every test run starting in Phase 2.

## 2026-07-21 — cherry-pick a9aee4f (P2.2 Phase 2a) conflict resolution

Command: `node --test tests/postgres-schema.test.mjs`
Environment: local container, PGlite (@electric-sql/pglite 0.5.x), node v22.22.2
Result: 13/13 pass, 0 fail
Notes: renamed migrations/005_autonomy_cycle.sql -> migrations/008_autonomy_cycle.sql
(collided with accepted-base 005_offer_payment_state.sql/006/007); merged
postgres-schema.test.mjs conflict additively (kept both accepted-base offer/delivery
migration tests and incoming P2.2 singleton/CAS tests); migratedDb() helper now runs
001..008 in order.

## 2026-07-21 — Full ancestry reconstruction complete (all 8 P2.2 commits transplanted)

Commands:
- `git merge-base --is-ancestor a905c907de67fdacfc85ee1cd1e3660eefb1be81 HEAD` -> PASS
- `git diff --exit-code a905c907de67fdacfc85ee1cd1e3660eefb1be81 HEAD -- lite/` -> PASS (zero diff)
- lite/ tree hash both sides: caeb6a6d545d18e30a8f4b3442b2b664da1aaac4 (identical)
- `npm run check:syntax` -> PASS, all ~55 files including all of lite/, zero errors
- `npm run test:deterministic` -> 260/260 pass, 0 fail, 45.08s, node v22.22.2

This is the accepted-base regression + all 8 transplanted P2.2 commits' own tests running
together for the first time, with real conflict resolution (not a wholesale merge) on:
package.json (5x, additive script-list unions), src/store.mjs (collection registry union,
version bump 8->9), src/config.mjs (auto-merged inbound gate block), tests/postgres-schema.test.mjs
(additive test union + migratedDb() helper reordered), migrations/005_autonomy_cycle.sql renamed
to migrations/008_autonomy_cycle.sql to resolve a real numbering collision with accepted-base's
own 005_offer_payment_state.sql/006/007.

P0-01 acceptance gate (ancestry + zero lite/ diff + accepted-base regression) is now genuinely
satisfied. Known NOT yet fixed (confirmed still present in the transplanted code, unchanged from
rejected branch): P0-04 (no lease_epoch column), P0-06 (generic store.add/patch/remove for
'autonomyCycleRuns' still unguarded — confirmed via code read, and tests/autonomy-cycle-store.test.mjs
line 77 still uses generic store.patch() to fake a stale timestamp, which patch guide explicitly
prohibits). These are the next repair groups.

## 2026-07-21 — P0-06 protected generic-collection mutation guard implemented

Added PROTECTED_COLLECTIONS Set + assertGenericMutationAllowed() guard to src/store.mjs,
enforced inside JsonStore._addDirect/_upsertDirect/_patchDirect and PostgresStore's
transaction-scoped add/upsert/patch (both the entry points the outer public API and every
internal caller funnel through). Throws StoreError with code PROTECTED_COLLECTION.

Fixed two pre-existing test anti-patterns that the patch guide explicitly prohibits (tests
directly patching a cycle row to fake a timestamp instead of using real elapsed time):
- tests/autonomy-cycle-store.test.mjs "CRS: a stale lease can be reclaimed..." — now creates
  with a real (clamped-minimum) TTL and waits for real elapsed time instead of generic-patching
  leaseExpiresAt into the past.
- tests/autonomy-cycle.test.mjs "BND: total cycle runtime beyond maxCycleRuntimeMs..." — now
  creates the run for real and waits real elapsed time past the budget instead of generic-patching
  startedAt into the past.

New hostile tests added (both currently fail-closed, i.e. reject with code PROTECTED_COLLECTION):
- tests/autonomy-cycle-store.test.mjs: JSON backend, add/upsert/patch all rejected; dedicated
  create/patch/reclaim methods still work.
- tests/store.test.mjs: PostgreSQL backend (via PGlite), same coverage.

Commands run:
- `node --test tests/autonomy-cycle-store.test.mjs` -> 10/10 pass
- `node --test tests/store.test.mjs` -> 13/13 pass
- `node --test tests/autonomy-cycle.test.mjs` -> 16/16 pass
- `npm run check` (full syntax + full deterministic suite, 263 tests) -> 263/263 pass, 0 fail
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

P0-06 acceptance gate ("No public generic API can mutate protected lifecycle/account/work-item
records in either backend") is now genuinely satisfied for autonomyCycleRuns on both backends.
inboundAccounts/inboundWorkItems will be added to PROTECTED_COLLECTIONS when those tables are
introduced in the P1-09/P1-11 repair groups.
