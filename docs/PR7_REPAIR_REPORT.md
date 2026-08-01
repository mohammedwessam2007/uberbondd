# PR #7 Repair Report

Repair pack: `UBERBOND_CLAUDE_PR7_REPAIR_PACK_V1` (independent verdict: `REPAIR_REQUIRED`, PR #7
head at the time of review: `1fc7e731d0323ab2ba5b48367be0cc1907a2d4dd`). This report gives every
finding in `01_FINDINGS.json` / `02_ACCEPTANCE_MATRIX.md` an explicit fix and test reference.

All eight findings were real, correctly identified defects in this branch's first version — not
false positives. Two things are worth naming plainly, because the review earned them:

1. **C-P0-003 (frozen cohort)** was not a minor gap — the original `campaign-activation.mjs`
   computed one content hash over the *entire* approved recipient set and required an exact match
   on every eligibility check, while send-planning evaluates candidates one recipient at a time.
   A hash over N recipients can never equal a hash over 1, so **every cohort with more than one
   member was structurally unable to ever pass**. This went undetected because the original test
   suite only ever exercised single-member cohorts.
2. **C-P0-002 (stage ordering)** was also real: `scheduleCanonCycle` enqueued all seven stage jobs
   up front with only same-day dedupe keys, and `DurableQueue.runOnce` can claim/execute several
   jobs per tick at concurrency > 1 — nothing in the original design prevented a later stage from
   running before an earlier one.

## C-P0-001 · Canon cycle not wired into the real runtime — FIXED

**Finding:** `worker.mjs` only imported `createJobHandlers` with the pre-Canon dependencies;
`src/scheduler.mjs` scheduled only pre-Canon job types.

**Fix:**
- `src/job-handlers.mjs#createJobHandlers` now accepts optional `queue`/`cfg`/`canonAdapters`/
  `canonProvider` and, when `queue` is supplied, merges in `createCanonCycleHandlers(...)` — the
  Canon job types are registered unconditionally, so a manual `queue.enqueue('canon.cycle.opportunity_hunt', ...)`
  always works.
- `worker.mjs` now passes `queue`/`cfg` to `createJobHandlers`.
- `src/scheduler.mjs` gained a SEPARATE, explicit `cfg.acquisition.workersActive` gate (default
  `false`, distinct from `cfg.autopilot`) that calls `scheduleCanonCycle` once a day only when
  true. Registration and scheduling are deliberately decoupled: the handlers exist and work the
  moment the worker starts, whether or not any cycle is ever automatically scheduled.
- No live provider is required at startup (`canonProvider` defaults to `null`); `OUTBOUND_ENABLED`
  and `ACQUISITION_WORKERS_ACTIVE` both still default to `false`.

**Acceptance (C-P0-001):** *"A worker created from `worker.mjs` recognizes Canon job types while
scheduling remains default-off."* Verified by code inspection of `worker.mjs`/`job-handlers.mjs`/
`scheduler.mjs` (all three files changed as described above) plus every existing
`autonomous-cycle.test.mjs`/`canon-seven-day-simulation.test.mjs` test, which exercises
`createCanonCycleHandlers` exactly as `job-handlers.mjs` now does.

## C-P0-002 · No durable dependency ordering between the seven stage jobs — FIXED

**Finding:** `scheduleCanonCycle` enqueued seven independent jobs at the same run time;
`DurableQueue.runOnce` can claim and execute several concurrently.

