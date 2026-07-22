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

## 2026-07-21 — P1-12 bounded HTTP implemented in gmail-inbound.mjs

Made fetch injectable (cfg.fetch, defaulting to global fetch) so hostile HTTP behavior can be
tested without real network — allowNetwork:true only permits reaching the injected fake, tests
never set NODE_ENV=test so the existing network-disabled gate is genuinely exercised rather than
bypassed. Added readBoundedJson(): rejects an oversized Content-Length before any body read;
otherwise streams via a byte-counting reader and aborts as soon as actual bytes exceed
maxResponseBytes (new config, default 5MB, separate from the existing maxMessageBytes which
bounds the already-parsed Gmail payload); parses JSON only from the bounded text and returns a
fixed error code (never the raw body) on invalid JSON. signal now threads through token refresh
and every GET, checked before and after each await boundary.

New file tests/gmail-inbound-bounds.test.mjs (registered in package.json test:deterministic):
- oversized Content-Length rejected before any body read (body never touched)
- no/false Content-Length but oversized actual stream rejected mid-read
- invalid JSON -> fixed gmail-inbound-invalid-json code, not raw body
- a hanging fetch is aborted promptly via signal, not left to hang the caller
- a well-formed in-bounds response still parses correctly (no false-positive rejection)

Commands run:
- `node --test tests/gmail-inbound-bounds.test.mjs` -> 5/5 pass
- `node --test tests/p2-2-capabilities.test.mjs` -> 15/15 pass (fetch-injection refactor didn't
  break any existing capability/import-graph proof)
- `npm run check` (full syntax + full deterministic suite) -> 269/269 pass, 0 fail
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

## 2026-07-21 — P0-07 implemented: every matched inbound message stops follow-up

Confirmed the exact finding by reading classify-and-suppress before this fix: `nextFollowupAt`
was only cleared for bounce/complaint/unsubscribe (the "suppressWorthy" branch). reply, unknown,
and out-of-office left the prospect's existing nextFollowupAt untouched, so the outbound scheduler
could still reserve/send a follow-up to someone who had just replied.

Restructured classify-and-suppress: the prospect lookup by threadId and nextFollowupAt=null patch
now happen unconditionally for every matched inbound message, before any category-specific branch.
bounce/complaint/unsubscribe still additionally set prospect.status and create durable suppression
(unchanged). reply/unknown/out-of-office never auto-suppress (a real prospect might still convert;
out-of-office specifically needs a human to reschedule, not an automatic new date) but now always
stop the follow-up and create a bounded owner exception carrying a reason code
(inbound-reply/inbound-unknown/inbound-out-of-office) and the matched prospectId (or null if no
thread matched -- an ambiguous/unmatched message is never guessed onto an unrelated prospect).

New hostile tests in tests/autonomy-cycle.test.mjs:
- reply to a matched prospect stops follow-up (previously it did not) + owner exception, no suppression
- unknown-classification message to a matched prospect stops follow-up + owner exception
- out-of-office stops the CURRENT follow-up + review/reschedule exception, never auto-suppressed
- an unmatched thread creates an owner exception (prospectId: null) without touching any unrelated prospect

Commands run:
- `node --test tests/autonomy-cycle.test.mjs` -> 20/20 pass (16 existing unchanged + 4 new)
- `npm run check` (full syntax + full deterministic suite) -> 273/273 pass, 0 fail
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

## 2026-07-21 — P1-10 implemented: real read-only verified-payment-signal count

Found a genuine canonical verified payment-event source already in the accepted-base codebase:
`src/revenue.mjs`'s handleLemonWebhook verifies an HMAC signature before creating an `orders` row
(paymentState:'paid', processingStatus:'completed', providerEventId, occurredAt); `src/payments.mjs`
independently rejects any state transition to 'paid'/'refunded'/'disputed'/'cancelled' whose source
isn't 'verified-webhook'/'manual-owner'/'test-simulation'. This satisfies the spec's requirement
for a canonical trusted source -- P1-10 is fixable, not BLOCKED.

New src/verified-payments.mjs: listVerifiedSignals({store, since, limit, signal}) -- zero imports,
zero network calls, zero calls to any mutating store method or payment/offer/delivery write
function (proven by a new hostile capability test that scans its own source). Reads `orders`,
filters to paymentState==='paid' && processingStatus==='completed', dedupes by providerEventId,
excludes anything at/before a persisted cursor (a plain setting, not a protected collection),
sorted oldest-first before bounding so a truncated batch never skips an out-of-order-arrival
payment older than the new cursor.

