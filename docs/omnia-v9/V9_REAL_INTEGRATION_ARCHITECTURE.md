# OMNIA V9 Real Integration Architecture

## Scope

One integration point: UberBond's outbound email send path, at the exact boundary that already existed for this purpose (`src/omnia-v9/final-admission-shadow.mjs`, wired from `src/pipeline.mjs`). Nothing else — not payments, not discovery, not the queue, not Gmail itself.

## Why this boundary

`Pipeline.maybeSend()` already:
1. Evaluates legacy send eligibility (`evaluateSendEligibility` in `src/send-safety.mjs`).
2. Makes a durable, idempotency-keyed reservation (`store.reserveOutboundSend`).
3. Marks the reservation `dispatching`.
4. **(pre-existing seam)** Builds a shadow context and calls an injectable hook (`buildOutboundShadowContext` / `observeOutboundFinalAdmission`).
5. Calls Gmail.

Step 4 already existed before this mission, with the hook defaulting to `null` (a harmless `NO_HOOK` log entry, zero consequence). This integration's entire job was to build a real hook and decide when to wire it in — not to invent a new interception point.

## Components added this mission

All under `src/omnia-v9/integrations/` — none of them touch the frozen P0–P9 core:

- **`config.mjs`** — `resolveOmniaV9Mode(env)`. Reads `OMNIA_V9_MODE` once. Unknown/empty/malformed → `'off'`. No code path can promote this value at runtime; it is read from `process.env` exactly once at process start in `worker.mjs`/`server.mjs`.
- **`outbound-admission.mjs`** — `deriveOutboundActionIntent`, `evaluateOutboundAdmission`, `createOutboundAdmissionHook`, `resolveOutboundFinalAdmissionHook`. Builds a P0 `ActionIntent` + `Evidence` record from the existing shadow context (not from raw prospect/campaign objects — the adapter only sees the same summarized, already-redacted context the pre-existing shadow module builds), calls the frozen `admitAction`, and returns a decision. **Never imports anything Gmail-related. Never mutates reservation or send state.**
- **`compare.mjs`** — `classifyComparison`, the exact six-category classifier the mission specifies.
- **`metrics.mjs`** — pure aggregation functions over already-fetched audit-log arrays (confusion matrix, shadow reliability, founder-burden estimate, latency percentiles). Deduplicates by `reservationId` so idempotent retries can never double-count.
- **`replay-scenarios.mjs` / `replay.mjs`** — offline, synthetic scenario generation and execution (see `V9_REPLAY_REPORT.md`).

## Two additive, non-core changes

1. **`src/omnia-v9/final-admission-shadow.mjs`**: `buildOutboundShadowContext` gained one optional parameter, `legacyEligibility`, populated into `legacySignals.legacyEligible` / `legacySignals.legacyReason`. Backward compatible — omitting it behaves exactly as before. Required so compare mode can classify without re-deriving legacy's decision itself (which would risk drifting from the real check).
2. **`src/pipeline.mjs`**: one line, passing the already-computed `eligibility` object into the call above. No new computation, no new database call, no change to control flow.

Both are classified as **integration glue**, not frozen core, per `OMNIA_V9_FROZEN_BASELINE.md`.

## Mode wiring

`worker.mjs` and `server.mjs` each gained three lines: resolve the mode, log it once at startup, and pass `resolveOutboundFinalAdmissionHook({ mode, store })` as `Pipeline`'s `outboundFinalAdmissionShadow` option. In `off` mode this resolves to `null` — the exact pre-integration behavior. In `shadow` or `compare` mode it resolves to a real hook.

## What legacy behavior is preserved, verbatim

- Send eligibility, reservation, dispatch marking, Gmail call, receipt recording, follow-up scheduling, reply polling, suppression handling — **zero lines changed** in any of that logic.
- The hook is called, and its result is logged, entirely inside the pre-existing `observeOutboundFinalAdmission`, which already: never throws (catches hook exceptions into a `SHADOW_ERROR` observation), never returns anything the caller uses to affect the send, and already had this exact contract before this mission.
- If `store.log()` itself fails, `observeOutboundFinalAdmission` swallows that too (`try { await store?.log?.(...) } catch {}`) — pre-existing behavior, unchanged.

## What is deliberately NOT built (and why)

- **No enforcement.** `OMNIA_V9_MODE` has no `enforce` or `canary` value. Section 2 of the mission forbids it in this pass.
- **No new database tables.** Shadow and compare observations reuse the existing generic `audit_log` table via `store.log()` / `store.list('auditLog', ...)`. This keeps the integration's storage footprint at zero migrations.
- **No real Cedar invocation per decision.** `evaluateOutboundAdmission`'s default `policyAuthorizer` returns `REVIEW` (fail-closed placeholder). Wiring live Cedar evaluation into production traffic is a `REQUIRED_LATER` item (see `V9_COMPLEXITY_AUDIT.md`) gated on real owner-issued approvals existing at all — there is no value in evaluating a live policy against zero real authority.
- **No owner-approval issuance flow.** This is the single largest reason V9's real-world decisions will mostly be `REVIEW`/`V9_INCOMPLETE` right now, and it's stated plainly rather than hidden.

## Known structural limitation of this integration point

The shadow hook fires *after* `evaluateSendEligibility` has already returned `ok: true` — `maybeSend()` returns early on `ok: false` before reaching the hook. This means, **at this exact boundary**, legacy's decision is always "ALLOW" by construction; `BOTH_DENY` and `LEGACY_DENY_V9_ALLOW` cannot occur in live shadow/compare data from this integration point. Instrumenting the eligibility-DENY path too was considered and deliberately not done this mission — it would require building a shadow context without a real reservation (the eligibility check runs before reservation), which is a materially larger change to a path this mission was scoped to observe, not modify. The replay harness (`V9_REPLAY_REPORT.md`) exercises both directions synthetically to compensate, and is honest about doing so.

## Data flow diagram

```
Prospect ready for send
        |
        v
evaluateSendEligibility()  <-- legacy, UNCHANGED, still authoritative
        |  ok:false -> return (V9 never sees this path)
        |  ok:true
        v
store.reserveOutboundSend()  <-- legacy, UNCHANGED
        |
        v
buildOutboundShadowContext({ ..., legacyEligibility })  <-- +1 param, additive
        |
        v
observeOutboundFinalAdmission({ hook, store, context })  <-- UNCHANGED, pre-existing
        |
        +-- hook == null (mode=off)              -> NO_HOOK log, zero effect
        +-- hook == outboundAdmissionHook          -> evaluateOutboundAdmission()
              |                                         |
              |                                         v
              |                                admitAction() [FROZEN P0 kernel]
              |                                         |
              |                                         v
              |                                 { decision, reasons, digests }
              |
              +-- mode=shadow: log omnia_v9_outbound_final_shadow, stop
              +-- mode=compare: also classify + log omnia_v9_outbound_compare
        |
        v
sendEmailFn()  <-- legacy, UNCHANGED, always runs regardless of V9's decision
```
