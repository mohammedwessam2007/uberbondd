# PHOENIX: Absolute no-vendor-paid-warmup instruction, code firewall and account confirmation boundary
Date 2026-10-12 | Owner instruction: NO OPTIONAL PAID WARM-UP FEES, NO COMPROMISE. Keep existing purchased pre-warmed mailbox pilot and unrelated services intact.

## Source truth
Latest branch PR #1403 contains prior `src/warmup-orchestrator.mjs` $0 entitlement / authenticated scoped owner authorization before provider adapter calls, but original current production `main` (298bd585d3ba0cf1fe5cdc2f81a525eb67819608) still contains the original warm-up orchestrator. THIS IS NOT DEPLOYED. DO NOT SAY A DRAFT PR PREVENTS LIVE ACCOUNT BILLING.

Additional hardening committed to branch during this session:

- `src/provider-http-adapters.mjs` no longer sends `startWarmup` or `prewarmPurchase` mutations through generic HTTP adapters. Direct method returns `UNSUPPORTED_CAPABILITY` / `UBERBOND_ZERO_PAID_WARMUP_LOCK` without calling the provider.
- A shared requestJson choke-point now rejects paid-warming mutations by semantic capability `startWarmup` / `prewarmPurchase` **AND** route path segments `prewarm`, `warmup(s)`, `warming`, etc., including generic `extensions` that try to re-label or override the method. GET evidence/status remains possible, ordinary non-warmup provider reads remain available.
- `src/ubermaildoso.mjs` separate direct account adapter blocks `createWarmup` and `updateWarmup` BEFORE authorization, including forged `*` scope. Separate read-only `warmups` and narrowly owner-approved `deleteWarmup` remain for legitimate reconciliation/cancellation.
- `src/uberwinnr-provider-adapter.mjs` and `src/uberclayinbox.mjs` already refuse paid `startWarmup`, verified by source audit.
- Tests: `tests/uberwarm-zero-addon-effect-layer.test.mjs` 5/5 pass with exact fetched source in mock crypto/HTTP V8 behavior harness; `tests/uberwarm-maildoso-zero-paid-mutations.test.mjs` 2/2 pass in mock crypto/HTTP V8 harness. Existing `tests/provider-http-adapters.test.mjs` gains 2 deny-path tests and legacy `tests/maildoso-provider-contract.test.mjs` assertion updated for intentional no-paid-lock. V8 tests are NOT actual Node/PG/SMTP provider CI; no live effects.
- Do NOT claim every future new adapter/path is automatically covered. Automated regression and review remain mandatory to keep the zero-cost policy across additions.
- NEW no-purchase, no DNS changes, no production dispatch, no deploy, no merge, no subscription change was performed by GitHub code edits.

## Winnr account-side truth
First-party billing documentation https://winnr.app/help/warming/warming-billing.html says $0.60 per enabled mailbox per month, hence $30/month for 50, enabled immediately and renews. **Pause does not stop billing. Full Disable stops future billing.** This is distinct from pre-warmed mailbox pilot $9/mo and separate Startup $69/mo.
Authenticated business Gmail was used this session to send an explicit support request to Winnr Support: check whether any paid warming is enabled including paused, fully DISABLE if yes, cancel a standalone Warming Subscription if any, prevent future paid add-on if supported, and confirm zero warming mailboxes/next renewal. **Protect other plans/domains/mailboxes, no cancellation of existing pilot.** The outbound Gmail SENT receipt was observed privately; this file deliberately does not expose message ID, personal email address or the private support thread.

**Vendor cancellation is NOT CONFIRMED.** The repo cannot disable already-enabled charges in a third-party billing database by editing source code. There was no direct authenticated Winnr billing API or account GUI tool in this session, and a broad search of both connected Gmail accounts did not reveal definitive present-day warming invoice status. Thus there remains a vendor-account renewal risk until Winnr explicitly confirms zero active warming (or authenticated account subscription UI shows zero). Never claim guaranteed zero possible charges without that account-level confirmation.

## Priority decision
1. Default incremental paid warmup = 0. No new vendor-warming enabled via our supported provider adapters.
2. If Winnr says there is active paid warming, support must disable not pause, without touching prewarmed pilot. Preserve written effective-stop receipt. If no add-on active, obtain zero-current-warming confirmation.
3. Actual exact source Node 22/isolated Postgres/CI before PR merge and deployment. Original GitHub Actions billing blocks before steps; no bypassing or paid infra purchases.
4. One final independent billing read confirms zero active warming and zero upcoming warming invoice line. Only this plus deployed source can close the user-facing no-extra-warmup-fee claim.

Founder 890 idea corpus and future GENESIS, PHOENIX, all other commercial/outreach/runtime capabilities are preserved via existing canonical repo pointers.
