# Data minimization matrix

What each consequential ingress is allowed to keep, and what was measured to
actually reach durable state.

Every row was produced by feeding a hostile payload through the real code path
and inspecting the persisted object — not by reading the source and believing
it. Where a cell says a value is absent, a probe put that value in and could not
find it afterwards.

The default rule this matrix enforces: **provider-authentic is not
retention-authorized.** If ordinary business operation does not need a field, it
is not persisted, whether or not the provider signed it.

## Field classification vocabulary

`REQUIRED_FOR_TRUTH` · `REQUIRED_FOR_IDEMPOTENCY` · `REQUIRED_FOR_AUDIT` ·
`REQUIRED_FOR_RECOVERY` · `OPTIONAL_DIAGNOSTIC` · `UNNECESSARY` · `SENSITIVE` ·
`SECRET_LIKE` · `PII` · `UNKNOWN`

## 1. Payment provider — Lemon Squeezy webhook

| | |
|---|---|
| Entry point | `src/revenue.mjs` → `handleLemonWebhook(rawBody, signature)` |
| Raw input exists | Yes — HMAC-verified `rawBody`, held in memory for signature verification only |
| Canonical normalizer | `normalizeLemonEvent()` in `src/payments.mjs` |
| Persisted to | `orders`, `revenueEvents`, `auditLog:payment_classification` |
| Raw retention allowed | **No** |
| Test proving it | `tests/provider-payload-minimization.test.mjs`, `tests/provider-payload-minimization-source-guard.test.mjs` |
| Mutation | `PRIV-01` |

Persisted fields on `orders`, all `REQUIRED_FOR_TRUTH` or `REQUIRED_FOR_IDEMPOTENCY`:

`provider` · `providerEventId` · `eventName` · `leadId` · `prospectId` ·
`product` · `amountCents` · `currency` · `status` · `testMode` · `createdAt`

Measured: a correctly signed event carrying customer email, customer name,
billing address, tax number, card last four, a receipt URL with a signature
query parameter, a session-token-shaped field, provider-internal risk flags, an
unknown future provider field and 20 rows of metadata noise.

**Before:** 10 of 10 persisted, durable row 1,973 bytes.
**After:** 0 of 10 persisted, durable row 309 bytes.

Retention happens *before* classification, so this applied to events the system
then rejected as `INVALID_OR_UNSUPPORTED` too — an unusable event still kept the
customer's address.

`auditLog:payment_classification` additionally carries `amountCents` and
`currency` — `REQUIRED_FOR_TRUTH`, added in this mission. See §"Receipt witness"
below.

## 2. Outreach provider — webhook normalizer

| | |
|---|---|
| Entry point | `src/outreach-provider-events.mjs` → `normalizeProviderEvent()` |
| Raw input exists | Yes — `rawBody` used for the signature and for the event key hash |
| Persisted to | `providerEvents` (adapter dormant — no caller yet), `replyDrafts` via `internalReplyFromProviderEvent()` |
| Raw retention allowed | **No** |
| Test proving it | `tests/outreach-provider-events.test.mjs` |
| Mutations | `PRIV-02`, `PRIV-03` |

Measured with a payload carrying a private customer name, billing metadata,
hidden provider metadata, a session reference, a cookie-shaped value, an
OAuth-shaped token, a refresh token, a 500-byte deep nested payload, a 5KB
metadata blob, and unrelated PII (date of birth, phone number).

**Before:** 10 of 10 retained, normalized event 7,949 bytes.
**After:** 0 of 10 retained, normalized event 597 bytes.

The internal reply built from the event was already clean at 542 bytes, so no
consumer needed the payload. The `event.raw?.reply_text_snippet` fallback that
appeared to justify keeping it was provably dead: `replyBody` already lists
`reply_text_snippet` among its own candidates, so removing `raw` entirely leaves
the reply body byte-identical.

Minimization landed **before** the adapter is activated, which is the only
moment it is free.

## 3. Gmail inbound

| | |
|---|---|
| Entry point | `src/gmail-inbound.mjs` (transport) → `src/inbound-feedback-kernel.mjs` → `compileInboundFeedbackEvent()` |
| Raw input exists | Yes — bounded at read time by `readBoundedJson`, default 5 MB ceiling |
| Raw retention allowed | **No** |
| Send capability | **None.** Scope is `gmail.readonly` and nothing in the module can send |
| Authority granted | `NONE`; status is `CLASSIFIED_LOCAL_ONLY` |

This surface was already correct, and its own declaration is a true statement
rather than a label. The event carries
`privacy.rawHeadersPersisted: false` and `privacy.rawBodyPersisted: false`, and a
probe confirmed both.

Measured with an email carrying: sender display name, sender address, phone
number, postal address, a fine-grained GitHub PAT, a Stripe live key, a JWT, a
`Cookie` header, an `Authorization: Bearer` header, 5 KB of body text and a 4 KB
junk header.

