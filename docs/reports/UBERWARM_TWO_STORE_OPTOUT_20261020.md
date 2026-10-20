# Held two-store opt-out verification — 2026-10-20

Railway deployment 26a07c96-4981-4138-82e2-278f2d46c6b9 is SUCCESS; deployed source independently matches the saved bundle. Neon uberwarmoptout deployment 2 is the protected server-only companion. The existing uberwarminbound Winnr receiver was not changed.

Public endpoint: https://uberwarm-canonical-callback-production.up.railway.app/api/unsubscribe

Live fixture validation-dual@uberwarm-check.invalid: GET 200, POST 200, replay POST 200. Independent SQL queries on Railway railway and Neon neondb each read back the identical ALL_COMMERCIAL suppression with reason recipient-self-service-unsubscribe and id optout_6b6186b02c44f8b1d0dc49fcb0cabdcef440bc4b. This is a nondeliverable validation fixture, not an actual customer's request. No emails sent.

Disposable two-database test passed GET nonmutation, both stores before ACK, mirror failure 503 with local stop preserved, replay repair, incorrect origin authentication 503, and successful retry. Reproduce from repo root: node scripts/verify-uberwarm-two-store-optout.mjs. Requires pg, Python3 and existing disposable Postgres helper prerequisites. ZIP base64 contains the exact self-contained Node24 deployment, no runtime secrets. Public Railway bundle pins pg8.22.0; private bundle includes pg8.22.0 and @neon/functions0.11.0.

The public route validates the permanent recipient HMAC, commits and reads back its Railway stop, calls the fixed protected Neon URL with a separate server-only origin secret, and returns 200 only after a validated durable Neon receipt. Partial failure retains the Railway stop and returns 503. Redirects are forbidden. No raw DB credentials cross between providers.

All send flags remain disabled/dry-run. Historical October15 baseline is not current safety evidence. Vercel URLs remain blocked by account status; no billing or protection bypass was attempted. No current sender no-hold proof, real provider bounce/complaint receipt, authorized current diagnostic send receipt, commercial sends, or payments are claimed. PR source is not merged while gates are unresolved.
