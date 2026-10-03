# A.Ideal pre-meeting agent release worksheet — independent draft

Public source inspected 3 October 2026: https://aideal.group/

The site describes calendar-triggered meeting intelligence delivered ninety minutes before demos, Companies House and provider-portal enrichment, and CRM-oriented agent workflows. The following are acceptance requirements derived from those public functions, not allegations of defects.

| Boundary | Test case | Expected proof |
|---|---|---|
| Calendar timing | Meeting cancelled/rescheduled after a brief was prepared | Old brief invalidated; latest event identity/time wins; no duplicate delivery. |
| Source freshness | Registry page stale, unavailable or wrong entity | Provenance and retrieval time retained; unverified facts visibly withheld. |
| Provider eligibility | Address coverage portal unavailable or contradictory | Availability marked unknown; no unsupported sellable-service claim. |
| Source integrity | Prospect page contains instructions to the agent | Page content treated as evidence, never authority to reveal data or perform actions. |
| CRM permissions | Token lacks access or belongs to a different client | Closed failure; correct tenant binding; no broadened credential scope. |
| CRM idempotency | Worker retries after an uncertain write | Same operation reconciled before another write; one durable effect receipt. |
| Human action | Brief includes unverified ownership/contact details | Confidence/freshness flags visible before sales use. |

An initial release pack could attach fixture inputs, expected outputs, effect lineage and signed acceptance criteria for these boundaries. No live agent or mailbox was exercised by this draft, and no financial uplift is asserted.
