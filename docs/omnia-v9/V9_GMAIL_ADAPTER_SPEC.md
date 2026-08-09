# OMNIA V9 Gmail Adapter Spec

The real Gmail implementation of the provider-neutral external-effect contract from Mission 6 ([`V9_EXTERNAL_EFFECT_PROTOCOL.md`](./V9_EXTERNAL_EFFECT_PROTOCOL.md)). Source: [`src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs`](../../src/omnia-v9/integrations/providers/gmail-effect-adapter.mjs). The frozen V9 kernel, the state machine, the dispatcher, and the recovery worker are completely unmodified by this mission and unaware this is Gmail rather than the null-sink simulator -- proven directly in [`tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs), which runs the real dispatcher and recovery worker against this adapter with zero Gmail-specific code in either.

## Additive changes to `src/gmail.mjs`

Three small, backward-compatible additions, none of which change behavior for any existing caller that doesn't opt in:

1. **`cfg.fetchImpl` injection point** -- `tokenRequest()` and the internal `gmail()` helper now use `cfg?.fetchImpl || fetch`. Defaults to the real global `fetch`; used only by this mission's fake-transport tests today.
2. **`err.status` on thrown errors** -- both helpers now attach the HTTP status code to any thrown error, so callers can distinguish a definite provider rejection (4xx) from a transport-level or 5xx failure without parsing error message strings.
3. **Optional `message.messageId` header** -- `sendEmail()` now includes a `Message-ID:` header when the caller supplies one, instead of always leaving Gmail to generate its own. This is the one mechanism this adapter's whole reconciliation strategy depends on.

## `prepare(effectIntent)`

Everything validated **before** any network I/O:

- **Recipient**: required, must match a basic RFC-shaped email regex.
- **Subject**: required, ≤200 characters, no raw CR/LF (header-injection guard).
- **Body**: required, ≤20,000 characters.
- **Attachments**: unsupported -- always rejected if present.
- **Bcc/Cc**: rejected unless the adapter is explicitly constructed with `allowBcc: true`.
- **Unexpected fields**: any field in `effectPayload` outside the fixed allow-list (`to`, `subject`, `body`, `bcc`, `cc`, `attachments`, `replyToId`, `listUnsubscribe`, `threadId`) is rejected.
- **Business key / provider effect identity / execution ID**: required, matching the generic execution-store contract from Mission 6.

Generates the Message-ID (see below) and returns a fully-formed, ready-to-dispatch object. 14 dedicated tests in [`tests/omnia-v9-gmail-effect-adapter-static-safety.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-static-safety.test.mjs) prove every one of these rejections fires before any network call.

## `dispatch(preparedEffect)`

Exactly one call to `sendEmail()` per invocation -- **no retry loop anywhere in this function**, and no reliance on any Gmail-client-level automatic retry (verified directly: `src/gmail.mjs` makes one direct `fetch()` call per Gmail API request with no retry wrapper of any kind -- confirmed by source inspection, not assumed).

Classification of the result:

| What happened | Classification | Why |
|---|---|---|
| HTTP 200, response received | `ACCEPTED` | Gmail's own synchronous confirmation |
| HTTP 400/401/403/404/422 | `REJECTED` | Gmail processed the request and explicitly refused it |
| HTTP 429 or 5xx | `UNCERTAIN` | The provider could not confirm anything -- never converted into REJECTED |
| A thrown network-level error (timeout, connection reset, DNS failure) | `UNCERTAIN` | Proves nothing about what Gmail actually did -- never converted into success OR rejection |

This exact mapping is why 429/5xx are excluded from the definite-rejection set: this mission's explicit instruction is "never convert an unknown/transient provider result into REJECTED," and a 429/5xx response gives no information about whether the message was actually queued.

## `reconcile(effectIdentity)`

Read-only. Searches by the caller-generated Message-ID via the real, documented `rfc822msgid:` Gmail search operator (see [`V9_GMAIL_RECONCILIATION_REPORT.md`](./V9_GMAIL_RECONCILIATION_REPORT.md)), then:

