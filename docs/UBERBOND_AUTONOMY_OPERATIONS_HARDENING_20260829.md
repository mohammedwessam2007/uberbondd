# UberBond Autonomy Operations Hardening — 2026-08-29

This slice absorbs five external audit ideas into the current Growth Graph without creating parallel orchestration systems.

## 1. Safe egress health pool, not anti-bot evasion

UberBond may route authorized public-evidence traffic across configured egress routes for reliability/capacity. A blocked/CAPTCHA/access-denied result quarantines the route/target combination and requires review. The system explicitly refuses WebGL/canvas/device/screen/browser fingerprint spoofing, CAPTCHA bypass, access-control bypass and rotation intended to evade blocks.

## 2. Multi-key prospect identity + cross-inbox outbound guard

The repository already has unique prospect domains and outbound reservation idempotency. The new layer adds canonical DOMAIN/PHONE/EMAIL identity keys plus a daily outbound guard that is intentionally independent of inbox selection, preventing the same target/offer/contact route from being reserved by multiple inboxes on the same day.

A single SHA256(domain + phone) was rejected because missing or changed fields create avoidable false negatives. Independent canonical identity keys make collisions/aliases inspectable.

## 3. Signed billing webhook inbox before fulfillment

Lemon Squeezy webhook requests are verified against the exact raw body using HMAC-SHA256 and the X-Signature header. Verified webhooks are durably deduplicated in `billing_webhook_inbox`; they are still only provider evidence input. A later reconciliation worker must establish canonical payment truth before `programmatic-fulfillment-router.mjs` can admit provisioning.

The webhook request path never directly emails credentials or declares an order cleared merely because `order_created` arrived.

Official references checked 2026-08-29:
- https://docs.lemonsqueezy.com/help/webhooks/signing-requests
- https://docs.lemonsqueezy.com/guides/developer-guide/webhooks

## 4. Bounded database hygiene

Routine database grooming relies on PostgreSQL autovacuum rather than running `VACUUM FULL` from a serverless function. The maintenance worker only deletes bounded batches of expired `public_evidence_cache` rows and terminal expired staged-content rows. Payment receipts, customer acceptance, security/authority audit evidence, refunds/disputes and renewal evidence are not auto-delete classes.

The weekly Vercel cron is registered at `37 2 * * 0`, which is within Hobby's once-per-day minimum interval. It performs zero deletion unless `MAINTENANCE_ENABLED=true`. Existing `CRON_SECRET` admission still applies.

Official references checked 2026-08-29:
- https://www.postgresql.org/docs/current/runtime-config-vacuum.html
- https://vercel.com/docs/cron-jobs/usage-and-pricing

## 5. Private health matrix

`/api/admin/health-check` is bearer-authenticated and fails closed unless `ADMIN_HEALTH_SECRET` and `DATABASE_URL` are configured. It exposes aggregate operational telemetry only: sender pause/bounce/complaint state, 24h outbound volume, queue/dead-letter counts, Postgres connection utilization and egress pool states. It does not expose recipient email addresses and does not create commercial truth.

## Migration

`migrations/101_autonomy_operations_hygiene.sql` adds:
- `egress_route_health`
- `prospect_identity_keys`
- `outbound_contact_guard`
- `billing_webhook_inbox`

## Executable evidence

Focused isolated Node suite: **9/9 PASS**.

Killed hostile mutations:
- removing fingerprint/block-evasion admission guard -> **8/9**, exact egress hostile test fails;
- making the outbound daily guard inbox-dependent -> **8/9**, exact cross-inbox dedupe test fails;
- removing billing HMAC signature verification -> **8/9**, exact webhook-auth test fails.

All authored `.mjs` files passed `node --check` in the isolated execution harness.

No full-repository or live-Postgres green is claimed by this receipt. The migration and routes require exact-head repository/Vercel/Postgres verification before production activation.

## Activation boundaries

Code does not configure secrets. Production activation requires existing secret/configuration surfaces for:
- `BILLING_WEBHOOK_SECRET`
- `ADMIN_HEALTH_SECRET`
- `DATABASE_URL`
- `CRON_SECRET`
- optional `MAINTENANCE_ENABLED=true`

No browser fingerprint spoofing, CAPTCHA bypass, customer contact, paid provider call, purchase, DNS change, KYC change, money movement or customer-system mutation is authorized by this slice.
