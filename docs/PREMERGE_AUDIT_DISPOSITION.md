# Premerge Audit Disposition — Canon/V3 Integration

Source audit: `UBERBOND_CLAUDE_PREMERGE_AUDIT_V1/PREMERGE_AUDIT.md` (target base: PR #6 head
`27cd700e7d27287382c9f5e1811ae704f4f1535e`). Every P0 finding below was treated as a merge blocker
and fixed before anything else in this branch. Every P1/P2 finding has an explicit disposition —
fixed, deferred with a fail-closed blocker, or (none were) rejected — per
`CLAUDE_AUDIT_ADDENDUM.md`'s instructions.

> **PR #7 repair pass:** an independent review of this branch's first version
> (`UBERBOND_CLAUDE_PR7_REPAIR_PACK_V1`) found that several of the mechanisms described below did
> not actually hold up once exercised harder (multi-member cohorts, real queue concurrency, a
> pre-dispatch recheck, canonical message persistence). Every one of those gaps has since been
> fixed — see `docs/PR7_REPAIR_REPORT.md` for the full finding-by-finding account. The P0-001,
> P0-003, P0-004, P0-005, and P0-006 entries below have been updated in place to describe the
> REPAIRED mechanism and its current test coverage; the repair report has the before/after detail.

## P0 — merge blockers (all fixed)

### P0-001 · durability — FIXED (repaired)
V3's `runRevenueCycle` threaded one in-memory `state` object between stages by hand. Rewritten as
staged durable jobs on the existing `DurableQueue` (`src/queue.mjs`, unmodified): each stage is a
job type (`src/autonomous-cycle.mjs`, `CANON_JOB_TYPES`). **Repair note:** the first version
enqueued all seven stage jobs up front with only same-day dedupe keys, which an independent review
correctly found did not actually prevent a concurrency-≥2 worker from running a downstream stage
before its predecessor. `scheduleCanonCycle` now enqueues ONLY the first stage; every stage handler
enqueues the next stage itself, with the same `cycleRunId`, only after its own work completes
successfully — at any instant at most one Canon stage job for a given day can exist at all. See
`docs/PR7_REPAIR_REPORT.md` (C-P0-002) for the full account.
**Tests:** `tests/autonomous-cycle.test.mjs` → *"C-P0-002 acceptance: with queue concurrency >= 3,
downstream stages never exist as jobs before their predecessor completes"* and *"P0-001/C-P0-002
acceptance: a worker killed mid-stage is recovered and the chain resumes and continues exactly
once"*; `tests/canon-seven-day-simulation.test.mjs` (real-queue, seven-day, includes one in-run
stale-job recovery).

### P0-002 · dispatch — FIXED
`src/dispatch-adapter.mjs#dispatchReservation`. Outside `simulation: true`, a missing `provider`
produces a `blocked` reservation + `canon_dispatch_blocked_no_live_provider` audit event — never a
`sent` outbound event. Simulation writes a distinctly-named `simulated_sent` event/status, never
reusing `sent`.
**Test:** `tests/dispatch-adapter.test.mjs` → *"P0-002 acceptance: no provider + simulation false
produces zero sent reservations and a canonical blocker"*, plus the reserved-domain and
throwing-provider cases in the same file.

### P0-003 · eligibility — FIXED
`src/send-eligibility.mjs#evaluateCanonSendEligibility` derives eligibility fresh from the
canonical opportunity stage, latest `policyDecision`, `sourceEvidence` freshness, contact-route
typing, suppressions, message-variant/experiment/campaign-activation state, and sender health —
it never reads a `prospect.status`/`sendEligible` boolean at all.
**Test:** `tests/send-eligibility.test.mjs` → *"P0-003 acceptance: a policy-rejected opportunity
cannot reserve even with prospect.sendEligible=true / status=ready_for_message"*.

### P0-004 · reservations — FIXED
Canon send planning (`autonomous-cycle.mjs#runSendPlanning`) calls the existing, already-audited
`store.reserveOutboundSend` (idempotency-key uniqueness enforced by both `JsonStore` and
`PostgresStore`, the latter under `pg_advisory_xact_lock` + a real unique index) — no new
in-memory Set or second reservation path was introduced anywhere.
**Test:** `tests/dispatch-adapter.test.mjs` → *"P0-004 acceptance: ten concurrent workers race for
one recipient and exactly one reservation succeeds"* (JsonStore backend). The Postgres backend's
`reserveOutboundSend` is pre-existing PR #6 code, already covered by
`tests/commercial-intelligence-concurrency.test.mjs`'s real-Postgres concurrency tests; not
re-tested here since this change reuses it unmodified.

