# Outreach safety

UberBond treats outbound contact as a controlled, evidence-backed workflow. Discovery, crawling, auditing, and draft preparation may run independently; real email sending may not.

## Default operating state

- System outbound is disabled unless `OUTBOUND_ENABLED=true`.
- Dry-run is the default at both system and campaign levels.
- A live campaign requires separate explicit system and campaign approval.
- Tests and CI use simulated providers and must never send a real message.
- The global outbound pause blocks send reservations without stopping research or reporting.
- One follow-up is the maximum campaign setting; zero is the safer default.

The working Cash Engine Lite deployment is a separate audit path. Acquisition work must not rename, replace, merge into, redeploy, or otherwise alter that production service.

## Contact admission policy

An automated-outreach candidate must pass all of these checks:

1. The email address is syntactically valid.
2. Its domain is the business website domain or a subdomain of it.
3. It is not on a free personal-email provider.
4. It is not a prohibited mailbox such as privacy, legal, abuse, security, webmaster, postmaster, no-reply, mailer-daemon, unsubscribe, or spam.
5. It is either:
   - explicitly published on a crawled page of the business website, with the source URL and an excerpt containing the address; or
   - marked `valid` by an explicitly configured verification provider and recorded as externally verified.
6. It is not suppressed by exact email or business domain.

Website evidence may come from visible text, a visible `mailto:` action, or published structured data. Hidden, disabled, template-only, `aria-hidden`, inert, zero-size, and non-rendered elements are excluded by the browser collector. Raw HTML email matches are not sufficient evidence.

The contact record keeps:

- source URL;
- extraction method;
- evidence excerpt;
- page context such as header, footer, contact page, team page, or structured data;
- role-based versus named-mailbox classification;
- public-publication and external-verification flags;
- provider verification status where applicable;
- a deterministic rank and automation-eligibility reason.

No email pattern is constructed from a person's name. An unverified enrichment result can remain visible for review but cannot be selected for automated outreach.

## Contact ranking

Ranking is relevance-oriented, not volume-oriented. Public owner, founder, managing-director, partner, director, practice-manager, marketing-leadership, doctor/dentist, and manager evidence is prioritized. A generic public business mailbox may be retained at a lower rank when it is otherwise safe. Position labels are taken only from stored page or provider evidence.

The optional Hunter adapter uses domain search and explicit verification only. It is not required for the public-website path, never places credentials in the request URL, and exposes only non-PII provider failure codes in stored results or logs.

## Evidence and copy controls

- Every outbound observation must bind to a stored crawled-page URL and excerpt.
- Degraded or incomplete crawls cannot support absence claims.
- AI enhancement cannot override deterministic evidence validation.
- Drafts must not contain invented evidence, contacts, results, clients, testimonials, urgency, ROI, revenue, ranking, conversion, patient-growth, or medical claims.
- Software assistance must be disclosed when relevant; a draft must not falsely claim a manual review.
- A message should address one supported issue, one qualitative commercial implication, one low-friction call to action, and a respectful opt-out.
- Draft quality below the configured threshold is rejected instead of being sent.

## Send-time controls

Before a provider call, the system rechecks campaign enablement, dry-run state, both live approvals, country allowlists, evidence confidence, prospect score, contact eligibility, suppression, inbox allowlist, recipient-local business hours, weekend policy, follow-up count, and unsubscribe URLs.

Capacity and idempotency are reserved durably before dispatch. Daily and hourly caps, minimum gaps, and duplicate logical sends are enforced transactionally. An ambiguous provider result becomes `uncertain` and is never retried automatically.

The final dispatch fence runs inside the durable store immediately before the provider call. It rechecks the global kill switch, inbox health, campaign identity, recipient identity, current suppression records, stored replies, payment/terminal state, exact owner-approved subject and body, follow-up limit, and system/campaign live-or-test approvals. A campaign reassignment or draft edit after reservation cancels the dispatch.

## Stop conditions

A real reply immediately cancels scheduled follow-up work. Unsubscribe, complaint, hard bounce, suppression, or verified payment permanently stops inappropriate outreach for the relevant recipient or domain. Complaints and configured bounce/failure thresholds can pause an inbox automatically.

Suppression checks occur during qualification and again immediately before the provider call. Suppression is a safety record and must not be silently removed by campaign changes, retries, or imports.

Reply recording and suppression are atomic with follow-up clearing. If an unsubscribe, reply, bounce, complaint, or verified payment arrives while a provider call is in flight, send finalization records the provider result but preserves the terminal stop and cannot recreate a follow-up.

## Data and logging

- Never hardcode credentials or place them in campaign configuration.
- Never log full email addresses, OAuth tokens, API keys, database URLs, report tokens, passwords, or provider response bodies that may contain contact data.
- Keep only the minimum source and verification evidence needed to explain contact admission and owner review.
- Do not use purchased, leaked, private, authenticated, or personal-social-network contact data.
- Do not scrape LinkedIn or automate personal social accounts.
- Do not bypass CAPTCHAs, provider limits, anti-spam controls, unsubscribe controls, or access restrictions.

## Owner responsibility

These technical controls do not determine whether a campaign is lawful or appropriate in a particular jurisdiction. The owner must approve campaign purpose, countries, sender identity, business address, offer, contact basis, and any transition from dry-run to live operation. No deployment or configuration should claim guaranteed income.

## Test proof

`npm run acceptance` uses only reserved fixtures, rules, the test Gmail adapter, and a signed provider `test_mode` webhook. It asserts one simulated initial message, no second provider call after the reply, zero real email, zero real payment, zero external network access, and no customer-site modification. It is safe to rerun and does not activate live outbound.
