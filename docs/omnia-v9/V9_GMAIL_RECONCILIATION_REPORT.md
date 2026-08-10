# OMNIA V9 Gmail Reconciliation Report

## What this report is, and is not

This report combines (a) research into Gmail's documented behavior, already gathered in Mission 6's [`V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md`](./V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md), (b) this mission's own adapter-logic verification against a fake Gmail transport, and (c) an honest statement of what remains empirically unverified. **No live Gmail API call was made in this mission.** No owner authorization for a live self-test was present when this report was first written (see [`V9_GMAIL_SELF_TEST_OWNER_APPROVAL.md`](./V9_GMAIL_SELF_TEST_OWNER_APPROVAL.md)), and per this mission's own instruction, absent that authorization the live self-test was designed and not executed.

## Historical LIVE_OWNER_CONTROLLED_SELF_TEST attempt (Mission 8)

A follow-up mission (Mission 8) supplied an explicit, written owner authorization for exactly one live self-test message, narrowly scoped (one message, owner-controlled sender and recipient only, no prospect contact). The following table is the historical record from that attempt; its branch/SHA and test counts are not a claim about the later cumulative closure patch:

| Check | Result |
|---|---|
| Branch matches authorization (`product/omnia-v9-gmail-preflight`) | Confirmed |
| SHA matches authorization (`b384e0a...`) | Confirmed |
| Frozen baseline (all 20 files) | `ALL MATCH` |
| Gmail static-safety tests | 14/14 passing |
| `node scripts/verify-v9-closure.mjs` | `OMNIA_V9_CLOSURE_VERIFIED` |

The authorization then required, before any send: (1) an explicit, owner-controlled recipient address available from secure local configuration or owner-provided environment data, and (2) safe Gmail OAuth test credentials present in the environment. **Both prerequisites were checked directly and neither was found:**

- **Recipient**: the authorization names no specific address (sender/recipient mailboxes are described only as "owner-controlled," never given as literal addresses), and no owner-controlled test recipient address exists in any environment variable, `.env` file, or repository configuration. Per the authorization's own explicit instruction ("Do NOT infer an address"), no address was guessed or constructed.
- **Credentials**: `grep`-level and file-level search for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, any Gmail refresh/access token, or any sealed account-token file found nothing. `.env.example` documents the expected variable names; no corresponding `.env` or real environment values exist in this session. No production `accounts` table row with real Gmail OAuth tokens exists in this disposable environment either.

**Result: no live Gmail API call was made.** `gmail_send_count = 0`. The one-message send this mission authorized could not be attempted because its own prerequisites (a real recipient, real credentials) were never satisfied in this environment -- not because of a decision to withhold it. All other required evidence fields (Message-ID preservation classification, `rfc822msgid:` search outcome, indexing delay, response-loss reconciliation, provider evidence digest) are consequently `NOT_APPLICABLE: no send occurred`.

## Automatic retry inspection (section 6)

Directly inspected `src/gmail.mjs`: every Gmail API call (`sendEmail`, `listMessages`, `getMessage`, `getProfile`) routes through one shared internal `gmail()` helper that makes exactly one `fetch()` call and either returns the parsed response or throws. **No retry logic exists anywhere in this file** -- no exponential backoff, no retry-on-5xx, no SDK-level automatic resubmission, because this codebase does not use the Google API Node client library at all; it calls the REST API directly via `fetch`. This means the "inspect and explicitly control any provider/client automatic retry policy" requirement resolves to: there is no hidden retry policy to control, because there is no retry policy at all in the transport this codebase uses. `gmail-effect-adapter.mjs`'s own `dispatch()` method independently adds zero retry logic on top -- proven directly by a dedicated mocked-contract test asserting `dispatchCallCount === 1` and `mailbox.length === 1` after a single `dispatch()` call under a server-error simulation.

## Mocked contract test results

All 15 tests in [`tests/omnia-v9-gmail-effect-adapter-contract.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-contract.test.mjs) pass against [`tests/helpers/fake-gmail-transport.mjs`](../../tests/helpers/fake-gmail-transport.mjs):

| Scenario | Result |
|---|---|
| Definite success | `ACCEPTED`, real (fake) Gmail message ID returned |
| Definite rejection (400) | `REJECTED`, zero mailbox entries created |
| Timeout before request received | `UNCERTAIN`; a zero-result search remains `UNCERTAIN` and cannot authorize a resend |
| Timeout after request accepted | `UNCERTAIN` locally; reconciliation finds `RECONCILED_ACCEPTED` |
| Response lost (5xx after actual storage) | `UNCERTAIN`; reconciliation recovers `RECONCILED_ACCEPTED` |
| Rate limited (429) | `UNCERTAIN`, never `REJECTED` |
| Search finds exactly one | Reconciles cleanly to `RECONCILED_ACCEPTED` |
| Search finds zero | `UNCERTAIN` (`zero-matches-not-proof-of-non-submission`) |
| Search finds multiple | `AMBIGUOUS` -- never resolved heuristically |
| Search finds wrong recipient | `AMBIGUOUS` -- never trusted blindly |
| Search finds mismatched subject | `AMBIGUOUS` |
| A loosely-matched search result whose fetched message doesn't actually carry the queried Message-ID | `AMBIGUOUS` -- the adapter's own post-fetch verification catches what a hypothetically fuzzier real search might miss |
| No hidden client-level auto-retry | Confirmed: exactly one dispatch, one mailbox entry |

Additionally, [`tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs) defines four PostgreSQL-backed cases: a checkpoint-C-shaped crash (Gmail accepts, local evidence never writes, process "restarts"), zero-repeat-dispatch recovery, zero-match uncertainty retention, and a two-worker race. Historical runs passed against PostgreSQL. The current cumulative patch must be rerun with `OMNIA_V9_TEST_DATABASE_URL`; the ordinary deterministic command reports these cases as skipped rather than mislabeling them current evidence.

