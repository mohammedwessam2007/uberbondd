# Prometheus Distribution Brain

## Status: `PREPARATION CONTRACT BUILT; LIVE DISTRIBUTION STILL `BUILD NOTHING``

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
  every input, must not be treated as live economics. The safe socket is now
  present in `src/distribution-channel.mjs`: it normalizes channel contracts,
  ignores unverified outcomes, and returns `DO_NOT_DISTRIBUTE` until a
  cleared-payment outcome with measured margin and owner minutes exists.

## What exists today that a real allocator would need to compose with

Real and available for local preparation now:

- `src/founder-command-center.mjs`'s `checkoutReadiness` /
  `offerReadiness` tables already represent "is this offer/product ready
  to be distributed at all" — the actual current bottleneck (checkout not
  configured) is a distribution-*readiness* problem, not a channel-
  *selection* problem. Fixing that (an owner action, not engineering) is
  higher leverage than building an allocator with nothing to allocate.
- `src/capability-graph.mjs` already has the shape needed to represent a
  channel's own build/live status the same way it represents any other
  capability, if a `DistributionChannelRegistry` is built later — no new
  status vocabulary would be needed.
- `src/distribution-channel.mjs` is the bounded registry/allocator. It is
  deliberately not a send queue, ad buyer, provider adapter, or permission
  grant. Its ranked output remains `PREPARE_ONLY_RANKED` even when historical
  cleared-payment evidence is supplied.

## Explicit non-recommendation

Do not add live spend/send/provider behavior before real distribution data
exists and the owner authorizes the route. The current allocator is
intentionally small and fail-closed; it is a preparation contract, not a
claim that a channel works. Revisit live allocation only after checkout,
authorization, and at least one real cleared-payment outcome exist.
