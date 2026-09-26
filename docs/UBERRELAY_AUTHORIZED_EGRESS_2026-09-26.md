# UberRelay — authorized third-party egress bridge

Date: 2026-09-26  
Status: source implemented on feature branch; no live provider account, credential, DNS mutation, purchase, or email send is claimed.

## Purpose

UberBond already owns the surrounding mail organs:

- UberMail: clean-room AgentMail-like mailbox/API control plane.
- UberDoso: sovereign Postal mail-cell path.
- UberSMTP: submission adapter.
- UberEgress: evidence-bound capacity topology.
- UberWarm/UberQuality: reputation and quality-preserving volume gates.
- UberDNS: DNS control plane.

The remaining software seam was a provider-neutral bridge from an externally authorized email transport into UberEgress. That seam is **UberRelay**.

## What UberRelay does

`src/uberrelay.mjs` converts observed provider facts into an UberEgress route receipt.

It supports:

- authenticated SMTP relay routes;
- authenticated HTTP/API relay routes;
- explicit purpose classification;
- explicit provider-terms evidence;
- explicit cold-outreach authorization evidence;
- custom-domain verification;
- observed reputation evidence;
- fresh observed daily capacity;
- outbound-only vs external reply-path truth;
- sender-identity counts without treating identity count as capacity.

It performs **zero external effects** and grants **zero send authority**.

## Critical truth rules

1. Provider marketing does not prove permission.
2. A provider account does not prove cold-outreach permission.
3. Sender username count does not create independent quota.
4. Mailbox count does not create independent reputation.
5. IP count does not create capacity by itself.
6. Raw Azure Communication Services sender usernames are not Exchange inboxes.
7. Azure Communication Services is outbound-only at the email-service layer; inbound/replies need a separate route.
8. For `COLD_B2B_OUTREACH`, `coldOutreachAuthorized=true` is mandatory before capacity can enter UberEgress.
9. Fresh observed provider capacity is the only capacity UberEgress may count.
10. Unknown or stale evidence contributes zero.

## Azure ACS donor facts

Microsoft currently documents:

- custom-domain default send limits of 30 messages/minute and 100 messages/hour per subscription before approved quota increases;
- up to 100 SenderUsername/Mailfrom resources per domain;
- up to 100 domains linked to a Communication Service resource;
- higher quotas only through provider approval and reputation/failure-rate evidence;
- Email Communication Services supports outbound email, while inbound mail requires another receiving path.

Those are topology facts, not cold-outreach authorization and not a deliverability guarantee.

## External closure still required

UberRelay closes the code seam. It cannot fabricate the physical/economic facts required to launch.

A real launch still requires:

1. one purchased/configured provider route whose current terms explicitly cover the intended outreach;
2. credentials connected outside git;
3. one owned sending domain verified on that route;
4. observed authentication/DNS health and reply path;
5. observed reputation/ramp evidence;
6. an observed non-zero cold daily cap;
7. founder-supplied legal sender/postal identity and permission to publish the footer;
8. a fresh founder authorization for the canary.

Once those receipts exist, UberRelay can compile them into UberEgress and the existing launch gates can calculate a real quality-preserving daily maximum.

## Non-goals

UberRelay does not:

- bypass provider quotas;
- rotate infrastructure to evade enforcement;
- manufacture sender personas or fake employees;
- fake warm-up engagement;
- infer consent or legal eligibility;
- turn Azure sender usernames into fictional mailboxes;
- claim inbox placement from API acceptance;
- send mail merely because credentials exist.

## Verification target

`tests/uberrelay.test.mjs` verifies:

- Azure sender usernames are not interpreted as mailbox/quota multiplication;
- cold outreach fails closed without explicit provider-policy authorization;
- identity count never multiplies observed cap;
- HTTP relay evidence composes with UberEgress;
- stale/reputation-unobserved evidence contributes zero;
- receipts do not expose credentials.