## Mutation testing: 7 mutations, all caught

Applied directly to committed source, confirmed RED, reverted via `git checkout`, confirmed clean:

| # | Mutation | Result |
|---|---|---|
| 1 | Message-ID binding removed from the send call | 6 of 15 mocked-contract tests failed |
| 2 | Automatic send retry permitted on failure | 3 of 15 tests failed |
| 3 | `UNCERTAIN` converted to `NOT_FOUND` | 4 of 15 tests failed |
| 4 | `NOT_FOUND` triggers an immediate resend (in the shared, provider-agnostic recovery worker) | 4 tests failed across both the Gmail-specific and Mission 6's null-sink test files, confirming the fix protects every adapter, not just Gmail |
| 5 | Multiple reconciliation matches accepted heuristically instead of `AMBIGUOUS` | exactly 1 of 15 tests failed -- the one testing it |
| 6 | Recipient mismatch ignored during reconciliation | exactly 1 of 15 tests failed |
| 7 | Gmail message identity (post-fetch header) verification ignored | exactly 1 of 15 tests failed |

## What Gmail's real semantics are (research, not new to this mission -- restated for this report's completeness)

Per [`V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md`](./V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md): no client-supplied idempotency key; no documented duplicate-send guarantee; the real, documented reconciliation path is a caller-set `Message-ID:` header plus the `rfc822msgid:` search operator. That research was conducted via `WebSearch` results quoting Google's own documentation (direct `WebFetch` was blocked by this environment's egress proxy), not a live API call.

## Zero-match semantics -- conservatively resolved in code

**A zero result from a `rfc822msgid:` search does not prove that the provider never received the request.** This mission found no Gmail-specific guarantee of zero indexing delay. The adapter therefore no longer emits `NOT_FOUND` for Gmail zero-match searches. It emits `UNCERTAIN`, retains the business-key lock, and never creates resend permission.

- A later exact match can reconcile to `RECONCILED_ACCEPTED`.
- Repeated zero matches remain `RESULT_UNCERTAIN` and may eventually require owner review.
- Only a provider-specific, affirmative proof of non-submission may use `NOT_FOUND`; Gmail search absence is not such proof.

The live test is still useful for measuring Message-ID preservation and search visibility, but safety no longer depends on guessing a delay threshold.

## Bounded reconciliation window (design, not yet empirically tuned)

Per section 18, a conservative design (not implemented as a running scheduler in this mission -- this is a specification for whoever builds the operational reconciliation worker):

1. **Immediate read**: one `reconcile()` call right after a `RESULT_UNCERTAIN` transition.
2. **Delayed read**: a second attempt after a short, deliberately un-aggressive delay (e.g. 30-60 seconds) -- the exact interval is one of the things a real self-test would calibrate, not something this mission invents a number for without evidence.
3. **Later read**: one more attempt after a longer delay (e.g. 5-10 minutes), covering slower indexing scenarios.
4. **`OWNER_REVIEW_REQUIRED`**: if still unresolved after the bounded window, park for manual review -- never poll indefinitely, never treat a still-empty result as license to resend.

This directly maps onto the existing, already-tested `RECONCILING -> RESULT_UNCERTAIN` loop-back transition in [`external-effect-recovery.mjs`](../../src/omnia-v9/integrations/external-effect-recovery.mjs) (Mission 6) -- no new state-machine states are needed; only a scheduling policy for how often `recoverUnresolvedExecutions()` is invoked in production, which is an operational decision outside this mission's scope.

## Verdict: `ADAPTER_LOGIC_VERIFIED_PROVIDER_SEMANTICS_UNVERIFIED`

This is not `GMAIL_RECONCILIATION_VERIFIED`: no live send occurred, so caller-supplied Message-ID preservation and real search visibility remain unverified. The adapter logic is conservative under that uncertainty: ambiguous, missing, or zero-result evidence never becomes success, rejection, or resend permission. Production outbound also remains blocked unless an authoritative exact-payload consequence gate is configured.

The controlled fake proves local classifications and retry behavior, not Google's real behavior. Conservative manual review of the first real reconciliations remains mandatory until an owner-controlled test closes the provider-evidence gap.

**This classification is unchanged after the Mission 8 owner-authorization attempt** (see "LIVE_OWNER_CONTROLLED_SELF_TEST" above): owner authorization was granted, but the two remaining execution prerequisites -- a real owner-controlled recipient address and real Gmail OAuth test credentials -- were both absent from this environment, so the live test could not run and no new empirical evidence was gathered. The gap this classification describes remains exactly as open as before.
