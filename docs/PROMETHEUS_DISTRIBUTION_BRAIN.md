# Prometheus Distribution Brain

> **V3 update (Wave 0 reconciliation)**: the duplication V2 disclosed is
> resolved. `src/distribution-channel.mjs` (the concurrent session's
> implementation) is canonical — it was already production-wired
> (`prometheus.distribution.allocate`) and gates ranking on a stricter,
> real property this session's allocator lacked: only outcomes with
> `truthLevel === 'CLEARED_PAYMENT'` count, versus any caller-shaped
> `{clearedRevenueUsd, costUsd}` object. `src/distribution-channel-registry.mjs`
> and `src/distribution-allocator.mjs` (this session's implementation) are
> deleted. Their one real advantage — a tiny-sample-overfitting confidence
> guard — was ported into `distribution-channel.mjs` as a new
> `sampleConfidence` field on each ranked plan, so a single lucky or
> cherry-picked outcome still can't imply real confidence, without
> loosening the payment-truth gate or changing which channels get ranked.
> See `docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md` for the full
> account. The core conclusion of this document is UNCHANGED and remains
> proven by the surviving implementation: with zero real historical
> outcomes anywhere in this system, the actual output today is
> `DO_NOT_DISTRIBUTE`, even with real budget and an available channel.

## Status: `PREPARATION CONTRACT BUILT; LIVE DISTRIBUTION STILL BUILD NOTHING`

The mission's own third invariant: *"Prometheus must be capable of
concluding BUILD NOTHING... If no channel has positive expected value,
choose DO_NOT_DISTRIBUTE."* Applied honestly here:

- Every distribution channel this repository could represent (direct
  outbound, partner, referral, Meta, Google, SEO, AEO/GEO, marketplace,
  affiliate, creator, community, retargeting) has **zero historical
  outcome data** in this codebase. Outbound itself is structurally disabled
  by every session boundary to date and has never sent a real message.
- A full live distribution system populated entirely with no verified
  cleared-payment outcomes, and an allocator whose only mathematically
  honest output is `DO_NOT_DISTRIBUTE` for every such input, must not be
  treated as live economics. The safe socket that exists:
  `src/distribution-channel.mjs` — normalizes channel contracts and
  returns `DO_NOT_DISTRIBUTE` until a cleared-payment outcome with
  measured margin and owner minutes exists, and now reports each ranked
  plan's `sampleConfidence` so a thin sample never reads as a confident
  winner.

## What exists today that a real allocator would need to compose with

Real and available for local preparation now:

- `src/founder-command-center.mjs`'s `checkoutReadiness` /
  `offerReadiness` tables already represent "is this offer/product ready
  to be distributed at all" — the actual current bottleneck (checkout not
  configured) is a distribution-*readiness* problem, not a channel-
  *selection* problem. Fixing that (an owner action, not engineering) is
  higher leverage than either allocator has to offer with nothing to
  allocate yet.
- `src/capability-graph.mjs` already has the shape needed to represent a
  channel's own build/live status the same way it represents any other
  capability.
- `src/distribution-channel.mjs` is deliberately not a send queue, ad
  buyer, provider adapter, or permission grant. Its ranked output never
  implies authorization to act.

## Explicit non-recommendation

Do not add live spend/send/provider behavior before real distribution data
exists and the owner authorizes the route. The allocator is intentionally
small and fail-closed; it is a preparation contract, not a claim that a
channel works. Revisit live allocation only after checkout, authorization,
and at least one real cleared-payment outcome exist.