### P0-005 · suppression — FIXED (repair adds a pre-dispatch recheck)
`evaluateCanonSendEligibility` checks canonical `suppressions` (recipient email + organization
domain) before a reservation can be considered eligible, and rejects any `prospect.status` in the
terminal set (`lost`, `rejected`, `opted-out`, `complaint`, `hard-bounce`, `wrong-recipient`).
**Repair note:** the first version only checked this at reservation time, at send-planning — an
independent review correctly pointed out that a suppression (or an approval expiring) arriving
*after* the reservation but *before* dispatch would not have been caught.
`autonomous-cycle.mjs#runDispatch` now re-runs this exact same check, transactionally, immediately
before invoking any provider; a newly-ineligible reservation is cancelled and the provider is never
called. See `docs/PR7_REPAIR_REPORT.md` (C-P0-004).
**Tests:** `tests/send-eligibility.test.mjs` → *"P0-005 acceptance: a suppressed recipient blocks
reservation"* and *"a terminal prospect status blocks reservation"*; `tests/autonomous-cycle.test.mjs`
→ *"C-P0-004 acceptance: suppression inserted after reservation but before dispatch blocks
dispatch; provider spy never called"* and *"...an expired campaign activation approval discovered
at dispatch time blocks dispatch"*; `tests/canon-seven-day-simulation.test.mjs` (same race, driven
through the real queue).

