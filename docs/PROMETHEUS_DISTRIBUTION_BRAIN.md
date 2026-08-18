# Prometheus Distribution Brain

> **V2 update (merged from two concurrent sessions)**: two independent,
> real distribution channel registries/allocators were built this wave —
> `src/distribution-channel-registry.mjs` + `src/distribution-allocator.mjs`
> (this session) and `src/distribution-channel.mjs` (a concurrent session).
> Both are tested, both compose with the founder command center and
> capability graph described below, and neither has been chosen as
> canonical yet — see `docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md`.
> The core conclusion of this document is UNCHANGED and was proven by
> BOTH implementations independently, not just argued: with zero real
> historical outcomes anywhere in this system, the actual output today is
> `DO_NOTHING`/`DO_NOT_DISTRIBUTE`, even with real budget and an available
> channel. A separate test on this session's allocator proves the
> mechanism isn't rigged to always say no — a genuinely large, positive
> real sample size can win. `BUILD NOTHING` was and remains the correct
> call for actually *acting* on distribution; building the honest decision
> *mechanism* was the right call on both sides, and is now done twice.

## Status: `PREPARATION CONTRACTS BUILT (x2); LIVE DISTRIBUTION STILL BUILD NOTHING`

The mission's own third invariant: *"Prometheus must be capable of
concluding BUILD NOTHING... If no channel has positive expected value,
choose DO_NOT_DISTRIBUTE."* Applied honestly here:

- Every distribution channel this repository could represent (direct
  outbound, partner, referral, Meta, Google, SEO, AEO/GEO, marketplace,
  affiliate, creator, community, retargeting) has **zero historical
  outcome data** in this codebase. Outbound itself is structurally disabled
  by every session boundary to date and has never sent a real message.
- A full live distribution system populated entirely with
  `availability: false` / `historicalOutcomes: []` entries, and an
  allocator whose only mathematically honest output is `DO NOTHING` for
  every input, must not be treated as live economics. Two safe sockets now
  exist: `src/distribution-allocator.mjs` (this session, ranks real
  historical outcomes when they exist, `DO_NOTHING` otherwise) and
  `src/distribution-channel.mjs` (concurrent session, normalizes channel
  contracts and returns `DO_NOT_DISTRIBUTE` until a cleared-payment outcome
  with measured margin and owner minutes exists).

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
- Both `src/distribution-allocator.mjs` and `src/distribution-channel.mjs`
  are deliberately not a send queue, ad buyer, provider adapter, or
  permission grant. Neither's ranked output implies authorization to act.

## Explicit non-recommendation

Do not add live spend/send/provider behavior before real distribution data
exists and the owner authorizes the route. Both allocators are
intentionally small and fail-closed; each is a preparation contract, not a
claim that a channel works. Revisit live allocation only after checkout,
authorization, and at least one real cleared-payment outcome exist — and
after the two implementations are reconciled into one
(`docs/PROMETHEUS_PARALLEL_SPINE_RECONCILIATION.md`), so a future live
integration doesn't have to pick between two independently-evolving
allocators.
