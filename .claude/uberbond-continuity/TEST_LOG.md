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

## 2026-07-21 — P0-04/P0-03/P0-05/P1-13 implemented (lease epoch, real cancellation, terminal timeout, remaining-budget stage limits)

P0-04 (lease epoch + heartbeat): added migrations/009_autonomy_cycle_lease_epoch.sql
(lease_epoch, attempt_started_at, deadline_at, terminal_reason columns). Both backends now
increment leaseEpoch on create (epoch=1) and on every reclaim; patchAutonomyCycleRun now takes
a full fence object {owner, epoch, version} instead of a bare version number, checked in the
same WHERE clause as the UPDATE (Postgres) / same guarded read in JSON, requiring status='active'
AND lease_owner=? AND lease_epoch=? AND version=? AND lease_expires_at>now(). Added a dedicated
heartbeatAutonomyCycleRun method with the identical fence check, fenced independently of stage
progress.

P0-03 (real cancellation): withStageTimeout() now creates a real linked AbortController per stage
(child of the whole-cycle controller), passes signal into stage handlers, which thread it into
mailboxReader.listMessages/getMessage and gmail-inbound.mjs's fetch() calls. A heartbeat loop
(startHeartbeat) runs on its own interval (default leaseTtlMs/4) independent of stage progress;
a rejected heartbeat aborts the cycle controller immediately. Late-resolving stage work can never
commit because every write after a stage settles is fenced by the CURRENT owner+epoch+version,
which a lease-losing worker can never present again.

P0-05 (terminal timeout): total-cycle timeout is now terminal, not a resumable pause. On timeout:
fenced-finalize as status='aborted', terminalReason='cycle-timeout', clear leaseOwner/leaseExpiresAt.
A terminated run can never be patched or reclaimed again (proven by hostile test); a genuinely new
run (fresh runKey) is required and gets a new run id. This intentionally reverses the rejected
branch's own pre-existing test/comment ("a cycle-timeout must not finalize the run -- it stays
retryable"), which was exactly what the repair spec's P0-05 finding requires fixing.

P1-13 (remaining-budget stage timeouts): deadlineAt is computed once at run creation (persisted,
survives reclaim by a different worker) and never reset. Before every stage: remainingMs =
deadlineAt - now(); if <=0, terminal-timeout path immediately without starting the stage.
effectiveStageMs = min(maxStageRuntimeMs, remainingMs), passed to the per-stage AbortController.

Known accepted limitation (documented, not hidden): heartbeat and stage-effect-commit share a
single version counter and are not serialized against each other, so a heartbeat tick landing
between a stage's fence-read and its patch call can cause a spurious (safe) version-conflict
rejection rather than a real race condition. This never allows an unsafe commit -- worst case is
an extra retry on the next invocation -- but is not a fully race-free design. A dedicated
serialized fence broker would remove this; out of scope for this repair pass.

Commands run:
- `node --test tests/autonomy-cycle-store.test.mjs` -> 11/11 pass (incl. new EPOCH hostile test:
  old owner's fence with correct version but stale epoch is permanently rejected after reclaim)
- `node --test tests/autonomy-cycle.test.mjs` -> 16/16 pass (incl. rewritten P0-05 test proving
  terminal status='aborted', terminalReason, cleared lease, un-reclaimable, un-patchable, and that
  a fresh runKey can proceed with a genuinely new run id)
- `npm run test:deterministic` -> 264/264 pass, 0 fail
- `node --test tests/p2-2-postgres-race.test.mjs` -> **5/5 pass, REAL isolated PostgreSQL** via
  embedded-postgres (a genuine disposable local server, two separately-pooled connections racing
  exactly as two separate worker processes would) -- includes a real SIGKILL mid-stage crash test.
  This resolves the "isolated PostgreSQL test database... may block acceptance" stop condition:
  the environment IS available here and the race/CAS/reclaim/crash-recovery evidence is genuine,
  not simulated with PGlite.
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff
