# OMNIA V9 Canary Contract

**This describes a future, not-yet-eligible state. Nothing in this document is activated by this mission. `OMNIA_V9_MODE` does not have an `enforce` or `canary` value — it is `off`, `shadow`, or `compare` only.**

## Eligibility (all required, none waived)

1. `node scripts/verify-v9-closure.mjs` is green against a real, freshly-provisioned disposable PostgreSQL instance.
2. `npm run test:deterministic` is green.
3. Compare mode has run against real UberBond traffic for a minimum observation count (recommend: at least 500 governed actions or 14 days, whichever is longer — this number should be revisited once real compare-mode data exists; it is a starting proposal, not a measured threshold).
4. Zero unresolved `LEGACY_DENY_V9_ALLOW` cases in that observation window.
5. V9 error rate below threshold (recommend: <1%, revisit once real latency/error data exists).
6. Founder-burden metrics (`founder_minutes_per_100_governed_actions`) are acceptable to Mohamed specifically — not to a formula.
7. Explicit human approval. Not a scheduled promotion, not a learning-system recommendation acted on automatically — a person types the config change.

Learning may recommend promotion (e.g., "compare-mode data now supports a canary" as a report finding). Learning may never execute it. There is no code path anywhere in this integration that changes `OMNIA_V9_MODE` from a running process.

## Scope, if and when a canary is approved

Bounded on every axis:

| Axis | Bound |
|---|---|
| Tenant | one specific, pre-named campaign/tenant, chosen by Mohamed |
| Action class | outbound email send only (the only integrated adapter) |
| Operation | `email.send`, initial sends only — no follow-ups, no replies |
| Blast radius | 1 (one recipient per action, as already enforced by the frozen kernel's `blastRadius` field) |
| Financial authority | zero — `maxCostUsd` capped at the adapter's existing fixed `0.25` ceiling, no payment adapter exists |
| Max actions | an explicit number set at canary start (recommend starting at 10, not a rate — a hard count) |
| Expiry | an explicit wall-clock expiry (recommend 48 hours), after which the canary approval lapses automatically regardless of action count |

## Rollback

`OMNIA_V9_MODE=off` (or removing the canary-specific approval, once that mechanism exists) immediately returns to pre-integration behavior. Historical shadow/compare evidence remains readable — nothing is deleted on rollback. Legacy send-safety, reservation, and idempotency logic remain authoritative underneath the canary at all times; the canary only ever adds a stricter gate in front of legacy, never a looser one (this is a direct consequence of the fail-closed design already verified in the two closure missions).

## Stop conditions (any one halts the canary immediately)

- Any `LEGACY_DENY_V9_ALLOW` observed during the canary window.
- Any V9 error during a canary-scoped decision.
- Any deviation between the canary's observed decision and what shadow/compare predicted for materially identical inputs.
- Mohamed says stop, for any reason, no justification required.

## Success criteria

- All canary-scoped actions completed within the declared max-actions and expiry bounds.
- Zero critical disagreements during the window.
- No legacy safety behavior change observed (sends that would have happened without V9 still happened; nothing new was blocked that legacy would have allowed, unless V9's stricter reason was independently confirmed correct by Mohamed).
- A written decision from Mohamed on whether to extend, expand, or roll back — this document does not pre-approve what happens after the canary.

## What this document is not

This is not an activation. Producing this contract is this mission's deliverable; approving and running the canary is explicitly out of scope (mission section 24: "Production readiness is not this mission").
