# Deployment Checklist: Version 1.4

## Repository and database

- [ ] Create a private GitHub repository.
- [ ] Upload the approved release, excluding `node_modules`.
- [ ] Confirm the platform performs `npm ci`.
- [ ] Create one managed PostgreSQL database.
- [ ] Create one Web service with `PROCESS_ROLE=web`.
- [ ] Create one Worker service with `PROCESS_ROLE=worker`.
- [ ] Share the same `DATABASE_URL` and public `APP_BASE_URL`.
- [ ] Keep `OUTBOUND_ENABLED=false` and `DISCOVERY_ENABLED=false`.
- [ ] Confirm migrations complete.
- [ ] Confirm `/api/health` is healthy.
- [ ] Confirm a recent Worker heartbeat appears.
- [ ] Confirm a Worker-created screenshot is visible from the Web service.

## Protected variables

- [ ] Generate a long `ADMIN_TOKEN`.
- [ ] Generate a 64-character hexadecimal `TOKEN_ENCRYPTION_KEY`.
- [ ] Generate a separate `UNSUBSCRIBE_SECRET` with at least 32 characters.
- [ ] Add a valid `BUSINESS_ADDRESS`.
- [ ] Use HTTPS for `APP_BASE_URL`.
- [ ] Keep `AI_PROVIDER=rules` for the initial deployment.
- [ ] Keep all secrets out of source files and chat messages.

## Public funnel and payments

- [ ] Submit a website you own or are authorized to test.
- [ ] Confirm desktop and mobile evidence loads.
- [ ] Confirm every finding is backed by stored evidence.
- [ ] Confirm free findings and paid locks behave correctly.
- [ ] Connect payment-provider test mode.
- [ ] Verify the signed webhook.
- [ ] Confirm repeated webhook delivery does not duplicate revenue.
- [ ] Test refund and subscription-cancellation events.

## Gmail and sender identity

- [ ] Create a dedicated UBERBOND sender account.
- [ ] Configure SPF and DKIM for the sending domain.
- [ ] Configure DMARC for the initial monitoring stage.
- [ ] Create Google OAuth credentials.
- [ ] Add OAuth secrets only to protected platform variables.
- [ ] Connect Gmail through the admin dashboard.
- [ ] Confirm the provider reports sender authentication as passing.

## Outbound safety activation

- [ ] Choose one narrow reviewed jurisdiction.
- [ ] Put the same country in `OUTBOUND_ALLOWED_COUNTRIES` and the campaign allowlist.
- [ ] Test the signed unsubscribe URL using an address you own.
- [ ] Confirm suppression blocks another reservation.
- [ ] Run discovery in preview mode.
- [ ] Run outbound in dry-run mode.
- [ ] Inspect every contact, finding, and message.
- [ ] Confirm free-mail, unknown, mismatch, catch-all, risky, and suppressed contacts are rejected.
- [ ] Confirm recipient-local business hours are enforced.
- [ ] Confirm global outbound pause works.
- [ ] Start only a tiny observed live test.

## Stop conditions

- [ ] Pause all outbound after any duplicate or inaccurate claim.
- [ ] Pause after unexpected authentication or provider errors.
- [ ] Pause after a complaint or hard-bounce cluster.
- [ ] Do not increase volume until sender health and message quality are stable.
