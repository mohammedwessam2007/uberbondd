# Prometheus Distribution Brain

> **V2 update**: the channel registry and allocator described as deferred
> below are now real — `src/distribution-channel-registry.mjs` and
> `src/distribution-allocator.mjs`, tested. The core conclusion of this
> document is UNCHANGED and was proven, not just argued: with zero real
> historical outcomes anywhere in this system, the allocator's actual
> output today is `DO_NOTHING`, even with real budget and an available
> channel (see `tests/distribution-brain.test.mjs`). A separate test
> proves the mechanism isn't rigged to always say no — a genuinely large,
> positive real sample size can win. `BUILD NOTHING` was and remains the
> correct call for actually *acting* on distribution; building the honest
> decision *mechanism* was the right call, and is now done.

## Status (V1): `BUILD NOTHING` this wave, and that is the correct call

The mission's own third invariant: *"Prometheus must be capable of
concluding BUILD NOTHING... If no channel has positive expected value,
choose DO_NOT_DISTRIBUTE."* Applied honestly here:

- Every distribution channel this repository could represent (direct
  outbound, partner, referral, Meta, Google, SEO, AEO/GEO, marketplace,
  affiliate, creator, community, retargeting) has **zero historical
  outcome data** in this codebase. Outbound itself is structurally disabled
  by every session boundary to date and has never sent a real message.
- A `DistributionChannelRegistry` populated entirely with
  `availability: false` / `historicalOutcomes: []` entries, and an
  allocator whose only mathematically honest output is `DO NOTHING` for
  every input, is not a meaningless exercise to build — but it *is* lower
  priority than the real gaps already closed this wave (PostgresStore live
  proof, branch reconciliation), per the mission's own stated priority
  order (`correctness gaps > existing-code reconciliation > canonical data
  contracts > ingestion > opportunity intelligence > capability graph >
  experiment compiler > distribution brain`). Distribution brain is
  priority 8; this wave did not reach it after fully executing priorities
  1–6.

## What exists today that a real allocator would need to compose with

Not built this wave, but real and available if/when this is prioritized:

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

## Explicit non-recommendation

Do not build the Distribution Value Estimator (Wave 19) or Autonomous
Distribution Allocator (Wave 20) before real distribution data exists
anywhere in this system. Building them now would produce a system that
always outputs `DO NOTHING` with `confidence: 0` for every input — which
is the mathematically correct answer today, but a static function
returning a constant is not worth the maintenance surface of a full
allocator module. Revisit when outbound (or any channel) is authorized to
run live and produces its first real outcomes.
