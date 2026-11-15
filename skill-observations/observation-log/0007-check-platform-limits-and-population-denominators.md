---
id: 7
title: Check platform network limits in competitors' docs, and measure rates over the full population
status: open
type: methodology-gap
skill: [uberbond-orchestrator, wallbreaker]
proposes_skill: []
siblings_checked: [task-observer]
area: commercial-selection
date: 2026-11-15
session_context: Monetization Singularity session on ccr-0338b026-8du80h, after the Apify live test
parked_until: null
resolved: null
resolution: null
reference: artifacts/monetization-singularity/apify-live-test-2026-11-15.json; artifacts/monetization-singularity/apify-niche-full-search-2026-11-15.json
---

**Issue**: An email verifier was built for Apify on a 75% belief that outbound port 25 was open. It is not, and several competing READMEs on the same Store say so. One search that surfaced a single contrary claim was treated as sufficient. Separately, niche entrant rates were computed inside a popular-only sample, which dropped hundreds of young zero-user listings. That inflated the chosen niche's rate from 2.7% to 12.5%.

**Suggested improvement**: Before building for a platform, read at least five competitor READMEs in the same niche for platform limits (ports, proxies, memory, bans) and run the cheapest live probe of the one capability the product cannot work without. Compute any base rate over the full population that a newcomer joins, not over a sample selected by success. `scripts/apify-store-observatory.mjs --full-search` now does this for the Apify Store.

**Principle**: A rate is only as good as its denominator. A sample chosen by popularity cannot estimate a newcomer's odds.
