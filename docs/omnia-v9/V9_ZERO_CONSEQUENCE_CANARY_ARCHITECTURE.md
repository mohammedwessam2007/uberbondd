# OMNIA V9 Zero-Consequence Canary Architecture

## What this mission tests

Every prior mission tested whether V9 could **observe** correctly. This one tests something categorically different: can V9 be **authoritative** — can its decision actually gate whether an execution happens — without that authority ever being able to reach a real external system? The execution target is a deterministic, structurally Gmail-free null sink. If V9 cannot safely control a harmless target, it has no business controlling Gmail.

## The one new mode: `canary_null`

`OMNIA_V9_MODE`'s allowed set is now exactly `{off, shadow, compare, canary_null}` — [`src/omnia-v9/integrations/config.mjs`](../../src/omnia-v9/integrations/config.mjs). There is still no `enforce`, `production`, or `autonomous` value anywhere in this codebase. Unknown values still resolve to `off`.

**`canary_null` has zero effect on the real send path.** [`resolveOutboundFinalAdmissionHook()`](../../src/omnia-v9/integrations/outbound-admission.mjs) — the only function that can make `src/pipeline.mjs` consult V9 at all — activates for exactly `mode === 'shadow' || mode === 'compare'`. `canary_null` is not in that check, so selecting it produces `null`, identical to `off`, at the real Gmail integration point. This is verified directly: `tests/omnia-v9-canary-failure-drills.test.mjs`'s kill-switch tests assert `resolveOutboundFinalAdmissionHook({ mode: 'canary_null', store })` returns `null`.

`canary_null` lives entirely in a separate, parallel execution path that never touches `pipeline.mjs`, `gmail.mjs`, or any provider credential.

## Execution separation, not a conditional

The mission's explicit requirement: don't gate Gmail-reachability with an `if (mode === 'canary_null')` inside the existing send path. Instead, build a structurally separate sink.

```
                    LEGACY / REAL SEND PATH (unchanged, untouched)
prospect → Pipeline.maybeSend() → sendEmail() → gmail.mjs → Gmail API

                    CANARY_NULL PATH (new, fully separate)
canary intent → evaluateAndGateCanaryNull() → NullConsequenceAdapter.execute()
```

[`src/omnia-v9/integrations/null-consequence-adapter.mjs`](../../src/omnia-v9/integrations/null-consequence-adapter.mjs) imports only `../canonical.mjs`, which imports only `node:crypto`. Its entire transitive import graph contains no Gmail module, no network-capable Node builtin (`http`, `https`, `net`, `tls`, `dgram`, `dns`), and no credential-shaped identifier. This is proven by **static import-graph inspection**, not just runtime behavior: `tests/omnia-v9-null-consequence-adapter.test.mjs` walks every `import` statement transitively from the adapter file and asserts none of them can reach a network-capable module. The result it records is `NULL_SINK_ACCEPTED` — deliberately never `EMAIL_SENT` or `DELIVERED`, because those words would claim an effect that never occurred.

## Canary approvals: a structurally distinct authority class

[`src/omnia-v9/integrations/canary-approval.mjs`](../../src/omnia-v9/integrations/canary-approval.mjs) issues real, signed, Postgres-persisted `OWNER_APPROVAL` objects (the same frozen P0/P1 shape every other V9 approval uses) locked to two fields the caller cannot override:

- **operation**: always `outbound.null_execute`, never `email.send`.
- **effectClass**: always `WRITE_INTERNAL`, never `COMMUNICATE_EXTERNAL` (the effect class every real outbound email intent declares).

Both are checked by the frozen kernel's `approvalCoversIntent()` on every admission call — the same function every other V9 approval is checked against. A canary approval that somehow ended up in front of a real `email.send` intent would fail `scope:operation` and `scope:effect` simultaneously, independent of tenant, purpose, or resource matching. Eight separate attenuation attacks (operation, purpose, resource, effect-class, tenant, capability, policy, constitution substitution) are tested in `tests/omnia-v9-canary-authority-attenuation.test.mjs` — all fail to make a canary approval cover a real send.