Wired into writeDigestStage (not a new STAGE entry, to avoid touching the stage-resume state
machine -- a deliberate scope decision): reads the cursor, calls the reader, advances the cursor
on genuine progress, passes the real count into buildDigest, replacing the hardcoded
`verifiedPayments: 0`.

New tests:
- tests/verified-payments.test.mjs (7 tests): verified paid order counted; unverified/pending/
  refunded/disputed never counted; duplicate provider-event-identity deduped; bounded to configured
  limit with truncated flag; since-cursor excludes prior signals; end-to-end through the real
  digest; cursor advances across cycles so the same payment is never recounted, but a genuinely new
  one after it still is.
- tests/p2-2-capabilities.test.mjs: added verified-payments.mjs to the autonomy-cycle.mjs reviewed-
  import allowlist, plus a new source-scan test proving verified-payments.mjs itself has zero
  imports, no fetch() call, and no call to any store mutation method or payment/offer transition
  function.

Commands run:
- `node --test tests/verified-payments.test.mjs` -> 7/7 pass
- `node --test tests/p2-2-capabilities.test.mjs` -> 16/16 pass
- `npm run check` (full syntax + full deterministic suite) -> 281/281 pass, 0 fail
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

## 2026-07-22 — Part A: protected inboundAccounts repository (P0-08/P1-09 groundwork)

New migrations/010_inbound_accounts.sql: inbound_accounts table with unique (provider,
account_identity), approval_status/active columns, encrypted_tokens jsonb (ciphertext only, no
plaintext token column), token_expires_at, token_version. Added 'inboundAccounts' to
PROTECTED_COLLECTIONS in src/store.mjs.

Dedicated methods on both JSON and PostgreSQL backends: createInboundAccount,
readInboundAccount, listApprovedActiveInboundAccounts, replaceInboundAccountTokenCAS (fenced
on accountId+expectedVersion), disableInboundAccount. No separate "approve" mutation method by
design -- approval is an input to creation only, never a field flippable through any other path.

New tests/inbound-accounts-store.test.mjs (11 tests): default pending/inactive vs explicit
approved creation; duplicate (provider,accountIdentity) rejected; missing identity rejected;
listApprovedActive filters correctly; STORE-05 generic add/upsert/patch rejected on both backends;
token CAS one-refresh-persists + stale-version-rejected; GM-09 concurrent refresh CAS real
PostgreSQL race (exactly one winner, version advances once not twice); disable revokes and drops
from the approved-active list; missing-account reads/CAS reported not thrown; token material
never appears as plaintext in any returned record.

Commands run:
- `node --test tests/inbound-accounts-store.test.mjs` -> 11/11 pass (incl. real PGlite-backed
  PostgreSQL concurrent-CAS race test)
- `npm run check` (full syntax + full deterministic suite) -> 292/292 pass, 0 fail
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

## 2026-07-22 — Part C: refreshed OAuth token persistence (P1-09)

gmail-inbound.mjs's inboundAccessToken now persists a refreshed token exactly once through
cfg.accounts.replaceInboundAccountTokenCAS (the Part A repository) when the caller injects an
`accounts` dependency and the account object carries an id + tokenVersion -- silently skipped
otherwise (keeps old tests/fixtures that only care about the token itself working unchanged).
Preserves the existing refresh_token explicitly when the provider's response omits one. Checks
the abort signal immediately before persisting, so a worker that lost its lease/cycle in the gap
between refresh and persistence cannot still write the new token.

New tests/gmail-inbound-token-persistence.test.mjs (8 tests, all real, all through the actual
reader -- not just the raw store methods already covered in inbound-accounts-store.test.mjs):
one refresh persists exactly once; two concurrent refreshers race to exactly one CAS winner
(loser's own in-flight request still succeeds, its refresh just isn't durably saved); a stale
expectedVersion is rejected without clobbering an already-persisted newer version; provider
omitting a refresh token preserves the old one; provider rotating a refresh token retains the
new one; an aborted refresh persists nothing; an invalid/oversized token-endpoint response fails
safely with zero persistence; a failed refresh's error never contains the account's token
material.

Commands run:
- `node --test tests/gmail-inbound-token-persistence.test.mjs` -> 8/8 pass
- `node --test tests/gmail-inbound-bounds.test.mjs tests/p2-2-capabilities.test.mjs` -> 21/21 pass (no regression from the inboundAccessToken change)
- `npm run check` (full syntax + full deterministic suite) -> 300/300 pass, 0 fail
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

