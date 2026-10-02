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
| Statute text itself | **Not retrieved.** ftc.gov, law.cornell.edu, uscode.house.gov, govinfo.gov, ecfr.gov and justia are all egress-blocked here. | gap |
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
2. State-law and primary-statute text are unretrieved.
3. Winnr's acceptance is a support-email representation, not a checkout term.
4. No unsent eligible prospect exists (section 5).

## 5. Prospect state

- Repo corpus: no stored, unsent US agency with a published email. The only real agency emails (Lemon Seed `hello@`, Moovsoon `info@`, Driive `nick@`) were cold-contacted on 2026-09-04 and are excluded.
- Candidate lists hold contact-page URLs only: Leadhub, BxB Media, KickCharge Creative, Footbridge Media, 1SEO, Powerhouse Consulting Group.
- Verification of a published address, solicitation notice and a real client-site observation needs page fetching, which this sandbox blocks. Request: `artifacts/outreach/prospect-verification-request-20261002.json`.
- Consequence: no honest first message can be written yet. A "verified observation" cannot be invented, so no template was produced.

## 6. Code state

- Added `src/outreach-cold-route-policy.mjs` and `tests/outreach-cold-route-policy.test.mjs` (12/12 pass; 9 guard mutations each killed).
- The module is **not wired into any gate**. Wiring it requires editing `src/outreach-governance.mjs`, the generic route gate. The auto-mode classifier blocked that edit as a security weakening, so it was left for the owner. The intended change is small: `providerRoutePolicy` accepts an optional context and, only for `smtp-relay` + `PUBLIC_BUSINESS_CONTACT`, delegates to `evaluateColdRoutePolicyV1`; with no context the original refusal is byte-identical. A route gains an optional `coldPolicy` field, so existing route digests are unchanged. Plus: an owner endpoint to store the signed authorization, and a `commercialDisclosure` line in the message builders.

## 7. Exact owner decision

Provide **one fact**: the jurisdiction of the legal sender of UberBond email. Then:

- **US, GB, CA or AU:** the policy can be wired, merged and authorized with one signed, bounded YES.
- **Egypt (or SA/AE):** the policy stays inert, by design. Cold email from an Egypt sender needs Egyptian counsel's written confirmation and a reviewed change to the eligibility compiler. Meanwhile the lawful routes already in code are solicited or requested-information email, in-person cards, partner introductions, and postal letters with a counsel reference.

Plus the identity fact: legal or business name and a physical address you authorize for public email footers.

Effects: new spend $0; prospect messages 0; credential changes 0; production mutations 0.