**Fix:** `src/autonomous-cycle.mjs` now enqueues only `STAGE_ORDER[0]` (`scheduleCanonCycle`). Every
stage handler (`createCanonCycleHandlers`'s per-type wrapper) enqueues `nextStageOf(type)` itself,
with the same `cycleRunId`/`day`/injected `now`, using a stable `singletonKey`/`dedupeKey`
(`canon:cycle:${day}:${nextStage}`) — ONLY after its own work completes successfully. At any
instant, at most one Canon stage job for a given day can exist in the queue. A crash mid-stage is
resumed by `DurableQueue`'s existing lease/heartbeat/`recoverStaleJobs` machinery (unmodified); once
the recovered job completes, the chain continues — the next-stage enqueue's stable key means a
duplicate enqueue attempt after a partial crash just returns the one existing job, never a second
one.

**Acceptance (C-P0-002):** *"With queue concurrency ≥3, downstream stages never run before
predecessors."*
- `tests/autonomous-cycle.test.mjs` → *"C-P0-002 acceptance: with queue concurrency >= 3, downstream
  stages never exist as jobs before their predecessor completes"* — drives the real queue at
  concurrency 3 and asserts, on every stage's start, that no later stage has already completed.
- `tests/autonomous-cycle.test.mjs` → *"P0-001/C-P0-002 acceptance: a worker killed mid-stage is
  recovered and the chain resumes and continues exactly once"* — proves a crash mid-`opportunity_hunt`
  resumes and enqueues `prospect_discovery` exactly once (not zero, not twice).
- `tests/canon-seven-day-simulation.test.mjs` → runs all seven stages, seven times, through the
  real queue at concurrency 3, including one genuine stale-job recovery mid-run (day 3's
  `attribution` job), and asserts the full per-day event ordering holds throughout.

## C-P0-003 · Exact 100-recipient approval could never match per-recipient checks — FIXED

**Finding:** the original content hash over the full recipient set could not match a per-recipient
eligibility check.

**Fix:** migration `009_canon_cohort_repair.sql` adds `campaign_cohort_members` — exactly N
individually-claimable rows created once, at approval time (`campaign-activation.mjs#buildCampaignActivationApproval`
now takes `members: [{organizationDomain, recipientEmail}, ...]` instead of a flat
`recipientEmails` list). `store.mjs#claimCohortMember` atomically claims one member
(`pending` → a caller-chosen status, e.g. `reserved`) via a single conditional `UPDATE ... WHERE
status='pending'` on Postgres (no advisory lock needed — the `WHERE` clause plus Postgres's own
row-level locking makes it race-safe) or an equivalent guarded mutation on `JsonStore`.
`campaign-activation.mjs#assertCampaignActivation` now checks (a) the master gate, (b) an active,
unexpired, policy/sender-matching approval exists for the experiment, (c) a member row exists for
this exact `(organizationDomain, recipientEmail)` under one of those approvals, and (d) that
member's status matches what the caller expects (`'pending'` when send-planning is about to claim
a fresh seat; `'touched'` when dispatch is rechecking an already-claimed one — see C-P0-004).
`claimCohortSeat`/`releaseCohortSeat`/`markCohortSeatTouched` provide the claim/release/complete
lifecycle `autonomous-cycle.mjs#runSendPlanning` now drives.

**Acceptance (C-P0-003):** *"One approval for a frozen 100-company cohort authorizes only its
members and at most 100 first touches."*
- `tests/campaign-activation.test.mjs` → *"C-P0-003 acceptance: one N-member approval authorizes
  EACH of its members individually (not just a single-member cohort)"* (5 members, all pass
  independently — the exact scenario the original hash design could never satisfy).
- `tests/campaign-activation.test.mjs` → *"C-P0-003 acceptance: one 100-company approval authorizes
  exactly 100 first touches, no more"* — claims all 100 seats, then proves a 101st (non-member)
  organization is rejected.
- `tests/campaign-activation.test.mjs` → *"P0-004 acceptance (real Postgres): ten concurrent
  workers race for one cohort seat and exactly one claim succeeds"* — genuine concurrent
  `Promise.all` against a real PGlite-backed `PostgresStore`, not JsonStore's serialized queue.
- `tests/postgres-schema.test.mjs` → two new tests confirming migration 009 creates the table and
  its unique constraints (one organization / one recipient per approval) against real Postgres.

## C-P0-004 · No immediate pre-dispatch safety recheck — FIXED

**Finding:** dispatch did not re-evaluate suppression, terminal replies, activation expiry,
evidence freshness, sender health, business hours, or circuit breakers immediately before provider
invocation.

**Fix:** `autonomous-cycle.mjs#runDispatch` now, for every `'reserved'` Canon reservation,
immediately before calling `dispatchReservation` (and therefore before any live/simulated provider
could be invoked): (1) explicitly checks the global outbound pause; (2) re-runs the exact same
`resolveCanonSendCandidate` eligibility function send-planning used — suppression, terminal
prospect status, approval/cohort expiry and membership, sender health, source-evidence freshness,
message-variant/experiment state — with `expectedMemberStatus: 'touched'` (the seat is already
consumed by this point, so the recheck confirms it is *still* intact, not freshly claimable). Any
now-ineligible reservation is marked `'cancelled'` with its reasons and a
`canon_dispatch_cancelled_pre_send_recheck` audit event; `dispatchReservation` — the only place a
provider is ever called — is skipped entirely.

Business-hours enforcement and per-source-family circuit breakers remain deferred (P1-007/P1-006
in `docs/PREMERGE_AUDIT_DISPOSITION.md`) for the same disclosed reason as before (no verified
per-recipient geography data from the disabled adapters in this sandbox); the recheck covers every
OTHER item the finding named.