## 2026-07-22 — Part B: inbound-only runtime factory wired into the production entry point (P0-08)

New src/inbound-runtime.mjs: createInboundOnlyRuntime(cfg, {store, fetch}) composes config +
listApprovedActiveInboundAccounts() (Part A) + createGmailInboundReader (with the store injected
as its accounts dependency, so Part C's token persistence is live, not a no-op) into a real
reader+accounts pair, or fails closed with a bounded reason (inbound-disabled /
inbound-provider-not-gmail / missing-inbound-credentials / no-approved-accounts) -- never throws
for these expected states. Imports only ./gmail-inbound.mjs; zero outbound/mixed-module imports
(proven by a source-scan capability test, mirroring the one already covering autonomy-cycle.mjs).

Added inboundGoogle {clientId, clientSecret, redirectUri} and inbound.allowNetwork to
src/config.mjs (all empty/false by default; documented in .env.example, all defaulting to
disabled/blank). Wired into scripts/run-autonomy-cycle.mjs: previously called runAutonomyCycle
with no mailboxReader/accounts at all (the exact P0-08 gap confirmed by this session's earlier
capability-graph scan) -- now calls createInboundOnlyRuntime first and passes its result through,
falling back to the existing safe no-reader path when bootstrap fails closed. Confirmed via a real
smoke run: `node scripts/run-autonomy-cycle.mjs` with default env still completes safely
(bootstrapReason: "inbound-disabled", poll-inbound skipped, zero network, zero side effects).

New tests/inbound-runtime.test.mjs (8 tests): import-graph proof, no-send-capable-symbol proof,
entry-point still schedule-free; GM-01 disabled-by-default (all 3 flag combinations); GM-02
missing-credential blocks with a bounded reason; GM-03 no-approved-account fails closed; GM-04
**fake-HTTP integration test that executes the real composition path end to end** (factory ->
real reader -> real stored account -> real poll-inbound stage -> real message -> real digest
count, not individually mocked pieces); GM-18 still fails closed under NODE_ENV=test even with
allowNetwork:true.

Commands run:
- `node --test tests/inbound-runtime.test.mjs` -> 8/8 pass
- `node scripts/run-autonomy-cycle.mjs` (real smoke run, default env) -> completes safely,
  bootstrapReason "inbound-disabled"
- `npm run check` (full syntax + full deterministic suite) -> 308/308 pass, 0 fail
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

P0-08 ("real Gmail execution is not wired") is now genuinely closed: the production entry point
composes a real reader/account pair when properly configured and approved, and fails closed
otherwise -- proven end to end with fake HTTP, not just unit-tested in isolation.

## 2026-07-22 — Part D: protected inboundWorkItems privacy architecture (P1-11)

Confirmed the exact P1-11 finding before this fix: classify-and-suppress stored gmailId,
threadId, and a redacted-but-not-removed from/subject directly into the generally-readable
`replies` table (which has GET /api/replies/:id and GET /api/replies list routes in server.mjs).
This is now replaced with a new protected inboundWorkItems collection
(migrations/011_inbound_work_items.sql): keyed (HMAC-SHA256, same TOKEN_ENCRYPTION_KEY-derived
construction already used by src/unsubscribe.mjs, added as crypto.mjs's new keyedHash export
rather than inventing a second cryptographic format) messageKey/accountKey/threadKey for durable
dedupe, an encrypted (not hashed -- reversible, needed only for a hypothetical future re-fetch)
providerRef covering only {accountId, gmailId, threadId}, classificationCode, confidenceBucket,
prospectId, and a retention expiresAt (default 30 days, new inboundWorkItemRetentionMs config).
Added to PROTECTED_COLLECTIONS; dedicated createInboundWorkItem/findInboundWorkItemByMessageKey/
deleteExpiredInboundWorkItems methods on both backends, unique index on message_key (real
Postgres-enforced dedupe, not just app logic).

Also fixed a genuine leak my own privacy-corpus hostile test (below) actually caught: the
poll-inbound stage's checkpointed result (persisted onto the autonomyCycleRuns record, which is
generally READABLE by any code with store access even though generic WRITES to it are blocked)
stored raw {accountId, refId} pairs in the clear. Now encrypted per-ref before checkpointing;
classify-and-suppress decrypts them back (never hashed here, since the real ID must be recoverable
to actually fetch the message on a crash-resume).

