# UberBond Outreach Readiness Checkpoint — 2026-09-17

This is a current checkpoint, not a claim of launch, delivery, demand, payment, or revenue.

## Fresh reconciliation — 2026-09-17 21:07 UTC

- The current source tree is the clean, merged candidate at `ddcd2a6512b6dbcad5985f82b27e297f0c727600`; the later local commits `34facc87` and `ee6c4fdf` contain only this handoff/readiness receipt refresh. It merges the fetched `origin/main` history with the verified queue-client fix (`f7ab0e54`), Egypt/GCC country normalization (`50905ce9`), and the durable outreach receipts.
- That source candidate passed `npm run test:deterministic`: 7,727 tests, 7,673 pass, 0 fail, 54 declared skips. The earlier worker-context failure was reproduced as a dirty-worktree refusal after readiness regeneration; after committing the generated readiness checkpoint, the worker admission test passed and the full suite is green. No test or safety gate was weakened.
- The live Render service remains `uberbond-control-plane`, deployment `dep-dam53oe7bikc738boum0`, remote `main` commit `2ff63e43e0da5d9d46db7f209c42e45efafa8fbc`, status `live`, auto-deploy disabled. Public health at `2026-09-17T21:03:02.199Z` returned HTTP 200, Postgres-backed storage, worker online, paused false, and heartbeat current. The worker reported one active job at that observation.
- The latest Render error query returned one real historical application error at `2026-09-17T20:47:10.998836458Z`: `Client has already been connected. You cannot reuse a client.` The local candidate contains the scoped-transaction fix, but that candidate is not deployed because it has not been pushed to the private remote.
- Live outbound remains disabled/dry-run; no provider call, recipient message, customer contact, payment, cleared revenue, or DNS mutation is evidenced. The live discovery run remains the earlier dry-run `fetch failed` result with zero imported prospects.
- The local lead/data audit is green: `smoke:discovery` previewed 2 public-OSM website-bearing records and imported 2 only in its explicit fixture import phase; 51 focused lead/discovery/canary tests passed; 22 outbound guard probes passed; and `test:relay-safety` passed 150/150. The discovery engine requires a public website, whitelisted categories, bounded geography, attribution, deduplication and explicit dry-run/import choice; it does not scrape LinkedIn/Google Maps, bypass CAPTCHA, infer private contacts, or create send authority.
- The repository syntax sweep passed: 2,186 files parse. The Postgres outbound smoke did not reach application assertions because this runner cannot execute `groupadd postgres` for `embedded-postgres`; this is recorded as an infrastructure/runner failure, not a source pass or source failure. The JSON-store outbound probes remain 22/22 green.
- Read-only DNS verification at `2026-09-17T21:13:32.830Z` observed zero verified records across the planned UberBond hosts. `send.uberbond.cloud` remains `UNKNOWN` with provider SPF, DKIM and MX requirements unsupplied; no DNS write occurred. The two owned roots recovered from source are `uberbond.agency` and `uberbond.cloud`.
- Local first-cash/readiness doctors remain truthful: `NO_CONTACT_PERMITTED`, live usable provider capacity `0`, proven free cold-B2B route `false`, and no live payment rail/owner KYC evidence. The code can prepare the four offer lanes, governed lists, local enrichment, payment binding and canary payloads, but it cannot invent a sender, recipient authorization, DNS evidence, payment settlement or customer demand.
- The private-source push was previously rejected by the external-write authorization boundary. This is a deployment authorization boundary, not a software/test blocker; no claim of live deployment is made until a remote push and Render deploy receipt exist.

## Latest live recovery receipt — 2026-09-17 20:47 UTC

- The live Render service is healthy on deployment `dep-dam53oe7bikc738boum0`, still running remote `main` commit `2ff63e43e0da5d9d46db7f209c42e45efafa8fbc`. The environment now contains the narrow system country allowlist `OUTBOUND_ALLOWED_COUNTRIES=EG`; outbound itself remains disabled and dry-run.
- A fresh protected admin credential was generated and rotated server-side several times during recovery. It was never written to chat, source, logs, or a URL. The authenticated browser session accepted the credential and the guarded start press created/continued the internal outreach100k mission; it produced zero external effects.
- The previous timed-out campaign uncertainty was resolved through the live authenticated API. Durable campaign rows now include: `camp_e9cfb5c2-ac83-4575-8118-dfbfe16222a1` (historical malformed `allowedCountries=[]`) and corrected `camp_784b91fe-4591-4e95-93b4-827d7c13e0b7` (`LEAD_TO_BOOKING_LEAK_AUDIT`, USD 450, `allowedCountries=["EG"]`, `approved=true`, `autoSend=true`, `minScore=75`, `maxFollowups=0`). No send authority was created by campaign creation.
- A bounded Cairo OSM preview was queued as `job_7a2ab4e2-30f0-4f12-8cff-f3bcc80b4f3a` and recorded as `disc_2cd74ac8-caba-45a8-8189-fd364fd2c8c7`, dry-run, zero records, error `fetch failed`. No prospects were imported and no provider or messaging call occurred.
- Canary status after the corrected campaign: `CANARY_BLOCKED`; counts were 0 prospects, 4 campaigns, 3 approved auto-send campaigns, 0 candidates, 0 governed-ready, 0 connected senders, 0 suppressions. Current reasons included `no-researched-canary-candidate`, `no-approved-route-and-payload`, `no-connected-sender`, `outbound-disabled`, `outbound-dry-run`, `business-address-missing`, and `google-oauth-missing`.
- Render emitted a real worker error at `2026-09-17T20:47:10.998Z`: `queue polling failed Error: Client has already been connected. You cannot reuse a client.` This explains why the discovery job did not complete. The safe local fix is committed as `f7ab0e54` (with the Egypt/GCC label-normalization fix and regression test in `50905ce9`), but the push to the private GitHub remote was rejected by the external-write authorization boundary and is not deployed.

## Source and deployment identity

- Current GitHub `main` is the merged PR #929 commit `af316019dcf2adf2237625b7bf492ddfb5374025`. The tested local source frontier was `e882c509a2e6ac7f8fcc6444a3bf4c5c343c4ed3`; its tree is identical to the merged main tree.
- Offer-bridge source was based on `93a78ae34fa273d762935652dd3bb0b352d1d772` and verified locally at `27789b0d`; the promoted merge contains the same tested tree plus the durable checkpoint.
- Live Render service is `uberbond-control-plane`, deployment `dep-dam3tiuk1f9s73echfs0`, application commit `af316019dcf2adf2237625b7bf492ddfb5374025`, status `live`, auto-deploy disabled. The deployment cloned `main`, built successfully, and reported zero package vulnerabilities.
- Fresh public health receipt at `2026-09-17T19:27:11.408Z`: HTTP 200, `storeBackend=postgres`, worker online, paused false, active jobs 0, heartbeat current. Render logs at `2026-09-17T19:26:39Z` show the merged commit starting with Postgres and `OMNIA V9 outbound integration mode: off`; the last 15-minute error-log query returned zero entries. The protected native lead-gen routes return 401 without admin authentication, confirming route presence without exposing protected data.

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
- The live Render deployment is now the merged PR #929 application commit above; auto-deploy remains disabled and future production changes require an explicit deploy receipt.
- Live outbound remained disabled/dry-run; no provider call, recipient message, DNS mutation, payment action, customer contact, cleared payment, or revenue receipt was created by this checkpoint.

## Campaign and canary truth

- Campaign creation has an idempotency key path that safely replays a browser timeout. The live API readback resolved the prior uncertainty and the corrected EG campaign is recorded above; the malformed historical row is preserved rather than deleted.
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
