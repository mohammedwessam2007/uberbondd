# UberWarm Supabase Edge receiving node

This existing-account alternative **replaces Vercel as the HTTP hosting layer** for signed Winnr webhook ingestion. The project is `uberbond-continuity` in Frankfurt; it is not a new paid project.

- Live endpoint: `https://lslifasfebpjbtqmkitm.supabase.co/functions/v1/uberwarm-winnr-receiver`
- GET `/`: 200 with boolean status and `outboundAuthority=NONE`, no secrets.
- Unsigned POST while unconfigured: 503. This is intentional, not a provider receipt.
- Auth: only signed `X-Winnr-Timestamp` and `X-Winnr-Signature` (HMAC-SHA256, 300s freshness, raw bytes) before parsing or state changes.
- Database: additive migration `20261019_uberwarm_ingress.sql` creates separate schema with `signed_events` and irreversible `suppressions`, inaccessible to anon/authenticated or public Data API. Writes are transactionally idempotent with an advisory lock, digest collision check, and suppression readback before 200; 503 on inability to commit.
- The Edge function uses Supabase's built-in `SUPABASE_DB_URL` secret, not an extra database credential. It requires an additional real Winnr-generated `WINNR_WEBHOOK_SECRET`, which must be set through Supabase Edge Function Secrets, before event delivery can be authenticated.
- As of 2026-10-19 UTC 21:24, `WINNR_WEBHOOK_SECRET` was not configured and Winnr had zero endpoints. It is therefore *not* legitimate to claim signed ingestion, consumer reconciliation, active campaign suppression, sender no-hold or a real email send. `canonicalSuppressionReconciled=false` explicitly preserves this boundary until the Railway send/consumer gate reads these safety receipts. Never change it to true just because an event is recorded.
- This is an **ingress ledger**, not the canonical outbound stop list. Before *any* cold campaign, reconcile its adverse events into the actual canonical sender suppression gate and prove that an outage or failed reconciliation holds sending. Do not silently create competing suppression authorities.
- No outgoing email routes, SMTP code, sender token or paid warmer exist in the function.

Real-world verification: Supabase deployment returned ACTIVE; GET returned HTTP 200 JSON with `httpReady=true`, `dbConfigured=true`, `signingConfigured=false`; POST unsigned returned HTTP 503 UNCONFIGURED. SQL readback showed zero signed events and zero suppressions in the new private schema. No sender or invoice side effect.
