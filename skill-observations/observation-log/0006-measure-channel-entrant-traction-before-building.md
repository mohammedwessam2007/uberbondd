---
id: 6
title: Measure a channel's entrant success rate before building a product for it
status: open
type: methodology-gap
skill: [uberbond-orchestrator, wallbreaker]
proposes_skill: []
siblings_checked: [task-observer, find-skills, uberbond-capability-assimilator]
area: commercial-selection
date: 2026-11-15
session_context: Monetization Singularity session on ccr-0338b026-8du80h
parked_until: null
resolved: null
resolution: null
reference: artifacts/monetization-singularity/apify-store-observatory-2026-11-15.json; docs/monetization/MONETIZATION_SINGULARITY_2026-11-15.md section 4
---

**Issue**: In October a marketplace Actor was built from invention and adversarial debate, then left unpublished. A 14-request read of the public Store listing shows its category had 253 monthly users in total and that none of 34 young listings in it had reached 50 users. The same read shows email verification at 12.5% entrant traction against a store-wide 0.33%. That check costs minutes and no account, and it was not run before the build. IDs 3 to 5 are used by unmerged PRs #1538 and #1541, so this is numbered 6.

**Suggested improvement**: Before building for any marketplace, run `node scripts/apify-store-observatory.mjs --execute` (or the equivalent public listing read for that marketplace) and record, for the target niche: total recent users, number of young listings, and how many of those have traction. Do not build where the entrant rate is zero unless there is separate buyer evidence.

**Principle**: The base rate for a newcomer in the exact channel and niche is cheaper to measure than any product is to build, and it should be measured first.