**0 of 11 reached the classified event**, which was 1,018 bytes.

Sender identity survives as `senderAddressHmac` — `REQUIRED_FOR_TRUTH`, stable
across ingests of the same message and different under a different HMAC key, so
the same correspondent can be recognized without the address being retained.

Prompt injection in the body (`authority: FULL`, `status: DELIVERED_VERIFIED`,
a JSON blob claiming `externalEffectsAllowed`) changed nothing: authority stayed
`NONE`, status stayed `CLASSIFIED_LOCAL_ONLY`.

## 4. AI / model provider

| | |
|---|---|
| Entry point | `src/agent-provider-worker.mjs`, `src/agent-worker-runtime.mjs` |
| Raw retention allowed | **No** |
| Bounding | Every text field through `text(value, max)`; `MAX_TEXT` 8,000, `MAX_OUTPUTS` 64, `MAX_TOOLS` 32, ref arrays capped at 100 |
| Secret scanning | `containsSecretValue` on every string in the result |
| Persisted | task identity, provider, model, usage, latency, status, bounded result/evidence, receipt digest, cost |

No provider response object reaches durable state; the worker constructs its own
bounded record. A result containing a credential is refused rather than stored.

## 5. GitHub relay

| | |
|---|---|
| Entry point | `src/github-relay.mjs` |
| External effect authority | Declares a canonical zero-effect ledger via `canonicalZeroEffectLedger()` |
| Raw retention allowed | **No** |
| Secret scanning | Shared `src/secret-patterns.mjs` |

## 6. Operator escalation transport

| | |
|---|---|
| Entry point | `src/operator-escalation-transport.mjs` |
| Persisted | fingerprint, episode id/sequence, attempt outcomes, delivery proof state |
| Raw retention allowed | **No** |
| Redaction | Reason-code free text passes `redactSecrets()` before persistence — receipts are durable forever, and truncation is not redaction |

## 7. Customer requirement intake

| | |
|---|---|
| Entry point | `src/service-fulfillment.mjs` → `compileFulfillmentPlan()` |
| Bounding | `MAX_REQUIREMENTS` 64, `MAX_CRITERIA` 64, `MAX_ARTIFACTS` 128, `MAX_EVENTS` 512, each string through `text()` |
| Persisted | `serviceSkuId`, `customerRef`, bounded requirements and acceptance criteria, revision/support limits |
| Raw retention allowed | **No** |

`customerRef` is a reference, not a customer record. No CRM data lake exists and
none should be built before a real customer does (§30).

## 8. Browser / synthetic journey

| | |
|---|---|
| Entry point | `scripts/visual-qa.mjs`, `tests/browser.test.mjs` |
| Persisted | Nothing durable in ordinary operation; artifacts are local run output |
| Oversize handling | `artifact_skipped_oversize` audit type records the skip rather than the artifact |

## 9. Store-level scan

A mechanical scan of every `store.add` / `store.log` / `store.upsert` call site,
looking for an object-valued field sourced from an external identifier
(`input`, `payload`, `body`, `response`, `raw`, `attributes`, `headers`,
`decoded`, `providerPayload`, …) rather than from a bounding helper, returns:

**No unbounded external object flows into a durable write.**

Before this mission the same scan returned two: `src/revenue.mjs` (`raw: payload`)
and `src/outreach-provider-events.mjs` (`raw: input`).

## Secret scanner coverage

26 credential shapes tested against `containsSecretValue` and `redactSecrets`:
fine-grained GitHub PAT, classic GitHub PAT, GitHub OAuth token, OpenAI-style
key, Stripe `sk_live_`, Stripe `rk_live_`, Anthropic-style key, Bearer token,
Basic credentials, JWT, cookie session, OAuth refresh token, AWS access key id,
AWS secret under a lowercase name, database URL, PEM private key, Vercel token,
generic `API_KEY`, lowercase credential name, mixed-case credential name,
multiline assignment, JSON-encoded secret, nested-object secret, URL query
token, `user:password@` URL, and a base64-wrapped credential.

**26 of 26 blocked. 20 benign strings, 0 flagged.**

The base64 case was the one miss on first attack and is now covered by decoding
long base64 runs and asking the existing patterns about the result — nothing new
is recognized, so precision comes from the two conditions (printable ASCII, and
matches a value pattern) rather than from the alphabet. Base64 of prose, of
business JSON, of binary bytes, a 64-character hex string and a long identifier
run all stay clean.

## What this matrix does not claim

It does not claim every field of every module was classified — it covers the
consequential ingress boundaries and the store-level write scan.

It does not claim minimization is complete for surfaces that do not yet exist. A
CRM adapter, a dispute webhook or a second payment provider would each need a
row here before activation, not after.

It does not claim retention is zero. It claims that what remains is named,
bounded, and required for truth, idempotency, audit or recovery — and that a
probe was unable to find anything else.