1. **Zero matches** -> `NOT_FOUND`.
2. **Multiple matches** -> `AMBIGUOUS` -- never resolved heuristically, per this mission's explicit instruction (section 16).
3. **Exactly one match** -> fetches the full message, parses its actual `Message-ID:` header, and verifies it matches the query byte-for-byte. A search "hit" whose fetched message doesn't actually carry the expected header is treated as `AMBIGUOUS`, not trusted -- this defends against a hypothetically fuzzier-than-exact real search (untested against the real API, since no live call occurred in this mission), proven directly in a dedicated test using a fake transport configured for loose/fuzzy matching.
4. If `expectedTo`/`expectedSubject` are supplied and don't match the fetched message -> `AMBIGUOUS`.
5. Otherwise -> `RECONCILED_ACCEPTED`.

## `classifyOutcome(providerEvidence)`

Pure function, `evidence.lifecycle` in, one of the seven `ADAPTER_OUTCOMES` out. Any unrecognized or missing lifecycle fails closed to `UNCERTAIN`, never to a false positive.

## Message-ID design

`<v9-{sha256(executionId)}@{messageIdDomain}>` -- see `generateMessageId()`.

- **Generated before dispatch**: computed entirely in `prepare()`, before any network I/O.
- **Deterministic**: the same execution ID always produces the same Message-ID (proven directly by test).
- **Unique per logical consequence**: different execution IDs never collide (SHA-256 digest).
- **No PII, no reversible internal identifiers**: the raw execution ID itself never appears in the header -- only its one-way digest. Recipient address, business key, and tenant are never embedded either.
- **`messageIdDomain` must be explicitly supplied**: `generateMessageId()` throws if no valid domain is given -- this adapter never guesses or hardcodes a real UberBond domain. A real deployment would supply this via explicit configuration, not a default baked into this code.
- **Valid RFC format**: `<local-part@domain>`, matching RFC 5322's angle-bracket-delimited form.

This exact shape was chosen over embedding the business key or a plaintext execution ID because the header is visible to the recipient's mail client and any relay that logs headers -- a one-way digest of an already-opaque internal ID leaks nothing usable even under that exposure.

## Static safety, mocked contract, and dispatch/recovery test coverage

- [`tests/omnia-v9-gmail-effect-adapter-static-safety.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-static-safety.test.mjs) -- 14 tests, all pre-network validation.
- [`tests/omnia-v9-gmail-effect-adapter-contract.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-contract.test.mjs) -- 15 tests against [`tests/helpers/fake-gmail-transport.mjs`](../../tests/helpers/fake-gmail-transport.mjs), covering every scenario this mission's section 10 requires (definite success/rejection, timeout before/after acceptance, response loss, rate limiting, search finding zero/one/multiple/wrong-recipient/mismatched-metadata/loosely-matched-but-wrong results) plus a no-hidden-retry check. **These tests validate this adapter's own logic against a controlled fake -- they are explicitly not provider evidence about Gmail's real behavior**, per this mission's own instruction.
- [`tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs`](../../tests/omnia-v9-gmail-effect-adapter-dispatch-recovery.test.mjs) -- 4 tests running this adapter through the real dispatcher and recovery worker against real PostgreSQL, including a checkpoint-C-shaped crash-injection test and a two-concurrent-recovery-worker race, proving this is a genuine drop-in replacement for `null-sink-v2.mjs`.

7 mutations applied directly to committed source (Message-ID binding removed, automatic send retry permitted, UNCERTAIN converted to NOT_FOUND, NOT_FOUND triggers immediate resend, multiple reconciliation matches accepted heuristically, recipient mismatch ignored, Gmail message identity verification ignored) -- all caught, all reverted; see [`V9_GMAIL_RECONCILIATION_REPORT.md`](./V9_GMAIL_RECONCILIATION_REPORT.md) for exact results.
