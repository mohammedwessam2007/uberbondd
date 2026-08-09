# OMNIA V9 Gmail Idempotency & Reconciliation Research

## Method

This is research, not a live test — no Gmail API call was made in this mission. Findings below combine (a) direct inspection of this repository's existing Gmail adapter, [`src/gmail.mjs`](../../src/gmail.mjs), and (b) web research against Google's own developer documentation. Direct `WebFetch` of `developers.google.com` was blocked by this environment's egress proxy; findings are instead drawn from `WebSearch` results that quote and cite Google's official documentation pages directly (linked below), plus general Gmail API knowledge. Where a claim could not be independently confirmed against a live fetch of the primary source in this session, that is stated explicitly rather than presented as verified.

## Current adapter, as it exists today

`sendEmail()` in `src/gmail.mjs` builds a raw RFC 2822 message manually — `From`, `To`, `Subject`, `MIME-Version`, `Content-Type`, optionally `In-Reply-To`/`References`/`List-Unsubscribe` — and calls `POST /gmail/v1/users/me/messages/send` with `{ raw, threadId }`. **It does not currently set an explicit `Message-ID:` header.** Gmail will generate one server-side when the header is absent. This matters directly for this mission: there is no pre-generated, caller-controlled stable identity in the current send path today — building one is a design change, addressed below, not something already in place.

## Q1: Does Gmail accept a client-provided idempotency key?

**No — not that this research found, and this should be treated as a real limitation, not assumed away.** `users.messages.send`'s documented request body is `{ raw, threadId }` (this repository's own usage matches the documented shape). No idempotency-key or request-ID field appears in the searched documentation excerpts or in this codebase's own working integration. **Gmail does not have Stripe-style idempotency.** This mission's instruction to state that explicitly, rather than assume otherwise, is followed here: if a `sendEmail()` call is retried with byte-identical content, nothing on Gmail's side is documented to deduplicate it. Two identical calls are, as far as this research found, two separate sent messages.

## Q2: Can a provider-generated message ID be queried after an uncertain submission?

**Yes, two distinct IDs exist and both are queryable, with different guarantees:**

1. **Gmail's own message `id`** (returned in the `send` response body alongside `threadId`) — this is exactly what's unavailable if the response was lost. It cannot be looked up without already possessing it.
2. **The RFC 2822 `Message-ID:` header value** — this is the one a caller can control *before* sending (see Q6), and it remains discoverable *after* sending independent of whether the response was received, via the `rfc822msgid:` search operator (see Q3). This is the mechanism this research recommends building reconciliation around, not Gmail's own opaque `id`.

## Q3: `rfc822msgid:` search — real, documented, and directly useful

Confirmed via Google's own Gmail search-operator documentation (`developers.google.com/gmail/api/guides/filtering`, quoted in search results): **`rfc822msgid:` is a real, first-class Gmail search operator** that finds "one specific Internet message ID" — exactly the `Message-ID:` header value, per RFC 822/2822. A query like `rfc822msgid:<stable-id>@uberbond.example` against `users.messages.list` returns the exact message if it was successfully sent (and is visible to the searching account — i.e. it works from the *sender's* mailbox, which is what a reconciliation worker needs). This is the single most load-bearing finding of this research: **Gmail does provide a real, documented reconciliation path, just not via an idempotency key — via a caller-controlled Message-ID plus a search query.**

## Q4: Do drafts offer safer semantics?

Per Google's draft guide (`developers.google.com/workspace/gmail/api/guides/drafts`, quoted in search results): a draft has a stable *draft* ID, but "the message contained within the draft ... can be replaced," and when a draft is sent (`drafts.send`), "the draft is automatically deleted and a new message with an updated ID is created." **This does not solve idempotent sending** — `drafts.send` still performs the same underlying send operation and, per this research, is not documented to be safer against duplicate submission than `messages.send`. It could be useful for a different reason: a draft can be created durably *before* the send decision is finalized, giving a durable, inspectable pre-send artifact — but that is a "durable intent" property this mission's own execution-intent design already provides locally, not something drafts add on top.

## Q5: What does Gmail guarantee about duplicate sends?

