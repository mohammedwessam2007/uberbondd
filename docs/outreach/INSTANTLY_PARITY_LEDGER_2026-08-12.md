# UberBond outreach parity ledger

Status checked: 2026-08-12.

This ledger compares the owner-only UberBond workbench with the current official Instantly surface. It is a product-coverage map, not a claim that UberBond is an Instantly API-compatible replacement. “Plan-only” means the feature is intentionally local and produces no provider call.

Reference surface: [Instantly overview](https://help.instantly.ai/en/articles/6221655-what-is-instantly), [cold-email strategy](https://help.instantly.ai/en/articles/5975326-instantly-cold-email-strategy), [API index](https://developer.instantly.ai/llms.txt), [plans](https://help.instantly.ai/en/articles/10273259-instantly-plans-overview), and [A/Z testing](https://help.instantly.ai/en/articles/6661549-a-z-testing-how-to-create-email-variants).

| Instantly job | UberBond coverage | Boundary |
|---|---|---|
| Campaign builder, steps, delays, schedules | Implemented | Up to 12 steps; minute/hour/day waits; owner review remains required. |
| Variables, conditional content, Spintax, preview/test | Implemented | Evidence-bound tags plus bounded custom variables; deterministic local rendering. |
| A/Z variants and optimization | Implemented | Up to 26 enabled/disabled variants; analytics and recommendation/apply plan; applying a plan resets campaign approval. |
| Lead import, research, verification, segmentation | Implemented/edge-covered | JSON/CSV import, discovery, site research, contact verification, tags, lead lists, CRM stages, evidence-ranked search and an evidence-supply queue. No external SuperSearch index. |
| Unified inbox and reply workflow | Implemented | Stored threads, read state, owner-reviewed reply drafts; no autonomous reply send. |
| OOO, bounce, complaint, unsubscribe handling | Implemented | Automatic replies, suppression, conservative stop state, health pause, and authenticated provider-event ingestion. Date-aware automatic resume is not inferred. |
| Automations | Implemented/partial | Event-to-action previews and safe event ingestion; no autonomous commercial mutation or general workflow marketplace. |
| Open/click/reply/bounce analytics | Implemented/partial | Local message fields plus normalized owner-authenticated events; provider tracking/webhooks must be configured deliberately. |
| Sender accounts, rotation, warmup, domain tests | Edge-covered/partial | Bounded provider-aware sender mesh, sticky assignment, capacity ranking, health holds and conservative ramp plans exist. UberBond still does not claim Instantly's account fleet or warmup network. |
| Inbox placement tests | Edge-covered/plan-only | Local authentication/health preflight and explicit provider-placement adapter boundary are visible. No provider placement result is fabricated. |
| AI enrichment, reply agent, inbox manager, sales agent | Edge-covered/partial | Existing AI audit path plus an owner copilot for ranking, classification, drafts and stops; negotiation, sending and payment claims remain gated. |
| Website visitor identification | Not implemented | No visitor identity provider or enrichment is enabled. |
| API, webhooks, exports, duplication, lifecycle controls | Implemented/partial | Owner-authenticated JSON endpoints, event ingestion, campaign export/duplicate/pause/resume, dry-run, and audit logs exist. No Instantly endpoint compatibility promise. |
| Billing, credits, agencies, multi-seat workspace | Deliberately out of scope | UberBond is a single-owner/free-core workspace; it has no recurring outreach SaaS billing or credit metering. |

## Edge upgrade

The owner workbench now exposes one edge plan combining sender routing, deliverability readiness, evidence supply and safe copilot actions. It is designed to make UberBond better at the founder's real decision loop while keeping Instantly's raw network-scale advantages explicit. The edge plan is local, deterministic and reports zero provider calls.

## Safety rule

No parity item above creates live authority by itself. A live Gmail step still requires current route evidence, exact signed approval, suppression and cooldown admission, recipient/time/evidence checks, a durable idempotency reservation, and authoritative V9 consequence admission. Generic unsolicited commercial Gmail outreach remains denied by the provider-policy boundary.

The known Innovate By Day application is a prior-contact artifact and must not be resent. The edited email block remains the source of truth for any future owner-reviewed documentation; this implementation does not send or recreate it.
