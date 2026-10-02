# Winnr Pre-Purchase Gate

Date reconciled: 2026-10-02  
Candidate: **Winnr pre-warmed bridge + Winnr Startup scale path**  
State: **TERM_RECONCILED + WAITING_AUTHENTICATED_CHECKOUT**  
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

## Written support reconciliation: pre-warmed minimum term

The historical source conflict is now resolved by same-thread written Winnr support observed on 2026-10-02.

Support stated that:
- the old 90-day minimum was removed in August 2026 for new and existing purchases;
- the current rule is **no minimum term / cancel anytime**;
- the minimum three-address pilot is **$9 charged at purchase** and **$9/month if retained**;
- cancellation can occur from the Domains page even on day 1, with the mailboxes removed immediately and no further recurring charge;
- the materially-blocklisted-at-handover swap/refund remedy still applies;
- the purchase screen should display **"Minimum term: None, cancel anytime"** before confirmation.

The older Help-page 90-day text remains preserved as historical contradiction/provenance rather than silently erased. It is no longer the current binding representation according to written support.

Implementation: `src/uberwinnr-procurement-frontier.mjs` v3 treats the term conflict as resolved but still fails closed until authenticated checkout, live green inventory, exact first charge and exact committed spend are observed.

## Current economics after written support reconciliation

Provider-written/public pricing currently supports:

- 3 pre-warmed addresses: **$9 first month**, **$9/month if retained**, nominal provider recommendation roughly 30–45 cold/day total;
- written support says **no minimum term / cancel anytime**, so current minimum committed spend is the initial **$9** if checkout matches;
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

`SAFE_TO_PURCHASE = CONDITIONAL` for the bounded $9 canary. Written support cleared the term conflict, but purchase still requires authenticated checkout to match the promised no-minimum-term / $9 commitment and live green inventory.

For the pre-warmed route, purchase readiness requires all of the following:

- current intended-use terms remain compatible;
- the written-support no-minimum-term resolution remains current;
- authenticated checkout visibly states **"Minimum term: None, cancel anytime"** or an equivalent no-commitment term;
- exact minimum committed spend is observed as **$9** for the three-address pilot;
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

`VERIFY CHECKOUT TERM + $9 COMMITMENT + CHARGE -> VERIFY ENTITLEMENT -> READ ACCOUNT -> RECHECK GREEN INVENTORY -> EXPORT SMTP/IMAP -> ENCRYPT -> CANONICAL REGISTRY -> OWNER SEED CANARY -> REPLY ROUNDTRIP -> UBERWARM² -> BOUNDED REAL COHORT -> EVIDENCE-GATED SCALE`

No mass cold send occurs during infrastructure proof.

## No-repeat-failure law

If payment succeeds but entitlement is absent, stop. Do not pay again.

If a provider write outcome is uncertain, reconcile state before any retry.

If provider sources contradict on a material commercial term, preserve the contradiction and stop spend until it is resolved.

## Truth boundary

This document records dated first-party docs, official source and written support representations. It does not transform provider claims into checkout facts, legal advice, inbox placement, sender reputation, cleared revenue or customer demand.
