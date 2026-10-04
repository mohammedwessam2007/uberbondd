# Revenue Singularity / G-SPOT / Revenue Constellation — coverage ledger (checkpoint 2)

Branch `claude/revenue-singularity-mission` off `origin/main` 1c00e56. Issue #1188.
Truth class: INTERNAL_PROGRESS. External effects this session: none (no send, spend, deploy, DNS, credential change or customer contact).
NOT terminal: PR/CI/merge, live Render reconciliation, deploy and live verification are still open.

Status: DONE = implemented, wired through `server-core.mjs`, hostile-tested · REUSE = existing main module composed, not duplicated · OPEN = not done · OWNER = needs an owner/external gate.

| # | Aspiration | Status | Where / evidence |
|---|---|---|---|
| 1 | Secure persistent owner session | DONE | `src/owner-session.mjs`, `/api/owner-session/*`, `public/owner-session.js`. 32 unit/static tests; local curl E2E; real Chromium: token typed once, a fresh page and `/ops.html` then connected with no token, badge shown |
| 2 | G-SPOT durable one-button orchestrator | DONE | `src/gspot.mjs` (stage evidence gates, no skipping, exact-batch digest authority, single-use, reserve-before-effect, uncertain≠retry, crash resume, halt on human reply). `/api/revenue/gspot/*`. Dispatch is **dry run only**: live dispatch is deliberately not bound |
| 3 | Money Queue + UberDemand / explicit demand / switch windows / signal stacking / half-life / explainable rank | DONE | `src/money-queue.mjs`; `POST /api/revenue/demand-signals` (public-URL evidence required, future-dated refused) |
| 4 | Qualification / verification / buyer resolution | REUSE | `prospect-qualification-pipeline`, `uberoutbound-recipient-eligibility`, `prospect-contact-history`; candidates without stored evidence are excluded with a reason |
| 5 | Prospect-specific Proof Factory / evidence lineage | DONE | `src/proof-factory.mjs` over existing `uberreply-prework-artifact` (claim-level content addressing, freshness) |
| 6 | Four offers + Offer Market Maker (bounded mutation) | DONE | `src/offer-market-maker.mjs` over `compileUberReplyOfferLifecycle`; one dimension at a time, control preserved, no fifth offer |
| 7 | Max Reply Genome + tournament fed real evidence | REUSE+DONE | existing `prospect-message-tournament`/`uberreply-*` unchanged; `narrowTournamentWithCritics` feeds G-SPOT MESSAGE stage |
| 8 | Adversarial anti-slop / creep / proof / unsupported-claim / buyer-fit critics | DONE | `reviewMessageAdversarially` (narrow-only) |
| 9 | Deliverability / suppression / sender health / quarantine / exact-effect authority | REUSE | untouched; G-SPOT requires `senderHealthy`, not quarantined, suppression false, effect package READY_FOR_AUTHORIZATION. Ordinal-3 quarantine unchanged |
| 10 | Reply Radar + Mohamed Reply Cockpit | DONE | `src/reply-radar.mjs`: material reply halts automation (also mid-batch), injection flagged, no auto-reply path; cockpit list in constellation UI is read-only, Mohamed writes and sends manually |
| 11 | DecisionTwin / champion support / UberClose | DONE | `src/decision-twin.mjs`, `GET /api/revenue/deal`; cash stages downgraded without provider evidence |
| 12 | Payment compression + cleared-payment truth | DONE | `src/payment-compression.mjs`; cannot mark paid; reversals subtract, original preserved. Binding to the live rail doctor output is OPEN (function takes rails as input) |
| 13 | Delivery / accepted result / case evidence / referral / renewal / expansion | DONE | `src/delivery-loop.mjs`, `GET /api/revenue/delivery`; silence is not acceptance; no cash, no delivery |
| 14 | Partner multiplier, diagnostics, inbound attribution | DONE | `src/partner-multiplier.mjs`, `GET /api/revenue/partners` (owner-maintained `settings.revenuePartners`; none stored yet) |
| 15 | Revenue Reliability allocator, correlation firewall, failure localization, market escape, counterfactual autopsy, conservative zero-revenue model | DONE | `src/revenue-reliability.mjs`, `GET /api/revenue/reliability` |
| 16 | Full Revenue Constellation | DONE (see limits) | `src/revenue-constellation.mjs`, `public/constellation.{html,js,css}`: runtime-backed nodes only, semantic zoom, 6 lenses, causal trails from real events, temporal replay, X-Ray, clustering (50k prospects build <2s), canvas, no idle render loop. Limits: only 3 of the "buyer/proof/economic/infra constellations" are distinct lenses over one graph; no separate force simulation; **iPad Safari not tested** (desktop Chromium only) |
| 17 | G-SPOT visible at centre of the organism | DONE | core node + stage histogram + plan/prepare/authorize/dry-dispatch controls |
| 18 | Preserve admin/ops/site-scoring/lead capabilities | DONE | untouched; nav links to `/admin.html`, `/ops.html`, `/uberbond.html`, `/command-center.html`. They are linked, not embedded |
| 19 | Browser verification of persistent session | DONE (desktop) | Chromium; iPad Safari OPEN |
| 20 | Hostile tests | DONE | `tests/revenue-singularity-core`, `proof-factory`, `revenue-reliability-and-twin`, `revenue-constellation`, `delivery-and-partners`, `revenue-surface-static`, `owner-session` |
| 21 | Canonical broader suite | IN PROGRESS | deterministic suite running; see handoff for result |
| 22 | Reachability truth | DONE | every new module is production-reachable via `server-core.mjs`; 3 stale classifications removed from `config/reachability-classification.json`; 14 pre-existing unclassified modules (also on main) untouched |
| 23 | PR / CI / merge | OPEN | next |
| 24 | Live Render reconcile / deploy / live verification | OWNER/OPEN | requires the Render tools/credentials; not available in this session. Do not claim LIVE |
| 25 | Real prospect send, first cash | OWNER | not attempted. No live send merely to test software |

## Pre-existing, not caused here
`scripts/check-syntax.mjs` reports 3 unparsable test files on `origin/main` as well (`tests/durable-decision-franchise-vault`, `infinite-opus-receipt-court-runtime`, `infinite-opus-worker-context-vault`). Not touched.

## Not claimed
No demand, revenue, deliverability, deploy or live-Render proof. All expected-contribution figures are conservative priors, not revenue.