No documented guarantee against duplicate sends was found for `users.messages.send`. This research treats the absence of a documented guarantee as equivalent to "no guarantee," per this mission's instruction to be technically honest rather than assume best-case behavior.

## Q6: Can a caller-set `Message-ID:` header act as a stable business-side identity?

Per general RFC 2822/5322 semantics and Gmail's own handling (the sender-visible Message-ID is "exactly the same for both the sender and the recipient," per the `rfc822msgid` research above): **yes, in principle** — a caller can set an explicit `Message-ID:` header in the raw MIME content before base64url-encoding it (this repository's `sendEmail()` already builds the header list manually; adding one more header is a small, mechanical change, not attempted in this mission since no real send occurs). This research did **not** independently confirm, via a live call, that Gmail always preserves a caller-supplied `Message-ID:` verbatim rather than substituting its own — this is the one open question a future real-canary mission should verify empirically (in a disposable test account) before relying on it, rather than assuming it from documentation alone.

## Q7: What can safely go in message headers?

Custom `X-`-prefixed headers are conventionally safe to add to a raw RFC 2822 message and are commonly used for internal tracking (e.g. `X-UberBond-Execution-Id`). This research recommends against relying on a custom header for reconciliation *primary* identity, since — unlike `Message-ID:` — there is no documented Gmail search operator for an arbitrary custom header. `Message-ID:` plus `rfc822msgid:` is the only combination this research found with both (a) a documented search path and (b) reasonable expectation of provider preservation.

## Q8: How are Gmail API retries documented?

Google's general API client guidance (consistent across Google Cloud/Workspace APIs, not confirmed specifically re-fetched for Gmail in this session due to the blocked fetch) recommends exponential backoff for `5xx` and rate-limit (`429`) responses on *idempotent* methods. `users.messages.send` is a `POST` creating a new resource — the general web-API convention (and this research's own conclusion, independent of a specific Gmail statement) is that `POST` operations are **not safe to retry blindly** on ambiguous failure (timeout, connection reset) precisely because the server may have already processed the request. This matches this mission's central instruction: **uncertainty must never become retry permission.**

## Conclusions

| Question | Finding |
|---|---|
| Client-supplied idempotency key | **Not supported.** State this explicitly; do not assume otherwise. |
| Provider-generated ID queryable after loss | Gmail's own `id` — no, not without already having it. The `Message-ID:` header — yes, via search. |
| `rfc822msgid:` reconciliation | **Real, documented, directly usable** — the core recommended mechanism. |
| Drafts safer for idempotency | No documented advantage found. |
| Duplicate-send guarantee | **None documented.** Treat retries after an uncertain result as unsafe by default. |
| Caller-controlled stable identity | A caller-set `Message-ID:` header, in principle — **unverified against a live account in this mission** (no send occurred); flagged as the one item a future real canary must confirm empirically before depending on it. |

**Gmail does not provide sufficiently strong idempotency to make blind retry ever safe.** It does provide a real, if narrower, reconciliation path (`Message-ID:` + `rfc822msgid:` search) sufficient to resolve most `RESULT_UNCERTAIN` cases *without* retrying — which is exactly the mechanism [`V9_EXTERNAL_EFFECT_PROTOCOL.md`](./V9_EXTERNAL_EFFECT_PROTOCOL.md)'s provider-neutral contract is designed to use, with Gmail as one future implementation and the null-sink simulator standing in for it in this mission's testing.

## Sources

- [REST Resource: users.messages](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages) — response shape for `send` (`id`, `threadId`, etc.)
- [Method: users.messages.send](https://developers.google.com/workspace/gmail/api/v1/reference/users/messages/send) — request/response reference
- [Searching for Messages / filtering guide](https://developers.google.com/gmail/api/guides/filtering) — `rfc822msgid:` operator
- [Create and send email messages](https://developers.google.com/workspace/gmail/api/guides/sending) — `messages.send` usage guide
- [Create and send draft emails](https://developers.google.com/workspace/gmail/api/guides/drafts) — `drafts.send` behavior and ID stability
- [Easily Locate Email Messages in Gmail with rfc822msgid](https://www.labnol.org/internet/find-gmail-message-by-rfc8222/32020) — third-party explainer corroborating the operator's behavior
