# Cold-route policy evidence package — SMTP_RELAY_PUBLIC_BUSINESS_CONTACT_V1 — 2026-10-02

Truth class: RESEARCH + CANDIDATE POLICY + INERT CODE ON A BRANCH. Not legal advice. No message sent, nothing enabled, no spend, no production read or write.

## 1. What current source does (preserved)

`src/outreach-governance.mjs` `providerRoutePolicy` lets `gmail-api`, `postal` and `smtp-relay` accept only `SOLICITED_APPLICATION`, `EXPLICIT_CONSENT` and `REQUESTED_INFORMATION`. `PUBLIC_BUSINESS_CONTACT` on `smtp-relay` returns `smtp-relay-cold-route-requires-separate-provider-and-legal-evidence`. **This branch does not change that.**

## 2. Evidence gathered

| Question | Finding | Source quality |
|---|---|---|
| US federal law: B2B covered? | Yes. CAN-SPAM makes no business-to-business exception. | FTC compliance guide, via search summary (ftc.gov blocked from this sandbox) |
| Prior consent required? | No. It is an opt-out regime for US commercial email. | same |
| Required elements | Accurate header/from/reply-to; non-deceptive subject; clear identification as an advertisement or solicitation; valid physical postal address; clear opt-out; opt-out honored within 10 business days; opt-out mechanism works for at least 30 days. | same |
| Prohibited acquisition | Address harvesting (automated collection from a site that states it won't share addresses), dictionary attacks. Aggravated violations can triple statutory damages. | secondary summary of 15 U.S.C. 7704(b) |
| Statute text itself | Not retrievable from this sandbox (ftc.gov, law.cornell.edu, uscode.house.gov, govinfo.gov, ecfr.gov, justia are egress-blocked). **Upgraded in revision 2:** Mission Control retrieved the FTC guide and the primary statute text independently; see section 8. | `US_CAN_SPAM_PRIMARY_SOURCE_GAP`: EXTERNALLY_VERIFIED (pointer only) |
| State laws | **Not researched.** Treated as an unresolved gap and handled by narrowing to US business recipients with manual, published, non-guessed contacts. | gap |
| Winnr terms | Written support (preserved in `docs/WINNR_SUPPORT_RECONCILIATION_2026-10-02.md`) accepts the described lawful B2B outreach under its mailing-list practices. Recommended 10–15 cold/mailbox/day, hard cap 50. These are private-correspondence representations, not checkout facts. | preserved provider evidence |
| **Sender-side law (Egypt)** | The repo has held an "Egypt-sender legal hold" since 2026-09-27. `src/uberoutbound-recipient-eligibility.mjs` holds every cold recipient when the sender jurisdiction is EG (`sender-jurisdiction-eg-pdpl-electronic-marketing-consent-and-licence-review-required`). External research (search summaries) says Egypt's PDPL Article 17 requires consent for electronic marketing and that Ministerial Decree 816 of 2025 makes direct electronic marketing a licensable activity, with full enforcement from 2026-10-31. Whether this reaches B2B mail to US companies from an Egypt-based sender is a legal question this research cannot settle. | partly encoded in repo; external via secondary sources |

## 3. Candidate policy (the narrowest that could create commercial learning)

- Provider: existing Winnr `smtp-relay` only. Senders: ordinal 1 or 2 only; ordinal 3 stays at zero.
- Recipient jurisdiction: US only. Recipient class: corporate business recipient, never consumer, personal mailbox or system address.
- Contact provenance: published by the agency itself, collected manually, never guessed or crawled; no no-solicitation notice and no no-harvest notice, both checked.
- Message: one message to one recipient; accurate sender identity; non-deceptive subject (no Re:/Fwd:, not all caps); explicit "This is a commercial message" disclosure; authorized physical postal address; working stop link; no follow-up.
- Cap: one total first experiment, then at most 2/day per green mailbox only after reconciliation.
- Authority: a signed, expiring (at most 7 days), capped (at most 5 messages) founder authorization, bound to the exact published postal address.
- **Sender jurisdiction: the policy only works if the sender's own jurisdiction is one the eligibility compiler clears (US, GB, CA, AU). Egypt, Saudi Arabia and the UAE hold.**

## 4. Red team

| Attack | Result |
|---|---|
| Founder authorization absent, forged, tampered, expired or future-dated | refused (tests) |
| Authorization reused after the postal address changes | refused (address digest binding) |
| Guessed, crawled or personal-mailbox recipient | refused |
| Consumer or sole-trader recipient | refused |
| Non-US recipient or sender jurisdiction the compiler holds | refused |
| Subject simulating a thread, or all caps | refused |
| Missing disclosure, postal address or stop link | refused |
| Suppression, opt-out, complaint, hard bounce | refused |
| Stale or future-dated contact evidence | refused by recomputed eligibility |
| Caller supplies its own "PASSED" legal result | impossible: eligibility is recomputed from facts, never trusted |
| Evidence reuse across recipients | route digest binds recipient (existing governance) |

Remaining reasons **not** to enable it today:
1. The sender-side Egypt hold is unresolved. It is the binding issue; no software change can resolve it.
2. State-law analysis is unresearched.
3. Winnr's acceptance is a support-email representation, not a checkout term.
4. No unsent eligible prospect exists (section 5).

## 5. Prospect state

- Repo corpus: no stored, unsent US agency with a published email. The only real agency emails (Lemon Seed `hello@`, Moovsoon `info@`, Driive `nick@`) were cold-contacted on 2026-09-04 and are excluded.
- Candidate lists hold contact-page URLs only: Leadhub, BxB Media, KickCharge Creative, Footbridge Media, 1SEO, Powerhouse Consulting Group.
- Verification of a published address, solicitation notice and a real client-site observation needs page fetching, which this sandbox blocks. Request: `artifacts/outreach/prospect-verification-request-20261002.json`.
- Consequence: no honest first message can be written yet. A "verified observation" cannot be invented, so no template was produced.

## 6. Code state

- Added `src/outreach-cold-route-policy.mjs` and `tests/outreach-cold-route-policy.test.mjs` (superseded: see section 11 for the repaired module, 23 tests and 14 killed mutations).
- The module is **not wired into any gate**. Wiring it requires editing `src/outreach-governance.mjs`, the generic route gate. The auto-mode classifier blocked that edit as a security weakening, so it was left for the owner. The intended change is small: `providerRoutePolicy` accepts an optional context and, only for `smtp-relay` + `PUBLIC_BUSINESS_CONTACT`, delegates to `evaluateColdRoutePolicyV1`; with no context the original refusal is byte-identical. A route gains an optional `coldPolicy` field, so existing route digests are unchanged. Plus: an owner endpoint to store the signed authorization, and a `commercialDisclosure` line in the message builders.

## 7. Exact owner decision (superseded where it differs by sections 10, 14 and 15)

Provide **one fact**: the jurisdiction of the legal sender of UberBond email. Then:

- **US, GB, CA or AU:** the policy can be wired, merged and authorized with one signed, bounded YES.
- **Egypt (or SA/AE):** the policy stays inert, by design. Cold email from an Egypt sender needs Egyptian counsel's written confirmation and a reviewed change to the eligibility compiler. Meanwhile the lawful routes already in code are solicited or requested-information email, in-person cards, partner introductions, and postal letters with a counsel reference.

Plus the identity fact: legal or business name and a physical address you authorize for public email footers.

Effects: new spend $0; prospect messages 0; credential changes 0; production mutations 0.

---

# Revision 2 — 2026-10-02 (after Mission Control evidence)

## 8. External evidence pointers (recorded, not re-fetched here)

| Item | State | Pointer |
|---|---|---|
| `US_CAN_SPAM_PRIMARY_SOURCE_GAP` | **EXTERNALLY_VERIFIED** (was UNKNOWN) | Mission Control retrieval, 2026-10-02: FTC CAN-SPAM compliance guide plus primary statute text. This sandbox cannot reach those hosts; do not spend more cycles trying. Confirmed: no prior opt-in for commercial email generally; accurate header/routing information; no deceptive subject; clear identification as an advertisement/solicitation; valid physical postal address; clear opt-out that stays available and is honored within 10 business days; address harvesting and dictionary generation add problems. |
| Egyptian PDPC | confirmed by Mission Control | PDPL Law 151/2020; Executive Regulations 816/2025; prior valid explicit consent for electronic direct marketing; licensing/permit requirements; sender identity/contact/purpose/opt-out obligations |
| Production | **LIVE** on `7008c87` per Mission Control (Render `uberbond-control-plane`, Frankfurt); startup shows 3 mailboxes, SMTP 3/3, IMAP 3/3, AES-256-GCM, plaintext credentials logged: false; paused ordinal [3], reason `GMAIL_PLACEMENT_RED`, scope SMTP fleet selection only, IMAP custody unchanged, prospect-send authority NOT granted | not re-verified from this sandbox; the production-deployment blocker is closed |

## 9. Egypt evidence-taxonomy correction

The PDPC's published scope concerns personal data of Egyptian citizens (inside or outside Egypt) and of non-Egyptians residing in Egypt. It does **not**, on this evidence, establish that an Egypt-located sender's every email to every foreign corporate recipient falls under Article 17.

Therefore the repo rule `senderJurisdiction EG => cold outreach HOLD` is classified as

`CONSERVATIVE_POLICY_HOLD_PENDING_AUTHORITATIVE_SCOPE_INTERPRETATION`

and **not** as a proven global prohibition. **The hold is kept and not bypassed.** The classification is exported as `SENDER_SIDE_HOLD_CLASSIFICATION` from the inert module and appears in every refusal it produces.

## 10. What `senderJurisdiction` currently means, and the model repair

Facts to keep apart: founder residence; physical location at send time; legal-entity jurisdiction; controller establishment; domain registration; SMTP infrastructure location; recipient jurisdiction.

- **Compiler (`uberoutbound-recipient-eligibility.mjs`):** one field, documented as "the sender's home law applies to it too". Single-valued and unspecified, so founder residence, entity, controller and operator location are conflated.
- **Launch facts:** ask for one 2-letter country. **Founder queue:** "if you send from Egypt".
- **What the Egyptian question actually turns on:** (a) whose personal data is processed (the recipient data subject's nationality or residence) and (b) where the controller/processing is established. It does not turn on domain registration, and there is no evidence it turns on relay location.

**Repair, on the inert branch only.** The authorization carries separate fields:

| Field | Gates? | Why |
|---|---|---|
| `operatorLocation` | yes | covers founder residence and where the sender acts at send time |
| `senderEntityJurisdiction` | yes | legal-entity jurisdiction |
| `controllerJurisdiction` | yes | controller establishment |
| `transportRegion` | **no, recorded only** | no legal evidence says relay location controls lawfulness; gating on it would hold every message sent via an EU-hosted relay (the control plane runs in Frankfurt) without a basis |
| `recipientJurisdiction` | yes (US only) | separate, already modeled |

Every gating field must clear on its own, so no hold is weakened: the check is strictly no looser than the single field before, and each refusal names the offending field. Any future authoritative interpretation can then relax exactly the field it concerns, through a reviewed change.

## 11. Architecture review of the inert branch

| # | Check | Result |
|---|---|---|
| 1 | `uberbond.outreach-route.v1` closed-record validation rejects a `coldPolicy` field | **Confirmed.** The legacy verifier refuses the cold envelope (test). |
| 2 | Future integration needs a versioned schema or validated extension | **Repaired.** New envelope `uberbond.outreach-route.cold-v1` with its own closed field set, digest and verifier. |
| 3 | Legacy route digests must not change | **Holds.** The legacy creator is untouched; legacy routes carry no `coldPolicy` and keep the same digest (test). |
| 4 | Solicited/consented routes unchanged | **Holds** (test). |
| 5 | Generic smtp-relay cold refusal stays the default | **Holds** (test asserts the original reason string and the route-type set). |
| 6 | Cold authorization scoped, signed, expiring, capped | Yes: HMAC-signed, at most 7 days, at most 5 messages, US recipients only, bound to the exact postal-address digest. Added a prior-send count check so a cap of 1 admits exactly one message. |
| 7 | Ordinal 3 impossible to select | **Strengthened.** The policy now requires the exact mailbox that the real fleet allocator returns as healthy. Tests use `selectFleetMailbox` with a paused ordinal 3 and prove it is never allocated and always refused. |
| 8 | Approval stays bound to exact sender + recipient + content | Yes, through the existing governance digests; the cold policy adds the exact allocated sender and the exact route envelope digest. |
| 9 | No generic security weakening | `src/outreach-governance.mjs`, `server-core.mjs` and the pipeline are untouched. A test proves nothing in the runtime imports the module. |

Verification: 23 tests; 14 guard-removal mutations, each killed.

## 12. Prospect lane

Another lane can fetch public pages. Externally reported candidate facts are recorded in `artifacts/outreach/prospect-verification-request-20261002.json` and evaluated by the new deterministic intake `src/prospect-verification-intake.mjs` (10 tests; 6 mutations killed). Result in `artifacts/outreach/prospect-tournament-20261002.json`:

| Candidate | Status | Why |
|---|---|---|
| 1SEO | REJECTED | now part of Scorpion (larger group; Scorpion is a repo-rejected overlap) |
| KickCharge Creative | REJECTED (this address) | `sparky@` is a privacy contact, not a sales recipient |
| Footbridge Media | INCOMPLETE | `service@` is reported published, but its purpose, verbatim excerpt, notice checks and a real client-site observation are not retained |
| Leadhub | INCOMPLETE | no observation retained |
| BxB Media | INCOMPLETE | no observation retained |
| Powerhouse Consulting Group | INCOMPLETE | no observation retained |

**0 verified candidates.** Nobody was forced. Fetch results feed `compileProspectVerification`; if none verify, discover replacements.

## 13. Message and effect package

Not produced, by rule: messages are generated only for prospects at VERIFIED_CANDIDATE, and a message must not fabricate an observation. None qualifies yet. No approval was minted.

## 14. Readiness

| State | Value |
|---|---|
| TECHNICALLY_READY | **yes**: inert, tested, unwired candidate on this branch; main untouched |
| PROSPECT_READY | **no**: awaiting external fetch results (machine-resolvable by another lane; not an owner hold) |
| MESSAGE_READY | no: depends on PROSPECT_READY |
| EFFECT_PACKAGE_READY | no: depends on MESSAGE_READY |
| LEGAL_AUTHORITY_HOLD | **yes**: sender-side scope interpretation; conservative policy hold kept |
| IDENTITY_FACT_HOLD | **yes**: owner fact below |

## 15. Identity: exactly three items

```
LEGAL/BUSINESS SENDER NAME:
PUBLISHABLE PHYSICAL POSTAL ADDRESS:
OWNER AUTHORIZES PUBLIC FOOTER USE: YES/NO
```

No other founder paperwork is required by the source for the identity gate. The sender-side facts (`operatorLocation`, `senderEntityJurisdiction`, `controllerJurisdiction`) are needed only by the cold-route authorization when it is wired.

Effects: new spend $0; prospect messages 0; credential changes 0; production mutations 0; cold route not wired, not merged, not enabled.

---

# Revision 3 — 2026-10-03 (prospect lane resumed)

Truth class: INTAKE UPDATE + SEARCH-LEVEL DISCOVERY. Nothing sent, wired, merged or enabled.

## 16. Intake changes (branch only)

`src/prospect-verification-intake.mjs` now encodes, deterministically:

- **Negative recipient signals** reject (`REJECT_NEGATIVE_RECIPIENT_SIGNAL`): a published stance against unsolicited marketing, or one requiring consent, is a reputational and fit rejection even where the law would allow the message.
- **Parent-company assessment** replaces the earlier blanket rejection: a candidate that is part of a group is rejected only if it no longer operates as its own prospect or the parent overlaps the offer (HIGH); unassessed overlap is INCOMPLETE; LOW overlap with a rationale and evidence reference proceeds.
- **Evidence class:** only `PAGE_FETCH_VERIFIED` or `EXTERNAL_LANE_REPORT_WITH_EXCERPT` can support VERIFIED_CANDIDATE. A search-engine summary or a partial second-hand report never can.
- **Offer routing:** exactly one offer from the existing quartet with a stated reason; no new product.

13 tests pass; mutating each new rule is caught.

## 17. Mission Control findings, resolved by the intake (not independently verified here)

| Candidate | Status | Basis |
|---|---|---|
| Footbridge Media | **REJECTED** (`negative-recipient-signal`) | published article treats unsolicited marketing/optimization reports as cold-call equivalents it ignores; its own email service says consent is required and recipients should be existing customers or engaged prospects |
| 1SEO Digital Agency | **REJECTED** (`parent-overlap-makes-offer-redundant`) | `info@1seo.com` is a genuinely public general-inquiry address (support@ is client-only). Determinations: still an operating branded entity; the Scorpion parent's RevenueMAX already attributes booked jobs and revenue, which this repo recorded as inseparable overlap; targeting 1SEO vs Scorpion is moot; no client or artifact pursued. |
| KickCharge Creative | **REJECTED** (this address) | `sparky@` is a privacy contact; the contact form remains a possible non-email route |
| Powerhouse Consulting Group | INCOMPLETE | `hello@mypowerhouse.group` on its privacy page and a partnership-oriented contact page; ServiceTitan/FSM consultancy (600+ contractors), not a classic agency. Better existing offer: Revenue Proof & Renewal Pack (RevOps-partner buyer). Missing: verbatim excerpt containing the address, notice checks, ownership, a named client and an observable issue. |
| BxB Media | INCOMPLETE | vertical fit high; contact form and phone only; no clean commercial email. If none exists, the email route is rejected and BxB is preserved as another-channel opportunity. |
| Leadhub | INCOMPLETE | vertical fit high (named client Go Green Heating & Cooling); no clean commercial recipient; opt-in-database emphasis is not a ban on vendor outreach; incidental internal addresses from blog transcripts must not be used. |

## 18. Replacement discovery

Three bounded searches (search summaries only) produced seven leads: Lokal, Comrade Digital, The Roofing Marketer, Hook Agency, Relentless Digital, Think Profits, Coherency.co. **None is admitted**: none of the nine admission criteria can be established from a search summary. Too large or overlapping and excluded: CI Web Group, SmartSites, WebFX, NP Digital, Mediagistic, Blue Corona, Scorpion, Disruptive Advertising, Coalition Technologies, Marketing 360.

## 19. Stopping point: ENVIRONMENT_LIMITED

Neither stop condition A (a VERIFIED_CANDIDATE) nor B (set falsified and discovery exhausted) is reached, and neither is claimed. This sandbox cannot fetch pages, and no other lane is reachable from it (checked). Page-level work for Powerhouse, BxB Media, Leadhub and the seven leads is specified for the lane that can fetch in `artifacts/outreach/prospect-fetch-tasking-20261002.json`; results return as intake records. I did not use another tool's remote execution to fetch pages around the egress policy.

## 20. State against the target

| Flag | Value |
|---|---|
| PRODUCTION_READY, TRANSPORT_READY, GREEN_SENDERS_READY, DANA_QUARANTINED | TRUE per Mission Control (not re-verified from this sandbox) |
| COLD_ROUTE_TECHNICALLY_READY | TRUE |
| COLD_ROUTE_ENABLED | FALSE |
| PROSPECT_READY | **FALSE** (0 verified) |
| MESSAGE_READY | **FALSE**: depends on a VERIFIED_CANDIDATE; no template or invented observation produced |
| EFFECT_PACKAGE_READY_EXCEPT_HOLDS | **FALSE**: depends on MESSAGE_READY |
| LEGAL_AUTHORITY_HOLD, IDENTITY_FACT_HOLD | TRUE |

Machine-resolvable work remains (page-level verification); it is blocked by this environment's egress, not by an owner decision.

Effects: new spend $0; prospect messages 0; credential changes 0; production mutations 0.
