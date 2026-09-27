# EmailPal Provider Evidence — 2026-09-27

**Truth class:** current first-party public pricing/help/API/Terms/AUP evidence observed on 2026-09-27. This receipt does **not** claim an account, usable credential, mailbox, purchase, DNS change, legal clearance, send authorization, canary, reply, or revenue.

## Why this candidate matters

EmailPal is a new provider candidate not previously present in the exact-current UberBond repository evidence.

Unlike several rejected low-cost candidates, EmailPal's current Acceptable Use Policy explicitly says targeted, unsolicited business-to-business cold email is permitted when it complies with applicable law, while requiring relevance, truthful identity, list provenance, verification, opt-out handling, and suppression. This materially improves provider-policy fit for a narrowly lawful B2B route, but does not by itself clear campaign-specific law.

EmailPal's own hosted product is SMTP/IMAP infrastructure rather than a repackaged Google Workspace or Microsoft 365 sender seat. Public docs describe SPF/DKIM/DMARC/MX, SMTP/IMAP credential export, unified replies, REST API and MCP.

## Current public economics

First-party pricing/help pages currently state:

- Starter: **$69/month**, 50 hosted mailboxes and 50 domain slots.
- Growth: $189/month, 200 mailboxes.
- Scale: $499/month, 600 mailboxes.
- Additional hosted mailbox: $1/month after plan allowance.
- Warming: $0.60/mailbox/month.
- BYO domains: free within plan domain-slot limits.
- Pre-warmed lease: **$3/inbox/month**, warming included, outside the ordinary plan mailbox allowance.
- Pre-warmed cold-send cap: **15/day/inbox from day one**.
- Hosted plan mailbox cap: **40/day once campaign-ready**.

The $69 Starter is above the current strict ~$22–27 sender-substrate budget.

## Potential strict-budget branch: pre-warmed leases

First-party help pages describe pre-warmed leases as a separate product that does not consume Starter/Growth/Scale mailbox or domain allowance and say a user can skip domain registration and only lease pre-warmed inboxes "once billing is active."

This creates a potentially important unresolved question:

> Can a customer activate billing and lease only pre-warmed inboxes at $3/month each **without** also subscribing to the $69 Starter plan?

If yes, seven inboxes would be $21/month of sender spend and the public cap arithmetic would be 105 cold messages/day before campaign/legal/identity gates. That is raw provider arithmetic, not authorized campaign capacity.

This must be verified in the authenticated dashboard/checkout before any economic promotion.

## Contract-duration contradiction

Current first-party help pages repeatedly say pre-warmed leases have a **90-day minimum term**.

However, the current public API documentation shows example pre-warmed inventory/claim responses containing **30-day** minimum-term fields.

Treat lease duration as **CONFLICTING / ACCOUNT-CHECKOUT REQUIRED**. Do not promote either 30 or 90 days as the binding term until the live checkout shows the current contract.

## Identity concern on pre-warmed inventory

Public docs say pre-warmed inventory:

- uses EmailPal-owned domains;
- arrives with preassigned mailbox handles/personas;
- does not let the buyer choose the mailbox local-part;
- shows the addresses before purchase;
- allows changing the From/display name through the mailbox API, but changing the From name does not rename the address.

Therefore pre-warmed inventory is not automatically compatible with UberBond's truthful-identity requirement. A mailbox like `sarah.chen@...` cannot simply be treated as Mohamed/UberBond without an identity-consistency review.

Before purchase, inspect the actual shelf and verify whether usable role/neutral addresses or identity-consistent addresses exist. Do not use a misleading persona.

## Policy evidence

Current EmailPal AUP states in substance:

- cold email is permitted when it is targeted B2B outreach and lawful;
- lists must be built/sourced responsibly and verified;
- sender identity must be honest;
- opt-outs must be honored;
- platform-wide suppression is enforced;
- abusive/spammy behavior can be suspended.

Current Terms say accounts are manually verified before sending and EmailPal may ask about business, messaging and recipient-list provenance.

This makes EmailPal **policy-promising**, not campaign-cleared. Campaign-specific jurisdiction, recipient type, address type, sender identity and offer still need to satisfy law and UberBond policy.

## Technical integration evidence

Public EmailPal documentation exposes:

- SMTP and IMAP credentials;
- mailbox credential export;
- unified reply inbox;
- REST API;
- MCP;
- domain/DNS provisioning;
- warming state;
- suppression;
- list verification;
- pre-warmed inventory listing/claim endpoints;
- mailbox From-name/signature updates.

No UberBond adapter has yet been found in exact-current `main`.

Do not implement an adapter until the live account/checkout proves the economic path is worth promoting. If promoted, preserve provider-neutral UberFleet/UberSMTP/UberIMAP interfaces and secret custody.

## Current decision

Status: **INVESTIGATE LIVE ACCOUNT, DO NOT PURCHASE YET**.

Next evidence required:

1. Whether pre-warmed-only billing works without the $69 Starter plan.
2. Exact first charge and recurring commitment.
3. Whether the binding minimum term is 30 or 90 days.
4. Current available inventory count and measured placement.
5. Whether inventory contains truthfully usable sender identities/role addresses.
6. Exact account verification requirements for an Egypt-based customer.
7. Whether the narrowed UK-incorporated-company route passes EmailPal's own account review.
8. Exact checkout taxes/fees.
9. Credential/export/reply behavior in the authenticated account.

No owner payment action is appropriate until these are visible.
