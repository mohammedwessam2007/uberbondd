# UberBond lead generation and 100K outreach recovery checkpoint

Checkpoint: 2026-09-17T15:36:43Z  
Repository: `mohammedwessam2007/uberbondd`  
Pre-change live main: `1069c360f309bb5a879a2c8ef84443c3250fc806`  
External effects in this checkpoint: `0`

## Live state recovered

- Render service: `uberbond-control-plane` (`srv-dali9vijnfac739m4vcg`), Frankfurt, free web service with resident worker.
- Current reported deployment: `dep-daluh1gae00c73cm0a0g`, commit `1069c360`.
- `/api/health`: HTTP 200; PostgreSQL-backed; worker heartbeat online.
- Outbound: disabled; dry-run/safe mode; reserved messages `0`; messages sent `0` in the recovered checkpoint.
- The Render SQL connector could not query the database because it did not request SSL (`SQLSTATE 28000`). Campaign-row state for the earlier browser timeout therefore remains **unknown**, not absent. The protected admin route is the correct next inspection path.
- Live lead-intelligence endpoint correctly returns HTTP 401 without owner authentication.

## Lead generation and data collection truth

The repository contains a governed preparation system, not an unrestricted scraping engine.

- Local, owner-imported, first-party, licensed, provider-described, public-website, and OpenStreetMap-derived records are represented with source and provenance.
- The default lead engine makes no provider/API calls and has no external side effects. Apollo/Clay/Instantly/Hunter/ZeroBounce/Dropcontact/Cognism/Common Room/6sense/HubSpot are represented as provider-neutral, unconfigured or BYOK-gated plans; they are not silently called.
- Discovery uses a bounded, read-only OpenStreetMap Overpass path for public business names and public websites, with category/bounding-box limits, deduplication, attribution, user-agent and throttling. It is preview-first and does not create permission to contact a business.
- The website auditor is bounded to public URLs, same-origin navigation, SSRF checks, robots directives, page limits and public contact signals. It does not use LinkedIn scraping, Google Maps scraping, private sessions, CAPTCHA bypass, cookie reuse, or inferred private email addresses.
- Robots access now fails closed when the file is denied or unavailable; an actual 404 is treated as “no directives observed,” not as permission to ignore other safeguards.
- Imported/public contacts remain unverified or review-only until evidence supports them. Outreach requires an exact route, authorization/consent/request evidence, suppression screening, campaign approval, sender/provider gates, and the existing canary governance.

These boundaries are also consistent with the relevant external rules: commercial B2B email is covered by CAN-SPAM and requires truthful identity, a physical postal address and functioning opt-out handling ([FTC compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)); Google’s current sender guidance requires authentication and reputation controls, with stricter requirements above 5,000 messages/day ([Google sender guidelines](https://support.google.com/mail/answer/81126?hl=en)); OpenStreetMap data requires attribution and follows its database/API usage terms ([OSM copyright](https://www.openstreetmap.org/copyright), [OSM API policy](https://operations.osmfoundation.org/policies/api/)).

## 100K/month capacity truth

The 100K system means **100,000 outbound messages per month**, not USD 100,000 revenue. It is a later capacity program and is separate from first revenue.

The current certificate and runtime preparation require fresh, exact evidence for the runtime bundle, recipient corpus, deduplication, suppression, authorization, sender/domain authentication, provider terms and budget, per-mailbox capacity, scheduling, reconciliation, and incident controls. Missing or stale evidence refuses the start before reservation or provider calls. The live cell has no proven 100K sender/mail-cell, DNS/MX/SPF/DKIM/DMARC launch evidence, governed 100K recipient corpus, complete postal identity, or provider-confirmed receipts. A single consumer Gmail account cannot be treated as a 100K/month solution; Google Workspace’s published limits are materially lower and subject to change ([Google Workspace sending limits](https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace)).

## Safe changes prepared in this checkpoint

- Campaign creation now requires an idempotency key and converges browser retries/races onto one durable campaign; a reused key with different content returns a conflict.
- The admin campaign form derives a retry key from the request itself in page memory only; it does not put the admin bearer or form data in browser storage.
- Repository smoke/probe campaign creators now send idempotency keys.
- Robots-unavailable behavior and crawler refusal are covered by tests.
- OpenStreetMap is explicitly recognized as a provenance-bearing lead source, and suppression handling accepts canonical suppression records and bare values.

## Verification receipt

- Lead, discovery, import, admin, campaign-handler and robots suite: **71/71 passed**.
- 100K artifact/corpus/certificate/runtime/canary suite: **51/51 passed**.
- Changed JavaScript modules and tests: `node --check` passed; `git diff --check` passed.
- Browser suite: **58/59 passed**; the sole failure is the existing Playwright integration needing the host Chromium binary, not a source assertion failure. The new fail-closed robots test passed.
- The repository’s very large deterministic runner produced extensive passing output but did not return a reliable terminal summary in this runner; it is not claimed as a full-suite pass. No source change is promoted on that inconclusive result alone.

## Remaining blockers

1. **Owner/authentication:** protected admin session is not present in this chat, so the timed-out campaign row cannot yet be inspected through the live control plane.
2. **Owner/legal identity:** no complete business name and physical postal address is evidenced in the live app.
3. **Owner/provider:** no authorized sender OAuth connection is evidenced for a launch sender.
4. **Owner/recipient:** no one lawful warm, requested, permission-based recipient with provenance and suppression evidence is evidenced.
5. **Provider/infrastructure:** no 100K-compliant sender fleet, authenticated launch domains, current provider capacity/terms, or deliverability receipts are evidenced.
6. **Financial:** no live owner-controlled client payment rail and no cleared payment are evidenced.

The next minimum sufficient action is to commit/deploy this verified safe change set, then use the protected owner handoff to inspect any existing campaign before creating or retrying anything.
