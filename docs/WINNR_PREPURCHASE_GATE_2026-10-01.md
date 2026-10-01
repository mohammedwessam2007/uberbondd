# Winnr Pre-Purchase Gate

Date: 2026-10-01  
Candidate: Winnr Startup  
State: **WAITING_EXTERNAL_PROVIDER_CONFIRMATION**  
Purchase authority: **NONE**

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

No reply has been observed yet.

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

`VERIFY ENTITLEMENT -> READ ACCOUNT -> ONE DOMAIN -> DNS -> ONE MAILBOX -> SMTP/IMAP -> WEBHOOK -> OWNER SEED CANARY -> REPLY ROUNDTRIP -> UBERWARM² -> 5 -> 10 -> 20 -> 50`

No mass cold send occurs during infrastructure proof.

## No-repeat-failure law

If payment succeeds but entitlement is absent, stop. Do not pay again. Reconcile the provider receipt and invoke support/refund remediation.

If policy confirmation is ambiguous, stop. Do not infer permission from marketing.

If API write outcome is uncertain, stop. Do not blindly retry.

## Truth boundary

This document closes internal implementation/planning work around the candidate. It cannot create provider permission, provider entitlement, card acceptance, taxes, IP reputation, real inbox placement, or customer outcomes before they are observed.