**Acceptance (C-P0-004):** *"Suppression or approval expiry inserted after reservation blocks
dispatch and the provider spy is never called."*
- `tests/autonomous-cycle.test.mjs` → *"C-P0-004 acceptance: suppression inserted after reservation
  but before dispatch blocks dispatch; provider spy never called"*.
- `tests/autonomous-cycle.test.mjs` → *"C-P0-004 acceptance: an expired campaign activation
  approval discovered at dispatch time blocks dispatch"*.
- `tests/autonomous-cycle.test.mjs` → *"a global outbound pause blocks dispatch immediately
  regardless of an otherwise-eligible reservation"*.
- `tests/canon-seven-day-simulation.test.mjs` → the same suppression race, driven through the real
  `DurableQueue` (not a direct function call), asserting the cancellation is durably audited.

## C-P0-005 · Reservation/provider payload lacked canonical message identity — FIXED

**Finding:** reservations didn't carry `messageVariantId`, content hash, or approved subject/body;
`provider.send()` received a bare email reservation.

**Fix:** `autonomous-cycle.mjs#runSendPlanning`, immediately after a successful
`store.reserveOutboundSend`, patches the reservation with `messageVariantId`, `contentHash`
(the message variant's own `bodyHash`), `subject`, `body`, `opportunityId`, `sourceEvidenceId`,
`experimentId`, `lane`, `organizationDomain`, `cohortApprovalId`, `policyVersion`, and `prospectId`
(when known) — all via the store's existing generic `data` jsonb column (no migration needed;
every collection already has one). `dispatch-adapter.mjs#dispatchReservation`'s `provider.send(reservation)`
call is unchanged, but `reservation` is now the full patched record, so a real provider receives the
exact approved canonical payload. No message variant is ever auto-approved by this integration —
`status: 'approved'` remains a manual/human gate (P1-012 in the premerge disposition), so "no
automatic message approval until claim validation exists" already held before this repair and still
holds.

**Acceptance (C-P0-005):** *"Provider spy receives the exact approved message and immutable content
hash."* `tests/autonomous-cycle.test.mjs` → *"runSendPlanning persists the full canonical message +
attribution identity on the reservation (C-P0-005/006)"* asserts every one of the fields above is
present and matches the source message variant.

## C-P0-006 · Reservations/events lacked prospect and attribution links — FIXED

**Finding:** no way to reconstruct source → evidence → opportunity → lane → prospect → variant →
sender → reservation → event → reply → proposal → payment.

**Fix:** the same reservation patch from C-P0-005 carries every id needed for attribution. New
`src/attribution-chain.mjs#reconstructAttributionChain(store, reservationId)` walks the reservation
to its opportunity, source evidence, experiment, message variant, cohort member (proving
first-touch identity), outbound events, and (when a prospect is linked) replies/orders/subscriptions
— returning `complete: true` only when every required link (`opportunityId`, `sourceEvidenceId`,
`experimentId`, `lane`, `messageVariantId`, `cohortApprovalId`, `sender`, `recipient`) is present.
`autonomous-cycle.mjs#runAttribution`'s snapshot now also reports `attributionComplete` (true only
if every Canon reservation this run created has every link), replacing the count-only proof.

**Acceptance (C-P0-006):** *"Every reservation/event has complete non-null attribution IDs and the
chain is reconstructable."*
- `tests/autonomous-cycle.test.mjs` → *"C-P0-006 acceptance: the attribution chain is fully
  reconstructable from one reservation"*.
- `tests/canon-seven-day-simulation.test.mjs` → *"attribution IDs are complete and the chain is
  reconstructable for the winner reservation"*.

## C-P1-001 · Seven-day acceptance bypassed the real queue and scheduler — FIXED

**Finding:** the original seven-day test called each stage function directly, in order.

**Fix:** `tests/canon-seven-day-simulation.test.mjs` is rewritten to drive `createCanonCycleHandlers`
through a real `DurableQueue` at `concurrency: 3`, for seven simulated days, including one genuine
stale-job recovery mid-run (day 3), asserting: seven distinct simulated checkpoint dates; exactly
one reply sweep per 24h; no downstream stage ran early (full per-day ordering assertion); zero
duplicate reservations; zero real `sent` events; the dispatch-time suppression cancellation
(driven through the real queue, not a direct call); complete attribution IDs; every job reaching a
terminal state (no orphan queue state); research seeds never touching the live store; the global
kill switch. The dedicated 100-member cohort proof intentionally lives in
`tests/campaign-activation.test.mjs` (including the real-Postgres concurrency race) rather than
being duplicated inside the seven-day run — see that file's C-P0-003 tests.

