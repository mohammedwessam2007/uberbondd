---
id: 5
title: Probe an API's pagination ceiling before pre-registering "full enumeration"
status: open
type: methodology-gap
skill: [uberbond-orchestrator]
proposes_skill: []
siblings_checked: [task-observer, agent-reach]
area: research
date: 2026-10-22
session_context: Machiavelli money hunt X2 (Apify Store) on claude/machiavelli-money-hunt-20261022
parked_until: null
resolved: null
resolution: null
reference: amendments X2-A1, X2-A2 in artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json
---

**Issue**: X2 pre-registered full pagination of the public Apify Store. The API silently returns no items at offset >= 15,000 for every sort order, and it reports items it never returns. The first run read 12% of the listing, and two amendments followed. Both were registered before their runs, but each came after partial results had been seen, which weakens the experiment. Also, the FAC API's shared DEMO_KEY was rate-limited, while a keyless bulk CSV existed all along.

**Suggested improvement**: Before registering any experiment that enumerates an external listing:
1. request a page at a high offset for each candidate sort order and record where results stop;
2. compare items per page with the page size to measure hidden items;
3. look for a bulk download before relying on a rate-limited API.

Then put the measured ceiling and the completeness rule into the registration itself.

**Principle**: A data source's access limits are part of an experiment's design; measure them before the registration, not after the first run.
