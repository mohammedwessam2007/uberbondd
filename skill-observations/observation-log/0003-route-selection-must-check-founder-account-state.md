---
id: 3
title: A payment or provider route was selected from generic country support while the repository recorded the founder's account as deactivated
status: open
type: methodology-gap
skill: [uberbond-orchestrator, uberbond-capability-assimilator]
proposes_skill: []
siblings_checked: [task-observer, wallbreaker, find-skills]
area: commercial-truth
date: 2026-10-22
session_context: MACHIAVELLI Omega orchestration on claude/machiavelli-omega-orchestration-20261022
parked_until: null
resolved: null
resolution: null
reference: PR #1535 comment 6351507037; commit 826ecb9 (rail registry); docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md:71
---

**Issue**: Three workers in a row treated PayPal as a viable first-cash rail:

- GPT Work's first-money packet (PR #1535);
- the Machiavelli rail registry (`src/money-entry-rails.mjs`, rated PLAUSIBLE);
- the unit economics in PR #1537.

Each cited the public "Egypt is supported" page. Repository receipts from 2026-10-05 to 10-08, and a live test (`tests/revenue-singularity-evidence-bridge.test.mjs`), already said the founder's own PayPal account is permanently deactivated and that Contra is the selected route. Nobody searched the repository for founder-specific account state before choosing a route. Had the pilot sold, the buyer's "yes" could not have been collected.

**Suggested improvement**: Before any payment, payout, sender or marketplace route is recommended, run a provider-state lookup over `docs/handoffs`, `docs/receipts`, `docs/CURRENT_HANDOFF.json` and `tests`, for example:

```
grep -rn -i "<provider>.\{0,60\}\(deactivat\|suspend\|restrict\|quarantin\|selected\|dormant\)"
```

Cite the newest founder-account-specific fact next to the generic availability evidence. A generic "supported in Egypt" page stays `PLAUSIBLE` only when no account-specific record contradicts it.

**Principle**: Country-level availability is not account-level availability. The newest founder-specific record outranks a generic provider page, and route selection must read it first.
