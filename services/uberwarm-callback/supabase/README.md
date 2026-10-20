# UberWarm Supabase Edge receiving node

This existing-account alternative **replaces Vercel as the HTTP hosting layer** for signed Winnr webhook ingestion. The project is `uberbond-continuity` in Frankfurt; it is not a new paid project.

- Live endpoint: `https://lslifasfebpjbtqmkitm.supabase.co/functions/v1/uberwarm-winnr-receiver`
- GET `/`: 200 with boolean status and `outboundAuthority=NONE`, no secrets.
- Unsigned POST while unconfigured: 503. This is intentional, not a provider receipt.
- Auth: only signed `X-Winnr-Timestamp` and `X-Winnr-Signature` (HMAC-SHA256, 300s freshness, raw bytes) before parsing or state changes.
- Database: additive migration `20261019_uberwarm_ingress.sql` creates separate schema with `signed_events` and irreversible `suppressions`, inaccessible to anon/authenticated or public Data API. Writes are transactionally idempotent with an advisory lock, digest collision check, and suppression readback before 200; 503 on inability to commit.
- The Edge function uses built-in `SUPABASE_DB_URL`. It reads Winnr's real provider-issued `whsec_` signing secret from Supabase Vault (`uberwarm_winnr_signature_20261019`) or its protected function environment; no plaintext secret is committed, logged or returned.
- **Live verification 2026-10-19 21:41 UTC:** Winnr webhook endpoint `c9a55j1XPPu86ioRR0zv` exists for this exact URL. `POST /v1/webhooks/{id}/test` returned HTTP 202; independently queried Winnr delivery history returned `test.ping` with HTTP 200; Supabase `uberwarm_ingress.signed_events` contains the matching **provider-origin** `evt_34708d729037f43e17325aa290c95b64` `test.ping` receipt. Provider signing key stored encrypted in Vault, with live `signingConfigured=true`, `databaseReadback=true`. This proves the signed callback pipeline, **not** a real email, bounce, complaint or synced canonical suppression.
- This is an **ingress ledger**, not the canonical outbound stop list. Before *any* cold campaign, reconcile its adverse events into the actual canonical sender suppression gate and prove that an outage or failed reconciliation holds sending. Do not silently create competing suppression authorities.
- No outgoing email routes, SMTP code, sender token or paid warmer exist in the function.

Real-world verification: Supabase service ACTIVE; GET returned HTTP 200 `httpReady=true`, `dbConfigured=true`, `databaseReadback=true`, `signingConfigured=true`, and `canonicalSuppressionReconciled=false`. Signed provider test.ping recorded once in private Postgres (as above), with **zero** actual adverse suppressions. Actual send authority remains NONE. This is not production cold outreach or an Inbox receipt.

## Ingress fence (2026-10-19)

GET now also returns `adverseEventCount`: the number of signed bounce/complaint
events in the private ledger, aggregate only (no recipient, digest or event id).
`src/uberwarm-ingress-fence.mjs` compares it with the canonical primary-Postgres
reconciled count and the Winnr webhook state; `evaluateOutreachLaunchGate` now
requires a CLEAR fence. Any gap, stale/unreadable health, or a webhook that is not
`enabled` for `email.bounced` + `email.complained` holds sending. This source
change must be deployed to the live function before the fence can ever clear;
until then the live GET lacks the count and the fence holds.

## 2026-10-20 supersession notice

The production Winnr webhook moved to the zero-extra-database-credential **Neon direct-to-canonical** function. See `services/uberwarm-canonical-neon-function/README.md`. This Supabase implementation remains preserved as a historical signed-ingress donor and rollback possibility; do not mistake its old SQL event counts for current production events or independently clear suppression on the old route. No Supabase historical receipts or provenance were removed.
