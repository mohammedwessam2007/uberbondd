# Egypt self-service commercial route: legal counsel is optional, consent proof is not

2026-10-10. **Read-only preparation.** No messages, no provider API, no spend, no private-data disclosure, no production effect, no legal clearance by fiat. The existing sender-side legal HOLD stays intact.

## Regulatory sources and working rule

Egypt PDPL Law No. 151/2020 Articles 17–18 and Executive Regulations (Ministerial Decree 816/2025) Article 18 address direct electronic marketing. The regulations describe affirmative data-subject consent, identity and purpose notice, accessible withdrawal, record retention and the relevant PDPC direct-marketing license/permit. Source guidance:
- https://www.pdpc.gov.eg/ (Egyptian Personal Data Protection Centre, Arabic and English)
- https://consortiolawfirm.com/egypt-data-protection-law-executive-regulations-2025-english/ (translated Ministerial Decree 816/2025, Article 18)
- https://eg.andersen.com/wp-content/uploads/2026/02/Law-No.-151-of-2020-1.pdf (Law 151/2020 translation, Article 17)
- https://www.bakermckenzie.com/-/media/files/insight/publications/2026/01/egypt--important-data-protection-update.pdf (implementation and compliance timing)

**Outside counsel is NOT automatically a software or legal prerequisite.** A founder can research the official PDPC self-service licensing route and collect compliance evidence personally. But *no legal fee paid* != *automatic EDM authorization*; required authorization, data-controller compliance, cross-border data rules and foreign recipient law must be satisfied if applicable. The regulator's current application portal or actual licensing availability must be verified, not invented.

## Existing UberBond reuse: do not rebuild

- `src/consent-bridge.mjs` already supports business postal/in-person, partner introduction, founder network, events and inbound content. The invited person chooses to request a report. It is not permission to send cold marketing.
- `src/consent-receipt.mjs` already implements source-/wording-bound `REPORT_DELIVERY`, `SERVICE_FOLLOW_UP`, `MARKETING_EMAIL` consents, confirmed opt-in, revocation, age/freshness and recipient-purpose-specific evidence. Never treat report delivery as marketing consent.
- `src/free-first-outreach-router.mjs` already distinguishes transactional/opt-in capacity from cold B2B and checks provider purpose rules; provider capacity is not send authorization.
- `src/outreach-cold-route-policy.mjs` already keeps the separate cold SMTP law route inert.
- PR #1377 adds a separate 24-hour claim-freshness gate; it remains a draft with hosted CI 0-step blocked, and this mission does not merge/deploy it.

## Self-service workflow (zero new paid service)

1. Start with an **actual customer-initiated request** to receive their report, or an in-person/partner introduction leading them to submit that request. Use existing Consent Bridge and native consent receipt; securely record exact terms, when, purpose, withdrawal and channel. Do not present an unsolicited electronic pitch as a 'request'.
2. Keep the first response confined to the service the customer requested. If they explicitly ask for a proposal or findings discussion, obtain scoped `SERVICE_FOLLOW_UP` consent separately and retain cancellation rights. Check controller/processor privacy and provider obligations as applicable.
3. For **promotional email**, separately obtain and record confirmed `MARKETING_EMAIL` consent; verify official PDPC EDM authorization including the sender's legal identity, class, current term and application scope. Do not assume an unverified screenshot or invented document is a valid license.
4. Re-evaluate recipient-side jurisdiction, suppression, opt-out, sender identity, live evidence freshness, account deliverability, final current preflight and owner effect authorization before any real send. No automated email or outbound recipient contact in this PR.

## Pure legal-evidence checker

`src/egypt-self-service-commercial-route.mjs` reuses `consentRelationshipFor()`, returning:
- `INBOUND_REQUEST_EVIDENCE_PRESENT` only when a genuine report-delivery/follow-up receipt covers that exact address and purpose; **not send ready**;
- `OPT_IN_AND_DECLARED_LICENSE_EVIDENCE_PRESENT_NOT_SEND_READY` when both a confirmed marketing consent and plausible current license fields are supplied; **not authenticated or send ready**;
- fail-closed for unsolicited cold marketing, missing consent, revoked/expired consent, invalid clocks and expired license declarations.

It **never** sets `sendAuthority` or `legalClearanceEstablished` true, and does not waive the currently separate sender-side legal gate. It cannot itself authenticate official PDPC license documents.

## Operational blocker truth

- **GitHub Actions:** PR #1377 has 0-step failed or skipped CI. Independent local focused tests were 370/372 with the same 2 pre-existing payment-route failures. A billing/runner lock needs account-level diagnosis, not another code rebuild. Do not present jobs as passing or bypass branch policy.
- **Production:** G-SPOT runs pre-PR1377 code until the reviewed source is actually merged/deployed. Do not trust prior UI 'ready' for >24h claim evidence.
- **Privacy:** any historical public source exposure is an owner/account visibility matter; branch source does not rewrite history. Preserve full 890 originals privately and audit for credentials before any authorized history cleanup.
- **Outbound:** still HOLD until genuine evidence, authorizations, real provider account status and current source gates converge.

**Source work added here is a voluntary zero-spend self-service preparation option, not a representation of a regulatory permit or legal advice purchased.**
