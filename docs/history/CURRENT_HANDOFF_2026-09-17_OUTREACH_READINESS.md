# UberBond Outreach Readiness Checkpoint — 2026-09-17

This is a current checkpoint, not a claim of launch, delivery, demand, payment, or revenue.

## Source and deployment identity

- Current GitHub `main` recovered after a live ref refresh: `93a78ae34fa273d762935652dd3bb0b352d1d772`.
- Tested offer-bridge source candidate was based on that exact main and verified locally at `27789b0d` (code change `00a418c0`, canonical refresh `27789b0d`).
- Published review record: PR #925, head `f476148d99fca60d216d9cdad0310ab655e804ea`, based on current main. The branch was transferred through the connected repository channel after shell `git push` correctly refused because no GitHub credential was available to the shell.
- Live Render service remains `uberbond-control-plane`, deployment `b2ad5f631d84d363058b18200512b94e265bb46c`, auto-deploy disabled. The live deployment is an earlier verified outreach build; the offer bridge is not live until reviewed and promoted.
- Render logs show Postgres worker/service startup, `OMNIA V9 outbound integration mode: off`, and no send/provider event in the inspected interval.

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
- Allowed inputs are public, owner-provided, first-party, or licensed records with provenance. Provider calls remain off in the verified configuration.
- Discovery is public OpenStreetMap website-bearing business research in preview mode; it is not permission to send. LinkedIn, Google Maps, private data, CAPTCHA bypass, and block evasion remain out of scope.
- Suppression and deduplication controls exist and are tested.
- A real governed recipient inventory is not evidenced. The synthetic 2,000-record portfolio is not a recipient corpus and cannot authorize contact.
- ICP/account filters, multi-provider enrichment waterfalls, evidence-bound personalization enforcement, unified reply taxonomy, and per-stage economic instrumentation remain partial or unimplemented.

## Runtime and safety receipts

- Historical focused suites after the bridge: 103 pass, 0 fail.
- Current-main rebased checkpoint suite: 64 pass, 0 fail, including server, leadgen, canary, governance, four-offer, canonical freshness, constitution freshness, and worker-context checks.
- Repository syntax sweep: 2,178 files parse.
- Relay safety suite: 150 pass, 0 fail.
- Full deterministic suite: 7,642 pass, 54 skipped, 1 pre-existing `nullstar-branch-debt` failure. The remote `feat/command-center-big-button` branch exists but is not an ancestor of current `main`; this was preserved as a red repository-history fixture rather than masked.
- Live outbound remained disabled/dry-run; no provider call, recipient message, DNS mutation, payment action, customer contact, cleared payment, or revenue receipt was created by this checkpoint.

## Campaign and canary truth

- Campaign creation has an idempotency key path that safely replays a browser timeout. The earlier timed-out campaign request must be read back through the protected admin/database path before another submission; exact live campaign-row state remains unknown because the current chat has no authenticated admin session and the Render SQL connector refused the SSL-required direct query.
- The governed canary route and tamper-resistant approval tests pass. Its gate still requires an approved auto-send campaign, researched exact recipient, route/authorization evidence, exact subject/body, connected sender, suppression check, business identity/address, and the existing outbound flags.
- No sender connection, authorized recipient, consent/request evidence, business postal address, provider receipt, delivery/bounce/unsubscribe/reply evidence, customer conversation, proposal, invoice, cleared payment, or accepted delivery is currently evidenced in this checkpoint.

## Remaining launch atoms

Software work completed or queued in PR #925. The minimum external facts still needed for one lawful canary are:

1. In the protected admin flow, save the legal/business identity and complete physical postal address.
2. In the secure provider OAuth flow, connect one legitimate sender account; do not paste credentials or tokens into chat.
3. Add one exact owner-provided, requested-information, or explicit-consent recipient with source URL/note, timestamp, jurisdiction, and suppression provenance.

After those facts exist, the minimum sequence is: reconcile the timed-out campaign; select one final offer lane; prepare the exact preview; approve the tamper-bound payload; reserve one message; send only if every gate is green; capture the provider receipt and outcome events; then pursue the customer conversation and payment request. The other three offers remain available as separate lanes and are not erased or forced into one quota.

## Economic truth

- Cleared revenue in the verified runtime remains USD 0.
- Payment source adapters exist, but no live settlement/KYC/webhook receipt is evidenced. Payment activation is needed before calling a client payment cleared.
- The current first-money sequencing champion is Lane A at USD 450; this is a sequencing hypothesis, not demand proof and not a deletion of Lanes B–D.
- The 100,000-per-month outbound capacity program remains a separate later scale track; its capacity, compliant sender cells, recipient corpus, provider health, and economics are not implied by this canary-preparation checkpoint.
