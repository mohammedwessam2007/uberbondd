# OMNIA V9 Gmail Reconciliation Report

## What this report is, and is not

This report combines (a) research into Gmail's documented behavior, already gathered in Mission 6's [`V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md`](./V9_GMAIL_IDEMPOTENCY_AND_RECONCILIATION_RESEARCH.md), (b) this mission's own adapter-logic verification against a fake Gmail transport, and (c) an honest statement of what remains empirically unverified. **No live Gmail API call was made in this mission.** No owner authorization for a live self-test was present when this report was first written (see [`V9_GMAIL_SELF_TEST_OWNER_APPROVAL.md`](./V9_GMAIL_SELF_TEST_OWNER_APPROVAL.md)), and per this mission's own instruction, absent that authorization the live self-test was designed and not executed.

## LIVE_OWNER_CONTROLLED_SELF_TEST (Mission 8 attempt)

A follow-up mission (Mission 8) supplied an explicit, written owner authorization for exactly one live self-test message, narrowly scoped (one message, owner-controlled sender and recipient only, no prospect contact). Before attempting anything network-facing, the mission's own required pre-send checks were executed and passed:

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
| Timeout before request received | `UNCERTAIN`; reconciliation independently confirms `NOT_FOUND` |
| Timeout after request accepted | `UNCERTAIN` locally; reconciliation finds `RECONCILED_ACCEPTED` |
| Response lost (5xx after actual storage) | `UNCERTAIN`; reconciliation recovers `RECONCILED_ACCEPTED` |
| Rate limited (429) | `UNCERTAIN`, never `REJECTED` |
| Search finds exactly one | Reconciles cleanly to `RECONCILED_ACCEPTED` |
| Search finds zero | `NOT_FOUND` |
| Search finds multiple | `AMBIGUOUS` -- never resolved heuristically |
| Search finds wrong recipient | `AMBIGUOUS` -- never trusted blindly |
| Search finds mismatched subject | `AMBIGUOUS` |
| A loosely-matched search result whose fetched message doesn't actually carry the queried Message-ID | `AMBIGUOUS` -- the adapter's own post-fetch verification catches what a hypothetically fuzzier real search might miss |
| No hidden client-level auto-retry | Confirmed: exactly one dispatch, one mailbox entry |

Additionally, [`tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs) runs this adapter through the real dispatcher and recovery worker against real PostgreSQL 16: a checkpoint-C-shaped crash (Gmail accepts, local evidence never written, process "restarts") finalizes correctly via reconciliation with **zero** repeat `dispatch()` calls, and two concurrent recovery workers racing on the same stuck Gmail-bound execution converge on exactly one outcome, all 4 tests passing.

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

## NOT_FOUND semantics -- the one thing this mission cannot resolve without a live test (section 17)

**`NOT_FOUND` from a `rfc822msgid:` search does not necessarily mean "the provider never received the request."** Search-index lag is a documented characteristic of search systems generally, and this mission found no Gmail-specific documentation guaranteeing zero indexing delay for a just-sent message. This is the single most important open question standing between the current `PARTIALLY_VERIFIED` classification below and a stronger one:

- If Gmail's search index reflects a just-sent message within, say, low single-digit seconds, `NOT_FOUND` after a short bounded window is a reasonably strong signal of non-submission.
- If indexing can lag by tens of seconds or longer under some conditions, `NOT_FOUND` too soon after a suspected send is not safe to treat as proof of non-submission -- doing so risks exactly the double-send this whole mission exists to prevent.

**This mission does not resolve this question, because resolving it requires a live send and a live search against a real account -- exactly the empirical step gated behind explicit owner authorization** (absent in this mission; see [`V9_GMAIL_SELF_TEST_OWNER_APPROVAL.md`](./V9_GMAIL_SELF_TEST_OWNER_APPROVAL.md)).

## Bounded reconciliation window (design, not yet empirically tuned)

Per section 18, a conservative design (not implemented as a running scheduler in this mission -- this is a specification for whoever builds the operational reconciliation worker):

1. **Immediate read**: one `reconcile()` call right after a `RESULT_UNCERTAIN` transition.
2. **Delayed read**: a second attempt after a short, deliberately un-aggressive delay (e.g. 30-60 seconds) -- the exact interval is one of the things a real self-test would calibrate, not something this mission invents a number for without evidence.
3. **Later read**: one more attempt after a longer delay (e.g. 5-10 minutes), covering slower indexing scenarios.
4. **`OWNER_REVIEW_REQUIRED`**: if still unresolved after the bounded window, park for manual review -- never poll indefinitely, never treat a still-`NOT_FOUND` result past the window as license to resend.

This directly maps onto the existing, already-tested `RECONCILING -> RESULT_UNCERTAIN` loop-back transition in [`external-effect-recovery.mjs`](../../src/omnia-v9/integrations/external-effect-recovery.mjs) (Mission 6) -- no new state-machine states are needed; only a scheduling policy for how often `recoverUnresolvedExecutions()` is invoked in production, which is an operational decision outside this mission's scope.

## Verdict: `GMAIL_RECONCILIATION_PARTIALLY_VERIFIED`

Not `GMAIL_RECONCILIATION_VERIFIED`, because that classification requires empirical proof this mission does not have: no live send occurred, so whether Gmail actually preserves a caller-supplied `Message-ID:` verbatim, and how quickly `rfc822msgid:` reflects a just-sent message, are both unverified facts, not confirmed ones. Not `GMAIL_RECONCILIATION_UNSAFE_FOR_CANARY` either -- nothing in the research or the adapter-logic testing suggests Gmail's real semantics are incompatible with this protocol; the reconciliation mechanism (`Message-ID:` + `rfc822msgid:`) is real and documented, the adapter correctly refuses to trust ambiguous or multiple search results, and the shared recovery worker never blindly retries regardless of provider.

**`PARTIALLY_VERIFIED` means exactly this: the adapter's own logic is proven correct against every scenario a controlled fake can produce, and 7 targeted mutations of its safety-critical logic are all caught -- but the provider's actual behavior (Message-ID preservation, search-index latency) still requires the one owner-authorized live self-test this mission was instructed to design and not execute without authorization.** Conservative manual review of the first several real reconciliations (were a real canary ever run) remains necessary until that live test closes this gap.

**This classification is unchanged after the Mission 8 owner-authorization attempt** (see "LIVE_OWNER_CONTROLLED_SELF_TEST" above): owner authorization was granted, but the two remaining execution prerequisites -- a real owner-controlled recipient address and real Gmail OAuth test credentials -- were both absent from this environment, so the live test could not run and no new empirical evidence was gathered. The gap this classification describes remains exactly as open as before.