## The authoritative gate

[`src/omnia-v9/integrations/canary-null-authority.mjs`](../../src/omnia-v9/integrations/canary-null-authority.mjs) is the first place in this codebase where a V9 decision controls whether *anything* executes. Its gating logic (`classifyCanaryGateOutcome`) is an explicit enumeration:

```js
export const CANARY_EXECUTABLE_DECISIONS = new Set(['ALLOW']);
export const CANARY_KNOWN_NO_EXECUTION_DECISIONS = new Set(['DENY', 'REVIEW', 'INCOMPLETE', 'ERROR']);
```

`ALLOW` is the *only* value that executes. Every other named decision, and any value this module has never seen, resolves to `executed: false` through the same code path — there is no default-allow branch, no truthy check, no `!== 'DENY'` shortcut. Unit-tested against all five named decisions plus a battery of garbage inputs (`'allow'`, `'MAYBE'`, `''`, `null`, `undefined`, `0`, `{}`, `[]`, `'ALLOW '`).

**ALLOW alone is necessary but not sufficient to execute.** `admitAction()`'s ALLOW reflects a point-in-time snapshot of approval usage; it does not itself reserve anything. Before the sink is ever called, `evaluateAndGateCanaryNull()` durably reserves the approval's authority via the frozen, already-concurrency-proven `OmniaV9ProofStore.reserveAuthority()` — the exact same atomic mechanism every other V9 approval in this codebase uses. Only a successful reservation authorizes execution; a reservation denial (budget exhausted, contention lost) converts an ALLOW decision into a no-execution outcome. This reservation-then-execute ordering is what makes the double-spend and idempotency guarantees in [`V9_CANARY_CONCURRENCY_REPORT.md`](./V9_CANARY_CONCURRENCY_REPORT.md) real rather than assumed.

## Real Cedar, real Postgres, real receipts

- **Cedar**: the same `bindRealCedarAuthority()` this mission's prior reality-shadow work built — real `@cedar-policy/cedar-wasm@4.12.0`, real bound constitution, real policy bundle. No stub authorizer anywhere in the authoritative canary tests.
- **PostgreSQL**: every concurrency-sensitive test (double-spend, idempotency, contradictory receipt, conflicting authorization, revocation race, expiry race) runs against a genuine PostgreSQL 16 server, not PGlite — PGlite cannot exercise true multi-connection concurrency, and this mission explicitly requires certifying authoritative behavior against a real server.
- **Receipts**: [`src/omnia-v9/integrations/canary-receipt-store.mjs`](../../src/omnia-v9/integrations/canary-receipt-store.mjs) + [`migrations/010_omnia_v9_canary_null_receipts.sql`](../../migrations/010_omnia_v9_canary_null_receipts.sql) — a small, additive, non-frozen table with a real `PRIMARY KEY` on `reservation_id`, giving exactly one durable receipt per reservation and rejecting (not silently overwriting) a contradictory result or a conflicting authorization bound to the same reservation.

This is deliberately **not** the frozen P5–P9 execution-receipt machinery, which is shaped around a real Gmail pre/post-effect boundary (`preEffectContextDigest`, `preEffectObservationDigest`) that has no natural equivalent for a null-sink action. Reusing it here would have meant forcing a fit rather than building the right-sized thing; this table provides exactly the properties this mission's drills need and nothing more.

## What is deliberately not built

No enforce mode. No real send integration. No general admin platform for approvals. No V10. See [`V9_REAL_OUTBOUND_CANARY_ELIGIBILITY.md`](./V9_REAL_OUTBOUND_CANARY_ELIGIBILITY.md) for what a real-send canary would still need — none of it exists yet, and this mission does not build it.