**Acceptance (C-P1-001):** *"Seven-day acceptance uses DurableQueue and real runtime handlers."*
Satisfied as described above; see `tests/canon-seven-day-simulation.test.mjs` in full.

## C-P1-002 · Checkpoint/approval timestamps used wall clock instead of injected time — FIXED

**Finding:** simulated dates weren't actually threaded through.

**Fix:** every stage function (`runOpportunityHunt`, `runProspectDiscovery`, `runSendPlanning`,
`runDispatch`, `runReplySweep`, `runCheckpoint`) now takes an explicit `at` parameter, and
`createCanonCycleHandlers`'s per-stage wrapper derives it from `new Date(payload.now)` — the
injected clock carried in the job payload from `scheduleCanonCycle` through every chained
next-stage enqueue — rather than any function calling `new Date()` itself. (This also surfaced and
fixed an unrelated one-line bug in `commercial-intelligence-import.mjs` during the original
integration pass — see `docs/PREMERGE_AUDIT_DISPOSITION.md`'s "Bonus defect" section — where a
`date`/`at` parameter-name mismatch silently ignored an injected timestamp; that fix is what makes
this deterministic clock threading actually take effect end to end.)

**Acceptance (C-P1-002):** *"All simulated timestamps use the injected clock."*
`tests/canon-seven-day-simulation.test.mjs` → *"seven distinct simulated checkpoint dates were
recorded"* asserts the exact seven calendar dates (`2026-08-01` through `2026-08-07`) appear in
`canon_cycle_checkpoint` audit events, with no real wall-clock waiting between them (the whole test
runs in a few seconds of real time).

## Test evidence

```
npm run check          # syntax + full deterministic suite: 317/317 pass, 0 regressions
npm run test:browser    # pre-existing, disclosed Playwright-binary limitation (unrelated to this diff)
git diff --exit-code 27cd700e7d27287382c9f5e1811ae704f4f1535e..HEAD -- lite/   # empty
```

## Changed-file manifest (this repair commit)

- **New migration:** `migrations/009_canon_cohort_repair.sql` (`campaign_cohort_members`).
- **New source:** `src/attribution-chain.mjs`.
- **Rewritten source:** `src/autonomous-cycle.mjs` (chained stage ordering, pre-dispatch recheck,
  canonical message/attribution persistence, injected clock), `src/campaign-activation.mjs`
  (per-member cohort model).
- **Modified source:** `src/store.mjs` (`campaignCohortMembers` collection +
  `claimCohortMember` on both backends), `src/send-eligibility.mjs` (`organizationDomain`/
  `expectedMemberStatus` plumbing for the new cohort model and the pre-dispatch recheck),
  `src/job-handlers.mjs` (registers Canon handlers), `src/scheduler.mjs` (default-off Canon
  scheduling gate), `worker.mjs` (passes `queue`/`cfg` through).
- **Rewritten tests:** `tests/campaign-activation.test.mjs`, `tests/send-eligibility.test.mjs`,
  `tests/autonomous-cycle.test.mjs`, `tests/canon-seven-day-simulation.test.mjs`.
- **Modified tests:** `tests/postgres-schema.test.mjs` (migrations 008/009 now actually included in
  `migratedDb()` — they were landed in the original pass but never added to this file's migration
  list, so they had never actually been validated against real Postgres until this repair).
- **`lite/`: zero diff** (unchanged from the original pass).

## Zero-send proof

Every dispatch outcome in every test is `blocked`, `simulated_sent`, or `cancelled` — no test, and
no code path in this repair, ever produces a real `sent` outbound event. The C-P0-004 pre-dispatch
recheck adds a fourth outcome (`cancelled`) precisely so an ineligible reservation is stopped before
`dispatchReservation` — the only function that can reach a provider — is ever called.

## Rollback instructions

Purely additive on top of the original PR #7 delivery: one new migration, a rewritten
(but not architecturally new) orchestration module, and small plumbing changes.

1. Revert this repair commit (`git revert`) to return to the pre-repair state — not recommended,
   since that state has the C-P0-003/C-P0-002 defects described above.
2. If migration `009_canon_cohort_repair.sql` was already applied to a live database and needs
   reverting: `DROP TABLE IF EXISTS campaign_cohort_members;` (remove its row from
   `schema_migrations` if you want `db:migrate` to re-run it later).
3. No `ACQUISITION_*` environment variable needs to change — every one already defaults to off/zero,
   unchanged by this repair.

Do not merge or deploy this PR. Stop after this commit — no further monitoring per the repair
mission's instructions.
