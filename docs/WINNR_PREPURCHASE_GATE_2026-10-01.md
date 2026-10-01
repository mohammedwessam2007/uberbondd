# Winnr Pre-Purchase Gate

Date reconciled: 2026-10-02  
Candidate: **Winnr pre-warmed bridge + Winnr Startup scale path**  
State: **WAITING_MINIMUM_TERM_RECONCILIATION + AUTHENTICATED_CHECKOUT**  
Purchase authority: **NONE**

## Current first-cash frontier

Winnr remains the narrowest plausible transport purchase because UberBond already owns sequencing, SMTP/IMAP custody, reply ingestion, placement testing, suppression, pacing, health controls and the UberWarm² evidence ramp.

Written Winnr support on 2026-10-01 materially closed many external questions for the exact route:

- the described lawful B2B outreach use is accepted under Winnr's mailing-list practices;
- sole proprietor/trade-name use is accepted without an incorporation/KYC requirement;
- official REST API/MCP automation is authorized;
- Egypt is supported and international Visa/Mastercard is accepted;
- Winnr said no setup fee, VAT/tax add-on or business-registration check is required;
- pre-warmed inventory is live/self-service in Egypt;
- pre-warmed mailboxes expose standard SMTP + IMAP credentials through normal export;
- 50 messages/mailbox/day is the hard provider cap and Winnr recommends roughly 10–15 cold messages/mailbox/day;
- the minimum three-address pre-warmed order is $9 at purchase and $9/month with no base/setup/domain fee;
- if a pre-warmed domain is materially listed at handover, support said it can be swapped for a clean one or the month refunded;
- Startup manual DNS at GoDaddy retains SMTP, IMAP and inbound replies.

These are written provider representations. They do **not** prove live inventory, authenticated checkout, actual card acceptance on this account, actual charges, inbox placement or campaign legality for every recipient.

## Material first-party contradiction: pre-warmed minimum term

UberBond found a material conflict that must remain explicit.

The official MIT Winnr MCP source currently says the pre-warmed marketplace has **no minimum term** and its cancellation tool says cancellation is allowed at any time.

The Winnr Help pages linked by support say the opposite:

- every pre-warmed purchase has a **90-day minimum term**;
- cancellation is disabled until day 90;
- the buyer owes $3/address/month for three months minimum;
- at the minimum three addresses, the Help-page commitment is therefore **$27 total minimum**: about $9 at purchase, $9 around day 30 and $9 around day 60.

The Help-page rule is economically material even though the initial checkout is still $9.

A same-thread follow-up was sent to Winnr asking which rule governs a new purchase today, whether the in-app confirmation shows the 90-day commitment, whether the MCP documentation is stale, and whether the defective-at-handover swap/refund exception still applies. No resolving reply has been observed yet.

**UberBond will not purchase until this contradiction is reconciled.**

Implementation: `src/uberwinnr-procurement-frontier.mjs` now preserves both claims and fails closed on the conflict.

## Current economics, without pretending the term is resolved

Provider-written/public pricing currently supports:

- 3 pre-warmed addresses: **$9 first month**, nominal provider recommendation roughly 30–45 cold/day total;
- Help-page minimum commitment if its 90-day rule governs: **$27 total minimum** for those 3 addresses;
- 5 addresses: $15/month;
- 20 addresses: $60/month;
- 23 addresses: $69/month;
- Startup: $69/month for 50 regular mailboxes.

Above roughly 23 pre-warmed addresses, Startup is cheaper on recurring public list price. That does not mean fresh Startup mailboxes are immediately reputation-ready.

The 50/mailbox/day number is a hard provider ceiling, not UberBond launch authority. UberWarm² may hold a new route at 0 or 2/day/mailbox until real placement, bounce and complaint evidence exists.

## Software-side closure

Implemented on branch `feat/uberwarm2-winnr-prepurchase-20261001`:

- UberWarm² evidence ramp independent of provider-paid warm-up;
- owner-controlled placement probes;
- quarantine / hold / bounded-ramp states;
- guarded Winnr REST adapter;
- HMAC webhook verification and event normalization;
- Message-ID mapping support;
- canonical Winnr provider adapter;
- provider-controlled leased-domain truth state without falsely claiming legal ownership;
- generic credential export compiler that encrypts SMTP/IMAP secrets into UberFleet/UberIMAP;
- post-purchase entitlement reconciliation before credential import;
- local canonical SendingDomain/SendingMailbox onboarding;
- production read/prepurchase/export/postpurchase routes;
- no automatic Winnr purchase endpoint.

Therefore Winnr's optional paid warming add-on is **not required** by UberBond's architecture.

## SAFE_TO_PURCHASE gate

`SAFE_TO_PURCHASE = NO`.

For the pre-warmed route, purchase readiness requires all of the following:

- current intended-use terms remain compatible;
- the MCP-vs-Help minimum-term contradiction is explicitly resolved;
- exact binding minimum term is observed;
- exact minimum committed spend is observed;
- committed spend fits a separately authorized founder ceiling;
- authenticated checkout is observed before confirmation;
- live green inventory is observed immediately before purchase;
- exact first charge is observed;
- Egypt/card/tax/KYC state remains consistent with written support at checkout;
- no unexpected base plan, setup fee or annual commitment appears.

A $9 first charge **cannot** by itself authorize a route that may commit $27.

## Once the gate clears

Founder purchase remains the only commercial-spend action. No automatic purchase authority exists.

Then:

`VERIFY TERM + COMMITMENT + CHARGE -> VERIFY ENTITLEMENT -> READ ACCOUNT -> RECHECK GREEN INVENTORY -> EXPORT SMTP/IMAP -> ENCRYPT -> CANONICAL REGISTRY -> OWNER SEED CANARY -> REPLY ROUNDTRIP -> UBERWARM² -> BOUNDED REAL COHORT -> EVIDENCE-GATED SCALE`

No mass cold send occurs during infrastructure proof.

## No-repeat-failure law

If payment succeeds but entitlement is absent, stop. Do not pay again.

If a provider write outcome is uncertain, reconcile state before any retry.

If provider sources contradict on a material commercial term, preserve the contradiction and stop spend until it is resolved.

## Truth boundary

This document records dated first-party docs, official source and written support representations. It does not transform provider claims into checkout facts, legal advice, inbox placement, sender reputation, cleared revenue or customer demand.
