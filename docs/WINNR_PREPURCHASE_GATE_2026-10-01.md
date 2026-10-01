# Winnr Pre-Purchase Gate

Date: 2026-10-01  
Candidate: Winnr Startup  
State: **WAITING_EXTERNAL_PROVIDER_CONFIRMATION**  
Purchase authority: **NONE**

## Current first-cash frontier

First-party Winnr material observed on 2026-10-01 changed the cheapest plausible pilot materially.

Official Winnr MCP source documents a **pre-warmed marketplace** with:
- **$3/address/month**;
- **3-address minimum**;
- **domain included**;
- **no base plan required**;
- **no minimum term**;
- first month charged at purchase;
- generic credential export through the normal Winnr export path;
- pre-warmed inventory health, warming-age and blocklist observations before purchase;
- cancellation that removes the purchased pre-warmed domain/mailboxes from the account and returns the asset to the marketplace.

At the provider's published normal cold-send prior of roughly **15/mailbox/day** (10–20 range), the smallest 3-address pilot is nominally **45/day for $9/month**. UberBond does **not** treat that advertised pacing as launch authority. UberWarm² starts from observed evidence and may hold the real cap at 0 or 2/day per mailbox until placement, bounce and complaint evidence exists.

Public-price crossover:
- 3 pre-warmed addresses = $9/month, nominal 45/day;
- 5 = $15/month, nominal 75/day;
- 20 = $60/month, nominal 300/day;
- 23 = $69/month, nominal 345/day;
- Startup = $69/month for 50 regular mailboxes, so above roughly 23 pre-warmed addresses Startup is cheaper on recurring public list price, but fresh Startup mailboxes still require actual reputation/ramp evidence.

Therefore the **first-cash bridge is the minimum pre-warmed canary**, not a $69 Startup purchase, unless authenticated checkout or live inventory disproves the public facts.

Implementation: `src/uberwinnr-procurement-frontier.mjs`.

## Why Winnr remains the leading transport candidate

UberBond no longer needs Winnr to supply sequencing, CRM, personalization, reply classification, warm-up intelligence, placement orchestration, DNS dashboards, analytics, or campaign logic.

The candidate is being evaluated only for the scarce physical layer:

- reputation-bearing mailbox/SMTP infrastructure;
- IMAP/inbound reply access;
- BYO-domain provisioning;
- provider-account continuity.

## Software-side pre-purchase closure

Implemented on branch `feat/uberwarm2-winnr-prepurchase-20261001`:

- UberWarm² evidence ramp;
- provider-warmup-independent progression;
- owner-controlled placement probes;
- quarantine/hold/ramp states;
- Winnr guarded API adapter;
- HMAC webhook verification;
- event normalization;
- Message-ID mapping event support;
- bulk provisioning/job boundary;
- explicit write authority;
- uncertain-write reconciliation rule;
- post-purchase activation checklist;
- UberBuy no longer marks provider warm-up as mandatory.

Therefore **Winnr's optional paid warm-up add-on is not required by UberBond's software architecture.**

## API/provisioning unknowns removed by official open-source donor

Inspection of Winnr's official MIT-licensed `winnr-app/winnr-mcp` removed several software-side ambiguities without requiring an account:

- BYO domain connection: `POST /v1/domains/connect` supports `manual_dns=true`;
- exact DNS records: `GET /v1/domains/{id}/dns-records`;
- DNS verification: `POST /v1/domains/{id}/verify-dns`;
- mailbox creation: `POST /v1/email-users` and bulk `POST /v1/email-users/bulk`;
- credential export: `POST /v1/export`, with passwords available only through write-scoped export rather than ordinary mailbox-list reads;
- export selection can target domains, specific emails, or every domain;
- mailbox listing deliberately excludes passwords;
- the provider's own MCP implementation distinguishes read, write, destructive and purchase actions.

UberBond now has matching guarded REST methods plus a generic credential compiler that encrypts exported SMTP/IMAP secrets directly into UberFleet/UberIMAP objects without returning plaintext credentials from the compiler.

## External questions already sent to Winnr support

From the UberBond mailbox on 2026-10-01:

1. exact permission for lawful unsolicited B2B commercial outreach where applicable law permits;
2. whether incorporation is required or a sole proprietor/trade name with valid business/postal identity is acceptable;
3. confirmation that authorized REST API/MCP automation is permitted despite generic non-human-access boilerplate;
4. shared-IP degradation/blocklist remediation;
5. exact definition and measurement of the advertised 90% deliverability/refund language;
6. current warming billing;
7. support for existing BYO TLDs such as .site/.shop/.online/.website/.space;
8. full SMTP/IMAP/inbound functionality while DNS remains at GoDaddy using manual records;
9. remedy if payment succeeds but provisioning/entitlement fails;
10. exact Egypt checkout/payment/tax/KYC/setup-fee conditions;
11. cancellation and no annual commitment/cancellation fee.

A second same-thread question set was also sent asking Winnr to confirm:
- that the pre-warmed marketplace is live/self-service for an Egypt-based customer;
- that the same lawful B2B use case is permitted;
- that purchased addresses expose standard SMTP + IMAP credentials;
- the current safe daily cap;
- domain/customer dedication and cancellation behavior;
- that the minimum first charge is really 3 × $3 = $9 with no mandatory Startup base fee/setup charge;
- the remedy if purchased inventory is materially degraded/blocklisted.

No support reply has been observed yet.

## SAFE_TO_PURCHASE gate

`SAFE_TO_PURCHASE = NO` until the provider answer or authenticated checkout closes these material facts:

- explicit intended-use compatibility;
- exact Egypt first charge including tax;
- exact entitlement immediately after successful payment;
- provisioning-failure remedy;
- API/MCP automation compatibility;
- cancellation/renewal terms;
- support for the chosen existing outreach domain.

These are deliberately external. More software cannot truthfully answer them.

## Once the external gate clears

Founder purchase is the only **commercial spend** action.

The remaining owner/account actions after purchase are authentication actions, not new architecture:

1. log in / complete account verification if requested;
2. create or approve a Winnr API token;
3. place the token in UberBond's protected secret store;
4. authorize the first bounded provider write.

Then UberBond's prepared sequence is:

`VERIFY CHARGE + ENTITLEMENT -> READ ACCOUNT -> VERIFY PREWARMED INVENTORY -> EXPORT 3 SMTP/IMAP CREDENTIAL SETS -> ENCRYPT INTO UBERFLEET/UBERIMAP -> WEBHOOK -> OWNER SEED CANARY -> REPLY ROUNDTRIP -> UBERWARM² -> BOUNDED REAL COHORT -> EVIDENCE-GATED SCALE`

No mass cold send occurs during infrastructure proof.

## No-repeat-failure law

If payment succeeds but entitlement is absent, stop. Do not pay again. Reconcile the provider receipt and invoke support/refund remediation.

If policy confirmation is ambiguous, stop. Do not infer permission from marketing.

If API write outcome is uncertain, stop. Do not blindly retry.

## Truth boundary

This document closes internal implementation/planning work around the candidate. It cannot create provider permission, provider entitlement, card acceptance, taxes, IP reputation, real inbox placement, or customer outcomes before they are observed.
