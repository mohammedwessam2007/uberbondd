# Scoped invited business contact — provider governance reconciliation

Date: 2026-10-03. Starting main: `464285f3cc34b0ccfed4fb445e4960917c706ddf`.
This is a source/test receipt, not a claim of deployment or live send authorization.

## Canonical semantics

`SOLICITED_APPLICATION` describes an application; `REQUESTED_INFORMATION` a
request for information; `EXPLICIT_CONSENT` actual consent. None truthfully
describes every public invitation to relevant integration partners/vendors.
The distinct `INVITED_BUSINESS_CONTACT` class covers only an explicit, fresh,
first-party business invitation whose scope overlaps the proposed offer purpose.
It is not consent, a direct information request, or permission to send.

The existing global router calls the canonical provider verifier. Qualification
re-derives invitation scope, first-party source ownership, freshness, contact
publication/channel binding and no-solicitation checks. Generic contact pages,
public email alone, guessed addresses, third-party evidence, stale invitations,
careers/customer-support/affiliate invitations and unrelated proposals fail.
Unqualified `INVITED_GREEN` does not become solicited/requested information.

SMTP evaluates only that qualified new class. `PUBLIC_BUSINESS_CONTACT` and
`CONSPICUOUS_PUBLICATION` remain refused. Gmail/Postal permissions do not widen.
Powerhouse retains the existing US recipient-green/cold-provider-refused path.

## Provider policy versus UberBond conservative policy

The existing preserved provider record is
`provider:smtp-relay:winnr:cold-b2b-lawful-use`, authority `PROVIDER_POLICY`,
Winnr Software LLC, official source https://winnr.app/terms-of-service.html,
effective 2026-09-24, retrieved/verified 2026-10-03T07:32:30.000Z.
Evidence hash: `7190b2fdff58230a156677e258c10e27121da812e5a2df3b9fbd3787e8fada3d`.
Preserved source reference: `docs/WINNR_SUPPORT_RECONCILIATION_2026-10-02.md`.

The recorded terms contemplate lawful non-opted-in business contacts subject to
truthful identification, physical address, easy unsubscribe, relevant tangible
value and applicable law. Entitlement remains separate. This patch does not
convert that provider policy into general cold-email authority: UberBond's
conservative boundary admits only the evidence-qualified invited class. Missing,
stale, restrictive or non-authoritative provider evidence fails closed.

## Reachability, binding and independent gates

Canonical global-router decision -> prospect preflight -> invited route envelope
-> effect compiler -> one-button truth uses the same qualification, not a shadow
classifier. Dispatch governance independently re-verifies the invitation proof.
The proof binds company, recipient/channel, contact publication, invitation URL,
capture timestamp, excerpt hash/scope, proposed-contact purpose and provider row.
Route/effect digests bind the proof digest and policy evidence. Changed/refreshed
invitation evidence invalidates the old binding and signed approval; a removed
invitation cannot reuse its prior classification. No claim is made that an
unobserved remote website change is automatically detected.

Sender-side law is independent. Egypt remains held, including when a caller
asserts `resolved: true`; provider PASS never clears it. Missing identity/footer
requirements remain unchanged. Qualified routes never self-authorize sends.
Intelo is a hermetic positive fixture derived from the preserved official
integration-partnership scope at https://www.intelo.ai/contact; test data is not
a new live verification receipt or real effect approval.

## Executed verification

- Green-lane focused suite: **193 passed, 0 failed**.
- Prospect-preflight focused suite: **168 passed, 0 failed**.
- Existing governance/SMTP/cold-policy suites: **24 passed, 0 failed**.
- Mutations: **12/12 INVITED**, **25/25 GGL**, **26/26 OUTREACH**,
  **2/2 PROSPECT-AI** killed: **65/65**, none skipped or surviving.
- Deterministic suite: **9,065 passed, 34 failed, 55 skipped**. The 34 unique
  failure names match the exact starting-main run (9,043 passed, 34 failed,
  55 skipped); no added or removed failing tests. No hosted CI result is claimed.
- Changed JavaScript syntax and whitespace checks passed.

No new paid dependency. New spend: **$0**. Prospect sends: **0**.
Remaining Intelo sender-side legal/authority holds are intentionally preserved.