Added a real runtime digest-key validator (assertExactDigestKeys, exported) -- previously the
digest was only implicitly count-only "by construction"; now an unknown key or a non-integer/
negative count value in either the top-level digest or its nested counts object throws, proven by
a test that deliberately injects an unknown key.

Bug found and fixed along the way: several test fixtures' `encryptionKey: 'key'` (a short string,
never valid) started throwing "TOKEN_ENCRYPTION_KEY must be 64 hex characters" the moment a real
message actually reached the new keyedHash/encryptJson calls -- fixed to 'a'.repeat(64) via the
existing convention used elsewhere in the test suite (my first attempted fix used a hand-typed hex
literal that was silently 2 characters short; caught by actually running the tests, not assumed).

New tests:
- tests/inbound-work-items-store.test.mjs (8 tests): keyed/encrypted persistence shape; durable
  dedupe by messageKey (app-level and, separately, real-Postgres-unique-index-level); missing-key
  rejection; retention TTL sweep; STORE-06 generic add/upsert/patch rejected on both backends.
- tests/inbound-privacy.test.mjs (6 tests): a realistic hostile message carrying the full required
  corpus (name, email, phone, postal address, URL, OAuth token, API key, Unicode MIME-encoded
  header, MIME filename, provider message/account/thread IDs) run through the real end-to-end
  cycle, proving the corpus is absent from: the digest, the run's persisted stage output
  (this is what caught the checkpoint leak above), notifications/owner-exception records, and the
  protected work item itself (not even encrypted, for the content fields -- only the three
  provider-identifying fields are encrypted, and only as ciphertext, never plaintext columns);
  plus a direct test that assertExactDigestKeys genuinely rejects an injected unknown key.

Commands run:
- `node --test tests/inbound-work-items-store.test.mjs` -> 8/8 pass
- `node --test tests/inbound-privacy.test.mjs` -> 6/6 pass (after the checkpoint-encryption fix;
  1/6 genuinely failed before that fix, showing the corpus scan actually works)
- `node --test tests/autonomy-cycle.test.mjs` -> 20/20 pass (existing "digest and per-stage
  results are count-only" test rewritten to check inboundWorkItems instead of the now-unused
  replies write path)
- `npm run check` (full syntax + full deterministic suite) -> 323/323 pass, 0 fail
- `node --test tests/p2-2-postgres-race.test.mjs` -> 5/5 pass, real isolated PostgreSQL,
  re-verified against the two new migrations (010/011) together
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff

Note: src/pipeline.mjs (the separate, already-accepted P2.1 "autonomous reply sync" feature) still
writes to the general `replies` table via its own independent logic -- confirmed unaffected by
this change, since P2.2's autonomy-cycle.mjs only ever wrote to `replies` from within its own
classify-and-suppress stage, never shared any code path with pipeline.mjs.

## 2026-07-22 (owner-authorized session) — Phase 2: closing the last 7 hostile-matrix rows

Owner explicitly authorized pushing this branch and opening a draft PR this session (previous
sessions were local-only). Before any push, closed every remaining Not Run row with real evidence
rather than carrying them forward.

- **GM-05** (repeated page-token loop guard): new test in `tests/autonomy-cycle.test.mjs` uses a
  custom mailboxReader that returns the *same* `nextPageToken` on every call. Proven: exactly 2
  `listMessages` calls before the loop guard (`nextToken === pageToken` -> break) stops it, not
  the 50-page hard cap configured in the test. `node --test tests/autonomy-cycle.test.mjs` -> pass.
- **GM-17** (header count/value length cap): genuine gap, not just an untested guard -- there was
  no cap on the raw Gmail envelope header array or a single header's value length prior to this
  fix (only the overall response byte size was bounded). Added `boundHeaders()` to
  `src/inbound-classify.mjs` (pure, zero imports, same style as `parseInboundMime`) with
  `maxHeaderCount`/`maxHeaderValueBytes` limits (new `cfg.inbound.limits` keys, defaults 100 /
  8192 bytes), wired into `classifyAndSuppressStage` in `src/autonomy-cycle.mjs` before headers
  ever reach classification or From-address extraction. Three new tests (end-to-end with a 5000-
  header/1MB-value hostile message, plus a direct unit test of `boundHeaders`) all pass.