### P0-006 · live activation — FIXED (repaired: real per-member cohort model)
`src/campaign-activation.mjs#assertCampaignActivation` requires **both** the global
`ACQUISITION_WORKERS_ACTIVE` gate (`cfg.acquisition.workersActive`) **and** a matching, unexpired
`campaignActivationApprovals` row naming the exact experiment, sender set, and policy version.
Neither alone is sufficient. **Repair note:** the first version additionally required an exact
content hash of the FULL recipient set to match on every check — but per-recipient send-planning
evaluates one recipient at a time, so a hash over N recipients could never match a hash over 1,
meaning every batch with more than one member was structurally unable to pass (the first version's
tests only ever exercised a single-member cohort, which is why this was not caught before
delivery). Migration `009_canon_cohort_repair.sql` adds `campaign_cohort_members` — exactly N
individually-claimable member rows created once, at approval time. `store.mjs#claimCohortMember`
atomically claims one (pending → reserved, an atomic conditional UPDATE on Postgres, no advisory
lock needed) — "one 100-company approval authorizes only those 100 members" is now a structural
fact, not a hash comparison. See `docs/PR7_REPAIR_REPORT.md` (C-P0-003).
**Tests:** `tests/campaign-activation.test.mjs` — global/batch-only/expired/matching combinations,
*"C-P0-003 acceptance: one N-member approval authorizes EACH of its members individually"*, *"...one
100-company approval authorizes exactly 100 first touches, no more"*, and a **real-Postgres**
10-concurrent-claim race (*"P0-004 acceptance (real Postgres): ten concurrent workers race for one
cohort seat and exactly one claim succeeds"*).

## P1 findings

### P1-001 · contact routes — FIXED
`src/contact-routes.mjs` models a typed contact route (`email | form | marketplace |
partner_application | vendor_portal | rfp | phone`). Only `type: 'email'` can ever pass
`isEmailSendable`; every other type can still be research-validated and queued for a
human/owner-driven channel.
**Test:** `tests/prospect-supply.test.mjs` → *"P1-001 acceptance: an official partner-form route
can be research-validated but is never email-sendable"*.

### P1-002 · identity — FIXED (by reuse)
Every new module (`reserved-domains.mjs`, `prospect-supply.mjs`, `send-eligibility.mjs`) imports
`normalizeDomain` from the existing `src/utils.mjs` — no local reimplementation was written.

### P1-003 · evidence — FIXED (by reuse)
Canon opportunities are imported through the existing, unmodified
`commercial-intelligence-import.mjs` pipeline (`opportunity-hunter.mjs#buildCommercialIntelligenceRecord`
→ `validateCommercialIntelligenceRecord` → `importCommercialIntelligenceBatch`) into the same
`opportunities`/`sourceEvidence`/`policyDecisions` tables PR #6 already owns. No parallel table.
**Test:** `tests/opportunity-hunter.test.mjs` (schema-validation round-trip),
`tests/autonomous-cycle.test.mjs` (queryable end-to-end).

### P1-004 · evidence independence — FIXED
`src/evidence-independence.mjs#assessEvidenceIndependence` requires N distinct `sourceFamily`
identities (migration 008 adds `source_evidence.source_family`/`claim_origin`), not a raw count.
**Test:** `tests/opportunity-hunter.test.mjs` → *"assessActivation requires 3 independent evidence
families and 1 live buyer signal"*.

### P1-005 · freshness — DEFERRED (fail-closed blocker in place)
`isEvidenceFresh` (capturedAt/expiresAt age check, pre-existing) still gates every Canon
opportunity. Migration 008 adds `last_verified_at`/`pre_send_verified_at` columns so a same-day
pre-send recheck has somewhere durable to live, but this pass does not implement the recheck
itself (it would require calling back out to a live source, and every opportunity-hunter adapter
is disabled in this sandbox — see Known Limitations). **Fail-closed blocker:** nothing reads
`pre_send_verified_at` as a *substitute* freshness signal, so its absence cannot loosen the
existing age/expiry gate; the schema is ready for whichever adapter implementation lands next.

### P1-006 · health — DEFERRED (fail-closed blocker in place)
Per-inbox `senderHealth` circuit breaking (pause on hard-bounce/complaint/failure-streak
thresholds) is pre-existing and reused unmodified by `dispatch-adapter.mjs`. A dedicated
per-source-family circuit breaker was **not** built in this pass. **Fail-closed blocker:**
`ACQUISITION_WORKERS_ACTIVE` + the exact per-batch `campaignActivationApprovals` row
(P0-006) already bound every batch's blast radius before this gap can matter, and the existing
per-inbox breaker still applies to every Canon dispatch.

### P1-007 · business hours — DEFERRED (fail-closed blocker in place)
`send-safety.mjs#resolveRecipientTimeZone`/`localBusinessTime` already exist and are reused
unmodified by the **pre-Canon** single-prospect pipeline. They are **not** yet wired into
`send-eligibility.mjs` for Canon opportunities, because Canon signals (from disabled adapters)
carry only a free-text `geography` string, not a verified country/timezone — fabricating one would
be worse than disclosing the gap. **Fail-closed blocker:** `ACQUISITION_WORKERS_ACTIVE` defaults
false and `targetDailySends` defaults `0`, so no Canon send can reach dispatch by default regardless
of this gap; a real deployment must supply real geography data through a real adapter before this
can be closed correctly.

### P1-008 · company frequency — FIXED (stricter than required), lane policy DEFERRED
The existing `prospects.domain` UNIQUE constraint (enforced identically by `JsonStore` and
`PostgresStore`) gives one row per company, stricter than V3's "2 contacts per 30 days." Explicit
multi-lane/signal/active-conversation policy (permitting >1 concurrent lane per company under
policy control) was not built — the current behavior is more conservative, not less, so this is a
feature gap, not a safety gap.
**Test:** `tests/prospect-supply.test.mjs` → *"replenishProspectQueue uses the durable
prospects.domain unique constraint as the authoritative dedup guard"*.

### P1-009 · reply processing — FIXED
`src/reply-classifier.mjs#classifyCanonReply` is the one canonical classifier (wraps
`classifyDeliverySignal` + `ai.mjs#classifyReply`, adds `wrong_recipient` detection). Every class
except `automatic` cancels outstanding follow-ups (`cancelsFollowups`), applied to the same
`prospects`/`replies` collections the pre-Canon pipeline already writes to.
**Test:** `tests/reply-classifier.test.mjs` → *"P1-009 acceptance: every canonical class produces
the expected cancellation outcome"*.

### P1-010 · cost ceilings — FIXED
`store.mjs#reserveCostBudget` (new, modeled on the pre-existing `reserveDiscoveryCapacity` pattern)
atomically reserves budget against a durable per-`(date, category)` ledger row
(`cost_ledger_entries`, migration 008) — concurrent or restarted callers cannot double-spend past
the ceiling. Wired into `runSendPlanning`'s infra-cost check. **Model-cost metering specifically is
N/A in this pass**: no LLM extraction call is actually made anywhere in this integration (every
opportunity-hunter adapter is disabled), so there is nothing to meter yet; the ledger call a real
LLM-extraction adapter must make before spending is documented in `CLAUDE.md`.
**Test:** `tests/cost-ledger.test.mjs` → *"P1-010 acceptance: concurrent reservations cannot exceed
the daily budget"*.

### P1-011 · experiment samples — DEFERRED (fail-closed blocker in place)
A dedicated "frozen 100-unique-organization cohort" object and separate first-touch/follow-up
touch records were not built. **Fail-closed blocker:** `send-eligibility.mjs` requires
`experiment.status === 'active'` before any reservation can be made at all — an
under-specified/unvalidated experiment simply cannot be used for sending, rather than silently
accepting an unverified cohort size.

### P1-012 · message quality — DEFERRED (fail-closed blocker in place)
V3's `messageSimilarity`/`similarityViolations` (token-set based) were deliberately **not** ported
— the audit itself calls token similarity "insufficient." No evidence-fragment/claim-validation
replacement was built in this pass either. **Fail-closed blocker:**
`send-eligibility.mjs` requires `messageVariant.status === 'approved'`, and nothing in this
integration ever sets that status automatically — approval remains a manual/human gate until a
real claim-validation module exists, which is a stronger guarantee than an automated-but-flawed
similarity check would provide.

### P1-013 · reserved domains — FIXED
`src/reserved-domains.mjs#assertNotReservedOutsideSimulation` (RFC 2606 domains) is enforced in
all three places a synthetic domain could otherwise leak: `prospect-supply.mjs` (validation),
`send-eligibility.mjs` (eligibility), and `dispatch-adapter.mjs` (dispatch, defense in depth).
**Test:** covered in all three modules' test files, e.g. `tests/dispatch-adapter.test.mjs` →
*"a reserved (.example) recipient domain is blocked outside simulation even with a real provider"*.

## P2 findings

### P2-001 · cycle identity — FIXED (materially improved), exact acceptance scenario DEFERRED
V3 used one flat calendar-date key for the entire cycle (discovery + sending + replies conflated).
`scheduleCanonCycle` gives every **stage** its own independent per-day singleton/dedupe key, and
the reply sweep enforces its 24h cadence via its own durable setting
(`canonLastReplySweepAt`), independent of the other stages' keys. This pass did not, however,
implement "multiple bounded discovery runs per day while only one reply sweep occurs" specifically
— every non-reply-sweep stage in this integration is deliberately once-per-day. That narrower
acceptance scenario is deferred; it is a scheduling-cadence choice, not a durability or safety gap.

### P2-002 · portfolio optimization — FIXED
`src/portfolio-allocator.mjs#isLaneProven` requires a minimum paid-sample count, a declared
evidence window, and real collected-margin provenance before a lane is eligible for the
exploitation (non-exploration) allocation pool.
**Test:** `tests/portfolio-allocator.test.mjs` → *"P2-002 acceptance: a one-payment tiny sample
cannot absorb the portfolio"*.

### P2-003 · health threshold consistency — FIXED (already centralized by PR #6)
`revenue-os.mjs#tenOfTenReadiness`'s `complaintRate` gate already centralizes the stricter 0.1%
threshold (unmodified by this branch). This integration's new `acquisition.sourceFamily*Threshold`
config defaults are count-based (like the existing `outbound.*PauseThreshold` config), not a second
percentage-based registry, so no conflicting threshold was introduced.

## Bonus defect found and fixed while building the deterministic simulation harness

`commercial-intelligence-import.mjs#computeScoreAndPolicy` called
`evaluateOpportunityPolicy({ ..., cfg, at })`, but `evaluateOpportunityPolicy`'s parameter is named
`date`, not `at` — the object literal's `at` key was simply ignored, silently defaulting `date` to
`new Date()` (real wall-clock time) regardless of the caller's intended timestamp. Invisible in
production (real callers always pass an `at` ≈ real "now"), but it meant deterministic/simulated
timestamps never actually reached the freshness check — caught by
`tests/canon-seven-day-simulation.test.mjs` when a simulated future date produced a spurious
`missing-current-official-evidence` rejection. Fixed by passing `date: at`; verified against the
full pre-existing `commercial-intelligence-import`/`concurrency`/`revenue-os`/`dry-run-revenue-os`
suites (110 tests) with zero regressions.

## Test evidence

- `npm run check` (syntax + full deterministic suite): **281/281 pass**, 0 regressions.
- `npm run test:browser`: pre-existing, disclosed, environment-only failure (no Chromium binary at
  the expected Playwright path in this sandbox) — identical to the limitation PR #6 itself already
  disclosed; unrelated to this branch's diff.
- `git diff --exit-code 27cd700e7d27287382c9f5e1811ae704f4f1535e..HEAD -- lite/` — **empty**,
  `lite/` is untouched.
- Zero-send proof: every dispatch path in every test either produces `blocked` (no provider) or
  `simulated_sent` (simulation) — no test or code path in this branch ever produces a real `sent`
  outbound event.
- Zero-write preview proof: unchanged from PR #6 — `commercial-intelligence-import.mjs`'s preview
  mode still performs zero writes, including its own audit trail (this branch does not touch that
  file's preview/commit split, only the one `date`-parameter bug above).
