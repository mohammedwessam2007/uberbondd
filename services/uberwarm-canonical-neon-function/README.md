# UberWarm: Winnr → Neon *canonical* signed ingress

This is the current **production Winnr receiver**, superseding the prior Supabase-hosted ingress as the active provider destination without deleting the historical source/receipt.

- Live function: Neon `dry-block-28586215` (`uberbond-lite`), branch `br-long-glade-at2hwz37`, slug `uberwarminbound` (Node.js 24).
- Exact HTTPS URL: `https://br-long-glade-at2hwz37-uberwarminbound.compute.c-9.us-east-1.aws.neon.tech/`.
- Winnr webhook ID `c9a55j1XPPu86ioRR0zv`, status `enabled`, adverse subscriptions `email.bounced` and `email.complained`, additional replies/relayed events.
- Provider-issued `WINNR_WEBHOOK_SECRET` is an encrypted Neon function environment variable. Database `DATABASE_URL` is *injected automatically by Neon for this exact branch*. No database-owner or connection credential crosses to Supabase, GitHub or ChatGPT.
- Body is HMAC-SHA256 verified over exact raw bytes and Winnr timestamp (±300 s). Unauthenticated, stale, changed, huge or invalid events refuse without database effect.
- Event is inserted idempotently in `public.winnr_webhook_events`, and an adverse recipient is inserted into the **same database's** `public.suppressions` inside one Postgres transaction. `ON CONFLICT(value) DO NOTHING` preserves existing stops. Provider event-ID/payload conflicts refuse and roll back. HTTP 200 only after canonical readback and COMMIT. Positive events cannot clear stops or authorize mail.
- GET health checks **both** tables and their actual relationship by comparing event recipient digests against canonical suppressed recipient digests with `pgcrypto`, not comparing two ungrounded counts. `canonicalSuppressionReconciled:true` requires every adverse event to have a corresponding canonical suppression in the same DB. If PG, secret or comparison breaks, the outbound ingress fence holds.
- Sends/SMTP/provider mail transport are entirely absent from this function.

## Verified real-provider and hostile-test receipts

- October 20 2026 UTC: Node function deployment `1` reports `completed`, public GET HTTP 200 and unsigned POST HTTP 401.
- Exact signed `test.ping` fixture HTTP 200, exact replay `DUPLICATE` HTTP 200, changed bytes HTTP 401. Fixture cannot be represented as provider-origin proof.
- Protected Winnr API PATCH switched the existing callback from Supabase to this exact URL. Provider readback confirms enabled, correct subscriptions and zero consecutive failures.
- **Actual Winnr provider `POST /v1/webhooks/{id}/test`** accepted HTTP 202; independently read `GET /v1/webhooks/{id}/deliveries` with event `evt_c35ece0e076a14563219d35c8b7a5718`, `test.ping` HTTP 200. Independent Neon SQL found matching row, action `RECORDED_NO_SUPPRESSION`.
- Clearly labelled **synthetic** `email.bounced` event `evt_fixture_bounce_uberwarm_20261020` and synthetic `email.complained` event `evt_fixture_complaint_uberwarm_20261020` for `.invalid` addresses each inserted exactly once; repeated exact payloads returned `DUPLICATE`. Independent canonical SQL found both matching stop-list rows. These are fixtures, not actual customer/provider bounce and complaint observations.
- `node scripts/uberwarm-ingress-live-doctor.mjs` under protected runtime Winnr API token returns `state:CLEAR`, every observed ingress count matched its canonical suppression count, no mailing performed. A historical `CLEAR` is not a permanent authorization and never waives provider, legal, recipient or campaign gates.

**Truth boundary:** The proof is for **this Neon project/branch and its canonical store**. Before real outreach, prove the actual dispatch process points to this same canonical suppression store and reads it at send time; the separately housed Railway monitoring database (`railway`) does **not** contain the `suppressions` table and must not be promoted to a second authority. Neither a healthy webhook nor this document authorizes outbound mail. The diagnostic approval from October 19 has expired, actual current Winnr sender no-hold status and recipient-specific authorization remain unverified, and no Message-ID or Inbox placement was produced.

The original Supabase receiver, its private ingress evidence and signing secret are preserved as a historical donor/fallback; the Winnr provider endpoint currently points to Neon, not to Supabase. Do not replay provider events into both without matching dedupe and canonical-safe reconciliation.