- **LEASE-03** (live heartbeat blocks a concurrent reclaim): new real-Postgres test in
  `tests/p2-2-postgres-race.test.mjs` heartbeats a run every 400ms for 2s (past its original
  1200ms TTL) on `storeA` while `storeB` repeatedly tries `reclaimStaleAutonomyCycleRun` -- always
  rejected with `no-stale-lease`. **This test caught a genuine, previously-undetected production
  bug**: `heartbeatAutonomyCycleRun`'s PostgreSQL SQL used the same bound parameter (`$5`, the new
  lease-expiry timestamp) both as an implicit `timestamptz` column assignment and inside an
  explicit `to_jsonb($5::text)` cast, which Postgres rejects as "inconsistent types deduced for
  parameter $5" (code 42P08) -- `heartbeatAutonomyCycleRun` had zero prior test coverage against a
  real Postgres connection (or PGlite) before this session, only being exercised indirectly and
  never asserted on. Fixed by adding an explicit `$5::timestamptz` cast alongside the existing
  `$5::text` one in `src/store.mjs`. Confirmed the method now works end to end.
- **CRASH-03** (crash after effect commit, before stage checkpoint, does not duplicate): new real-
  Postgres test pre-seeds the exact effect (an `inboundWorkItems` row) a crashed prior attempt
  would have committed, without patching the run's own stage checkpoint (simulating the crash
  landing in that gap), then resumes with the same run/lease-owner identity. Confirms: the stage
  checkpoint advances to `done`, the message is correctly recognized as a duplicate
  (`counts.duplicate === 1`, `counts.processed === 0`), and exactly one row exists in
  `inbound_work_items` for that `message_key` afterward.
- **CRASH-05** (repeated recovery stays bounded and duplicate-free): two real-Postgres sub-
  scenarios in the same test. (a) A reader that fails twice then succeeds: repeated
  `runAutonomyCycle` calls (simulating repeated crash+recovery) converge to success within the
  `maxStageRetries` budget, and exactly one `inbound_work_items` row exists afterward -- no
  duplicate from the earlier failed attempts. (b) A reader that never recovers: retries hard-stop
  at exactly `maxStageRetries` calls with `reason: 'stage-retries-exhausted'`, never looping
  forever, and zero effect rows were ever created.
- **REP-08** (concurrent scheduler loses to the inbound reply-stop fence): two real-Postgres,
  two-separate-connection tests. (a) Deterministic: a reply fully commits via
  `store.recordReplyAndStop` on one connection, then a due-followup dispatch attempt on the other
  connection is rejected with `reason: 'reply-received'`, reservation left `cancelled`. (b) Genuine
  concurrent race across 15 trials (`Promise.all` of `beginOutboundDispatch` and
  `recordReplyAndStop` on separate connections, fresh prospect per trial): both legitimate
  interleavings were observed (dispatch-won and reply-won), and every reply-won outcome rejected
  with exactly `reply-received` and left the reservation `cancelled` -- no inconsistent state
  across any of the 15 trials. Uses the pre-existing per-prospect Postgres advisory lock
  (`outbound:prospect:<id>`) that both `beginOutboundDispatch` and `recordReplyAndStop` already
  took before this session -- this session added the hostile test proving it under genuine
  concurrency, not the locking mechanism itself.
- **STORE-03** (generic remove rejects protected collections): the scenario as literally written
  doesn't apply -- this codebase has never implemented a generic `remove()`/`delete()` method at
  all (only `add`/`upsert`/`patch` are generic; every delete-shaped operation is a named, single-
  collection, no-argument or narrowly-scoped retention sweep:
  `deleteExpiredInboundWorkItems`/`deleteExpiredArtifacts`). New test in
  `tests/p2-2-capabilities.test.mjs` proves this by enumerating every method name on `src/store.mjs`
  and asserting no bare `remove`/`delete` method exists and the only delete-shaped methods are
  those two named sweeps -- the invariant STORE-03 is protecting (a protected collection's rows
  cannot be erased by any caller-directed generic path) holds by construction.

Commands run this phase:
- `node --test tests/autonomy-cycle.test.mjs` -> 23/23 pass (GM-05, GM-17 x2 added)
- `node --test tests/p2-2-postgres-race.test.mjs` -> 10/10 pass, real isolated PostgreSQL
  (LEASE-03, CRASH-03, CRASH-05, REP-08 x2 added; 5 pre-existing also still pass)
- `node --test tests/p2-2-capabilities.test.mjs` -> 18/18 pass (STORE-03 added)
- `npm run check` -> 327/327 pass, 0 fail (up from 323)
- `npm audit` -> 0 vulnerabilities
- `CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:browser` -> 2/2 pass
- `git diff --exit-code a905c907...HEAD -- lite/` -> PASS, zero diff (re-verified after every
  commit this phase)
