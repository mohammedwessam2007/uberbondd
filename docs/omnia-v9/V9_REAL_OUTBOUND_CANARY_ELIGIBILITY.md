# OMNIA V9 Real Outbound Canary Eligibility

## Result: `REAL_OUTBOUND_CANARY_NOT_ELIGIBLE`

This is a **design-only assessment**. No real outbound canary is executed in this mission regardless of this result, per explicit instruction. `V9_ZERO_CONSEQUENCE_CANARY_VERIFIED` (this mission's actual gate result) does not imply real-outbound eligibility — they are different questions, deliberately kept separate.

## Criteria and status

| Criterion | Status | Detail |
|---|---|---|
| Zero-consequence authoritative canary green | **MET** | `V9_ZERO_CONSEQUENCE_CANARY_VERIFIED` — see [`V9_ZERO_CONSEQUENCE_CANARY_REPORT.md`](./V9_ZERO_CONSEQUENCE_CANARY_REPORT.md) |
| Meaningful `REAL_PUBLIC_INPUT` or real operational sample | **NOT MET** | 0 in this environment, honestly reported — see "Data availability" in the same report |
| Zero unresolved false allows | **MET** | 0 `LEGACY_DENY_V9_ALLOW` across all 36 canary candidates and every prior mission's replay/reality-shadow work |
| Bounded owner approval design | **MET** | Canary approvals already demonstrate real, signed, revocable, expirable, structurally-locked bounded authority; the same mechanism generalizes |
| Explicit owner authorization | **NOT MET** | Mohamed has not reviewed or approved a real-send canary; this mission does not solicit that approval, only notes its absence |
| Rollback plan | **NOT MET** | No rollback plan specific to a real, already-sent email exists (a null-sink execution has nothing to roll back; a real send does) |
| Provider isolation | **NOT MET** | No Gmail sandbox/test-mode, rate-limit-aware, or provider-error-taxonomy design exists for a real-send adapter |
| Maximum 1–5 real actions for a future canary | **NOT ASSESSED** | Moot until the blocking items below are resolved |
| Existing legacy send safety remains underneath | **MET** | Untouched throughout this and prior missions; `src/send-safety.mjs` and the legacy eligibility path are unmodified |

**4 of 9 criteria unmet or not assessable.** `REAL_OUTBOUND_CANARY_NOT_ELIGIBLE` follows directly.

## The one finding that would block eligibility even if the others were resolved

[`V9_CANARY_CRASH_RECOVERY_REPORT.md`](./V9_CANARY_CRASH_RECOVERY_REPORT.md)'s checkpoint C: recovery cannot distinguish "the sink already fired, only the receipt write crashed" from "the sink never fired," using only reservation and receipt state. For the null sink this is harmless. **For a real Gmail send, this exact gap is an unresolved double-send risk** — a process crash between calling `sendEmail()` and persisting its receipt would, under this same recovery logic, cause a second real email to go out on recovery. This is not a hypothetical concern invented for this document; it is a gap this mission's own crash-recovery drill produced and measured directly.

Before any real-send canary is even designed, this needs one of the three mitigations already named in the crash-recovery report: a durable "execution attempted" marker written before the send call, provider-side idempotency (a client-supplied key the provider itself deduplicates on), or a transactional design collapsing reservation + send + receipt into one unit wherever the provider API allows it. None of these exist in this codebase today.

## What real-outbound eligibility would require, concretely

1. **Fix the crash-recovery gap** above — with its own dedicated drill proving a simulated crash-and-restart around a real (or realistically mocked) send call never double-sends.
2. **A real or meaningfully real operational sample** — this cannot be manufactured; it requires either real UberBond campaign data existing in the deployment environment, or an explicit, owner-approved decision to run against a small number of real prospects under full supervision.
3. **Explicit, written owner authorization** naming the specific scope (which campaign, how many actions, what the rollback trigger is) — not implied by this mission's existence.
4. **A rollback/mitigation plan** for the case where a real send happens that shouldn't have (e.g. an unsubscribe-if-possible path, a customer-facing correction template, a hard stop on the campaign).
5. **Provider isolation design** — at minimum, understanding Gmail's own rate limits and error taxonomy well enough to know what "the provider itself rejected this, don't retry" looks like versus "transient failure, safe to retry" versus "ambiguous, do not retry."
6. **A tiny, explicit action cap** (1–5 real actions) for the first real canary, with a human reviewing every single one before the next is attempted.

## What this document does not do

It does not request owner approval — that is Mohamed's decision, not something this mission solicits on his behalf. It does not build any of the six items above. It does not soften the crash-recovery finding to make eligibility look closer than it is. The honest state is: the zero-consequence mechanism works, and real-outbound readiness has a short, concrete, currently-unaddressed list standing between here and there.
