# XPay signed intake — bounded implementation checkpoint

Base main: `647d1cf794b2b22e0be3275600da4b4a157152db`.

Owner-created individual XPay account is IN REVIEW, 86%; live mode is disabled.
The provider-side UberBond sandbox link is a test fixture, not a live offer.
No real payment, settled funds, legal clearance or purchase readiness is proven.

This change adds raw-byte HMAC verification, 300-second replay protection,
test/live mode isolation, event-ID dedupe identity and durable billing inbox
admission at `POST /api/webhooks/xpay`, composed through `portable-server.mjs`.
It is disabled unless `DATABASE_URL`, `XPAY_WEBHOOK_SECRET` and explicit
`XPAY_WEBHOOK_ENVIRONMENT=test|live` are configured. No secrets are in git.

Only checkout session lifecycle events are admitted. Do not subscribe charge,
refund or customer events to this intake until their handlers are implemented.
Provider customer data, card data, metadata and client secrets are not stored.
No paid-order witness, revenue entry, fulfilment, live readiness or authority is
created by intake. Existing PayPal-only reconciliation worker scope is preserved;
XPay rows remain pending, not falsely marked RECONCILED.

## Remaining work, not completion

- Exact-head test/CI review and merge before deployment.
- XPay canonical order/invoice/amount/currency/charge binding and witness triad,
  with refund/dispute invalidation; test events must never create real revenue.
- Provider webhook registration and protected signing-secret configuration;
  these have NOT happened. Do not register a URL before a deployed handler exists.
- XPay live approval and written settlement eligibility for the actual bank
  account, especially the QNB youth-account restrictions.
- Real provider-origin reconciled payment receipt; exact legal route clearance;
  fresh distribution readiness and incremental $69 economics.

Official specifications inspected 2026-10-05:

- https://docs.xpay.app/en/integrate/webhooks/verifying-signatures
- https://docs.xpay.app/en/integrate/webhooks/event-reference
- https://docs.xpay.app/en/api-reference/objects/checkout-session

No Winnr purchase. No prospect messages. No automatic material replies.
