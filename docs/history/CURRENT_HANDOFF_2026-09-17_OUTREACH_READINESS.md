# UberBond Outreach Readiness Checkpoint — 2026-09-17

This is a current checkpoint, not a claim of launch, delivery, demand, payment, or revenue.

## Source and deployment identity

- Current GitHub `main` is `3d0f1502b3a23942a06cee8138ba8b283e7a95bb`. The tested local source frontier is `d7ce32e250e2d9128fbd1c4568e55cc7410f2820`; its equivalent published tree is PR #929, head `fb45588a40b84d227aa0db9f38dc6f64e895ad0c`, awaiting hosted checks/merge.
- Offer-bridge source was based on `93a78ae34fa273d762935652dd3bb0b352d1d772` and verified locally at `27789b0d`; the promoted merge contains the same tested tree plus the durable checkpoint.
- Live Render service is `uberbond-control-plane`, deployment `dep-dam2h465vjqs73bgs9k0`, application commit `8760c338d96b42db8e861043ffc898d87e4d0ae2`, status `live`, auto-deploy disabled. The later `b42a47fd` main commit is documentation-only and has not changed runtime behavior.
- Fresh public health receipt at `2026-09-17T17:52:25.604Z`: HTTP 200, `storeBackend=postgres`, worker online, paused false, active jobs 0, heartbeat current. Render logs show Postgres worker/service startup, `OMNIA V9 outbound integration mode: off`, and no send/provider event in the inspected interval.

## Four final offer lanes

The canonical four-offer genome remains intact and is now wired into campaign preparation in PR #925:

| Lane | Offer ID | Offer | Founding-pilot price hypothesis |
|---|---|---|---:|
| A | `LEAD_TO_BOOKING_LEAK_AUDIT` | White-Label Lead-to-Booking Leak Audit | USD 450 |
| B | `AI_AGENT_RELEASE_GATE` | AI Agent Release Gate | USD 900 |
| C | `CLIENT_ROI_PROOF_SPRINT` | Client ROI Proof Sprint | USD 950 |
| D | `BILINGUAL_BOOKING_LEAK_AUDIT` | Arabic + English Booking Leak Audit | USD 750 |

The bridge adds an exact campaign `offerId`, includes it in campaign idempotency, refuses unknown IDs, refuses weak fit for a pinned lane, and carries the selected lane into preparation drafts. The older public inbound catalog is preserved separately; it was not silently substituted for these four offers.

## Lead generator and data policy

- Live lead-generation surfaces are durable, read-only intelligence and handoff routes backed by `lead_lists`, `lead_searches`, `lead_signals`, and `lead_enrichment_runs`.
- A clean-room native lead-operations layer is now implemented and published for review. It provides reusable target profiles, deterministic local list compilation, domain-first deduplication, suppression precedence, local-only enrichment plans/results, safe CSV export, and a mobile control-panel path. It also exposes the existing advanced coverage map, field ledger, buying-group plan, lookalike plan, provider catalog, and provider preflight through protected owner routes and the control panel. It clones the operator jobs and durable state boundaries of lead-gen/enrichment/list/campaign tools; it does not copy protected code, data, private network access, or provider controls.
- Native list compilation is explicitly `OWNER_PLAN_READY_NOT_AUTHORIZED` or blocked until unresolved evidence is supplied. It never enrolls a campaign, sends a message, creates a provider contact, or asserts consent. Replaying the same list request with the same idempotency key converges on one list.
- The native enrichment surface is local-only until a separately authorized adapter is configured. The 100,000-message planner calculates daily arithmetic, supplied-cell gap, reply/win scenarios, and blockers, but remains `CAPACITY_PLAN_ONLY`; it is not a sender-capacity certificate, deliverability proof, or revenue claim.
- Allowed inputs are public, owner-provided, first-party, or licensed records with provenance. Provider calls remain off in the verified configuration.
- Discovery is public OpenStreetMap website-bearing business research in preview mode; it is not permission to send. LinkedIn, Google Maps, private data, CAPTCHA bypass, and block evasion remain out of scope.
- Suppression and deduplication controls exist and are tested.
- A real governed recipient inventory is not evidenced. The synthetic 2,000-record portfolio is not a recipient corpus and cannot authorize contact.
- Multi-provider enrichment waterfalls, evidence-bound personalization enforcement, unified reply taxonomy, and per-stage economic instrumentation remain partial; the native enrichment waterfall is a provider-free plan boundary, not an active provider integration. Provider preflight now makes those exact gaps visible without pretending a BYOK connection exists.

## Runtime and safety receipts

- Native lead-ops and server-route focused suite: 42 pass, 0 fail; reachability ratchet: 13 pass, 0 fail.
- Repository syntax sweep: 2,186 files parse.
- Full deterministic suite: 7,672 pass, 54 declared skips, 0 fail.
- Relay safety suite: 150 pass, 0 fail.
- The branch-debt receipt was regenerated from the current fetched remote history, and the worker-context fixture passes from a clean worktree. No failing check was deleted, masked, or weakened.
- The live Render deployment remains the older application commit below until PR #929 is merged and manually redeployed.
- Live outbound remained disabled/dry-run; no provider call, recipient message, DNS mutation, payment action, customer contact, cleared payment, or revenue receipt was created by this checkpoint.

## Campaign and canary truth

- Campaign creation has an idempotency key path that safely replays a browser timeout. The earlier timed-out campaign request must be read back through the protected admin/database path before another submission; exact live campaign-row state remains unknown because the current chat has no authenticated admin session and the Render SQL connector refused the SSL-required direct query.
- The governed canary route and tamper-resistant approval tests pass. Its gate still requires an approved auto-send campaign, researched exact recipient, route/authorization evidence, exact subject/body, connected sender, suppression check, business identity/address, and the existing outbound flags.
- No sender connection, authorized recipient, consent/request evidence, business postal address, provider receipt, delivery/bounce/unsubscribe/reply evidence, customer conversation, proposal, invoice, cleared payment, or accepted delivery is currently evidenced in this checkpoint.

## Remaining launch atoms

Software work is live in Render. The minimum external facts still needed for one lawful canary are:

1. In the protected admin flow, save the legal/business identity and complete physical postal address.
2. In the secure provider OAuth flow, connect one legitimate sender account; do not paste credentials or tokens into chat.
3. Add one exact owner-provided, requested-information, or explicit-consent recipient with source URL/note, timestamp, jurisdiction, and suppression provenance.

After those facts exist, the minimum sequence is: reconcile the timed-out campaign; select one final offer lane; prepare the exact preview; approve the tamper-bound payload; reserve one message; send only if every gate is green; capture the provider receipt and outcome events; then pursue the customer conversation and payment request. The other three offers remain available as separate lanes and are not erased or forced into one quota.

## Economic truth

- Cleared revenue in the verified runtime remains USD 0.
- Payment source adapters exist, but no live settlement/KYC/webhook receipt is evidenced. Payment activation is needed before calling a client payment cleared.
- The current first-money sequencing champion is Lane A at USD 450; this is a sequencing hypothesis, not demand proof and not a deletion of Lanes B–D.
- The 100,000-per-month outbound capacity program remains a separate later scale track; its capacity, compliant sender cells, recipient corpus, provider health, and economics are not implied by this canary-preparation checkpoint.
