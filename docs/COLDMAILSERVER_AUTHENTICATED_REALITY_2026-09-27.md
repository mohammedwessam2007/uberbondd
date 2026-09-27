# Cold Mail Server Authenticated Reality — 2026-09-27

Truth class: authenticated account observations supplied from ChatGPT Work/Luna plus current public first-party terms/pricing. No purchase, card charge, domain attachment, DNS mutation, credential test, or send occurred.

## Authenticated account observations

- Account signup succeeded through email/password after Google OAuth returned 502.
- No card was entered and no subscription was purchased.
- Billing says mailbox seats and dedicated infrastructure are billed separately.
- Mailbox seats: $2.50/mailbox/month.
- Offered seat packages observed: 5, 10, 25 seats, linear pricing.
- Minimum observed seat purchase: 5 seats = $12.50/month.
- Pre-warmed inventory: $3.50/mailbox/month plus $12/domain/year, billed separately when claimed.
- Dedicated cluster: optional, starting at $49/month, with mailbox seats separately billed.
- Pending Starter record showed 1 dedicated IP allocation in progress and 1,500/day.
- Dashboard mailbox cap showed 50 sends per active mailbox/day.
- Shared/default route displayed no separate base subscription price.
- No authenticated 7-day trial activation was visible.
- One verified domain is required before mailbox creation.

## Shared-cluster checkout verification

The authenticated 5-seat checkout exposed the real current Shared-cluster economics:

- Product: Cold Email Mailbox
- Quantity: 5
- Unit rate shown: EGP 134.61/month
- Subtotal: EGP 673.05
- Shared-cluster fee: no separate line item
- Setup fee: no separate line item
- VAT: EGP 0.00
- Total due today: EGP 673.01
- Billing period: monthly
- Trial: none shown
- Other required purchase: none listed in the order
- Address is required before the payment form
- A verified domain is still required before mailbox creation

The EGP 0.04 difference between displayed subtotal and total is unexplained and should be treated as a minor checkout display discrepancy, not silently normalized.

Current evidence therefore supports:

- Shared-cluster base fee: $0 / no separate charge shown
- 5-seat Shared configuration: $12.50/month pre-tax equivalent, EGP 673.01 due today as displayed
- 10-seat Shared configuration: $25/month based on authenticated pricing, but final checkout was not independently captured
- Per-mailbox cap: 50 sends/day
- 5-seat platform ceiling: 250 sends/day
- 10-seat platform ceiling: 500 sends/day

These are platform ceilings, not safe deliverability or campaign-authorized volume.

## Dedicated-cluster economics

- Dedicated cluster is an optional add-on.
- Public price starts at $49/month.
- Mailbox seats are separately billed.
- Authenticated dedicated page shows Starter / Provisioning / PENDING_PAYMENT / 1 allocated, but no authenticated price line.
- Dedicated + minimum 5 seats is therefore at least $61.50/month before any unseen tax or fee.

## Public-vs-authenticated contradiction

Public marketing says Starter is $49/month with unlimited mailboxes/domains and no per-seat pricing, while authenticated billing says mailbox seats and dedicated infrastructure are separate. Current purchase economics must follow authenticated billing until the vendor resolves the contradiction.

## Policy status

Current public Terms at https://www.coldmailserver.com/terms-conditions prohibit **unlawful spam**, fraud, impersonation, and illegal material. The retrieved public text does not contain a blanket prohibition on all unsolicited or bulk email.

An earlier Luna statement that authenticated Terms prohibited unsolicited bulk mail was not reproduced from any authenticated Terms/AUP page and is therefore withdrawn as unsupported. The authenticated UI exposed no separate Terms/AUP text.

Policy status remains conditional on lawful targeted B2B outreach, truthful identity, valid opt-out/suppression, and campaign-specific legal eligibility gates.

## Current decision

Cold Mail Server Shared Cluster is now the cheapest authenticated purchase path found inside the product:

- 5 active SMTP/IMAP mailbox seats: EGP 673.01 displayed due today, approximately the advertised $12.50/month rate
- no separate Shared-cluster fee
- no setup fee
- VAT shown as EGP 0.00
- no other required product listed at checkout

It is purchase-ready only after explicit owner approval of the recurring 5-seat purchase and after the checkout address/payment screen is inspected for any final materially different charge or renewal term.

After purchase, the next verification sequence is:

1. attach one owned domain;
2. verify DNS;
3. create one mailbox;
4. capture SMTP/IMAP credentials into protected runtime custody;
5. send a controlled test;
6. receive and ingest a reply;
7. verify suppression/reply handling;
8. only then expand across the remaining paid seats and additional domains.

No claim of production deliverability or safe 250/day volume is made before those live tests.


## Paid transaction / entitlement incident

Owner-provided Dodo Payments evidence confirms:
- payment status: Success
- paid date: 2026-09-27
- total: EGP 673.01
- tax: EGP 0.00
- product receipt line: Cold Email Mailbox x1 at $12.50
- checkout success page had previously shown quantity 5
- Dodo payment ID: pay_0NoVvhth8jZbPcWTWW1ka
- bank descriptor: DODOPAY_COLDMAILSERVER

Cold Mail Server account state after refresh/logout/login:
- paid seats: 0
- available seats: 0
- no active seat entitlement visible

Dodo View Details returned 403 Forbidden. Cold Mail Server support was contacted; no ticket ID was exposed and no reply had arrived at the time of observation.

Current classification: PAYMENT_SUCCESS_ENTITLEMENT_NOT_APPLIED.

The receipt quantity mismatch (checkout quantity 5 versus receipt line x1 for the $12.50 five-seat package) is a plausible webhook/SKU translation hypothesis, not verified root cause.

Safety rule: do not retry payment while the successful transaction remains unreconciled.
