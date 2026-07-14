# UBERBOND: ONE-AGENT TONIGHT LAUNCH MISSION

## Mission

Take the attached UBERBOND Revenue Engine v1.4 repository from approved local build to a live, cash-ready production system in one continuous agent session.

Do not stop after writing instructions. Operate the browser, repository, hosting dashboard, and provider consoles directly wherever the user authorizes access. Continue through diagnosis, repair, redeployment, and retesting until the acceptance criteria pass or an external provider explicitly blocks progress.

The target is **cash-ready tonight**, not a promise that a stranger will purchase tonight. Cash-ready means a real visitor can submit a website, receive a free evidence report, open a real checkout, pay through an approved live payment provider, and receive the paid result or a clearly defined fulfillment path.

## Hard rules

1. Use this repository as the canonical codebase. Do not rebuild it in another framework.
2. Do not add decorative features.
3. Do not enable live cold outreach merely to satisfy the deadline.
4. Keep `OUTBOUND_ENABLED=false`, `OUTBOUND_DRY_RUN=true`, and `DISCOVERY_DRY_RUN=true` until every controlled safety test passes.
5. Never expose secrets in chat, GitHub files, screenshots, logs, or reports.
6. Ask for user takeover only for login, MFA, payment identity, business-address confirmation, domain ownership, Gmail consent, and live-provider approval.
7. After takeover, resume automatically. Do not make the user restate the mission.
8. Diagnose and patch confirmed deployment blockers. Run tests after every code patch.
9. Do not claim a live payment loop unless an actual provider test or live low-value transaction reaches the expected webhook/delivery state.
10. Do not claim a live email loop unless one controlled message to an address owned by the user appears exactly once in Gmail Sent and the application records it exactly once.

## Preferred production topology

Use Railway unless it is unavailable or the user's account cannot deploy the required services.

Create one project with:

- PostgreSQL
- `UberBond Web`, from this repository, using `railway.json`
- `UberBond Worker`, from the same repository, using `railway-worker.json`

The Web and Worker must share the same PostgreSQL database and protected secret values. Only Web receives a public domain.

## Execution loop

For each stage:

1. Execute it.
2. Inspect logs and observable results.
3. If it fails, identify the exact cause.
4. Patch configuration first; patch code only for a confirmed defect.
5. Re-run the smallest relevant test.
6. Redeploy.
7. Re-run the stage.
8. Continue without asking for permission unless a user-only action is required.

## Stage 0: Preserve the baseline

- Confirm repository version is `1.4.0`.
- Run clean install and `npm test`.
- Expected baseline: 51 passing tests.
- Create a private GitHub repository or use the private repository selected by the user.
- Upload the complete repository without `.env`, credentials, local database content, node_modules, or temporary screenshots.
- Record the commit SHA in `TONIGHT_LAUNCH_STATUS.md`.

## Stage 1: Deploy the sleeping system

Create PostgreSQL, Web, and Worker services.

Use these initial safety values:

```text
STORE_BACKEND=postgres
PROCESS_ROLE=web                 # Web only
PROCESS_ROLE=worker              # Worker only
AUTOPILOT_ENABLED=false
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
DISCOVERY_ENABLED=false
DISCOVERY_DRY_RUN=true
AI_PROVIDER=rules
ALLOW_TEST_PAYMENT_UNLOCK=false
```

Generate strong independent values for:

- `ADMIN_TOKEN`
- `TOKEN_ENCRYPTION_KEY` (64 hexadecimal characters)
- `UNSUBSCRIBE_SECRET`

Do not print them into the conversation. Store them only in protected hosting variables and, if the user requests it, their password manager through takeover.

Set:

- `APP_BASE_URL` to the final HTTPS Web domain
- `GOOGLE_REDIRECT_URI` to `APP_BASE_URL + /oauth/google/callback`
- a valid `BUSINESS_ADDRESS` only after the user confirms it

Deploy both services.

Acceptance criteria:

- Web deployment is healthy.
- Worker deployment is healthy.
- `/api/health` reports Web role and a current Worker heartbeat.
- Database migrations complete.
- No production-secret validation failure.
- No restart loop.

## Stage 2: Validate the public audit funnel

Using a harmless public test website or a fixture allowed by the application:

- Submit one public audit.
- Confirm the durable queue receives it.
- Confirm Worker processes it.
- Confirm the report loads over HTTPS.
- Confirm the free report shows only the configured free finding count.
- Confirm screenshots load from shared storage.
- Confirm the full report remains locked without payment.

Acceptance criteria:

- One submission creates one lead and one report.
- No duplicate job after refresh or restart.
- Web and Worker logs contain no unhandled error.

## Stage 3: Connect a real checkout

Preferred path: Lemon Squeezy, only if the user's store is approved for live sales.

Products:

- Full Website Audit: USD 49 one-time
- Strategy Audit: USD 299 one-time
- Monitoring: USD 99 monthly

Configure hosted checkout URLs and signed webhook delivery to:

`APP_BASE_URL + /webhooks/lemonsqueezy`

Set the webhook secret only in protected variables.

If the provider is not live-approved tonight:

- Do not pretend payment is operational.
- Keep the public free audit working.
- Configure the strongest legitimate cash-ready fallback available from a payment account the user already owns and can legally receive through.
- Clearly label whether payment unlock is automatic or requires owner fulfillment.
- Record the provider approval as the only remaining blocker.

Test payment flow:

- First use provider test mode if available.
- Confirm checkout receives custom lead/product identifiers.
- Confirm signed webhook is accepted once.
- Confirm duplicate webhook does not duplicate revenue or unlock state.
- Confirm full report unlocks after the valid event.
- If a live low-value test is legally and technically possible, perform it only with user takeover and explicit approval.

Acceptance criteria:

- Checkout button reaches the correct hosted checkout.
- A verified payment event creates exactly one order/payment.
- The corresponding report unlocks.
- Monitoring purchase creates the expected subscription state.

## Stage 4: Connect Gmail safely

Create or use a dedicated UBERBOND sending Gmail account selected by the user.

In Google Cloud:

- Enable Gmail API.
- Create a Web OAuth client.
- Set the exact authorized redirect URI.
- Keep the consent screen in the smallest appropriate mode for the user's own account.
- Add the user as a test user when required.

Add client ID and client secret to protected hosting variables.

From the UBERBOND admin dashboard:

- Connect Email A.
- Authorize only the scopes requested by the application.
- Confirm the account appears connected.

Controlled test only:

- Create a prospect using an email account owned by the user.
- Run dry-run generation first.
- Then send one controlled message to the user's own mailbox.
- Confirm exactly one provider send, one Gmail Sent message, and one database record.
- Test the signed unsubscribe link.
- Confirm suppression blocks a second reservation.

Keep live stranger outreach disabled after this test.

## Stage 5: Domain and sender readiness

If the user owns a sending domain and mailbox provider:

- Configure SPF.
- Configure DKIM.
- Configure DMARC initially in monitoring mode unless the provider recommends otherwise.
- Confirm provider authentication checks pass.

If the user does not yet own a domain or professional mailbox:

- Do not enable automated commercial outreach tonight.
- Leave the app cash-ready through the public audit/checkout funnel.
- Record domain/mailbox acquisition as a required next action.

## Stage 6: Discovery preview

Keep:

```text
DISCOVERY_DRY_RUN=true
OUTBOUND_DRY_RUN=true
```

Configure one narrow city-sized OpenStreetMap discovery query for the user-selected niche.

- Run one preview.
- Confirm all imported candidates have a real public website.
- Confirm country and category accuracy.
- Confirm duplicate domains are rejected.
- Do not mass import.

## Stage 7: Outbound dry run only

Only after sender identity, business address, allowlists, Gmail, and domain authentication are complete:

```text
AUTOPILOT_ENABLED=true
OUTBOUND_ENABLED=true
OUTBOUND_DRY_RUN=true
```

Create one tiny campaign with:

- one jurisdiction selected by the user after current legal review
- one niche
- maximum 5 candidates
- high score threshold
- one follow-up maximum
- conservative hourly and daily caps

Inspect every generated draft against its stored evidence.

Acceptance criteria:

- Every contact is first-party published or positively verified.
- Every claim maps to evidence from the same domain.
- No invented name, metric, client result, urgency, or financial claim.
- Suppressed, risky, mismatched, free-mail, catch-all, and unknown contacts remain blocked.
- All entries remain dry run.

## Stage 8: Live launch decision

There are two valid completion states tonight.

### Completion A: Cash-ready inbound launch

Declare this complete when:

- Public Web URL is live.
- Worker is online.
- Free audit completes.
- Real checkout is operational.
- Payment event unlocks the product or triggers the documented fulfillment path.
- Gmail owner test and unsubscribe test pass.
- Public claims are factual.

This is the required minimum tonight.

### Completion B: Controlled autonomous outbound launch

This may be enabled only when all of Completion A passes plus:

- Current jurisdictional review supports the intended outreach.
- Sender domain authentication passes.
- Business identity and postal address are present.
- Tiny campaign dry run is perfect.
- User explicitly approves changing `OUTBOUND_DRY_RUN=false`.

Then send no more than the tiny observed batch. Monitor it live. Stop after the batch and return to dry run until results are reviewed.

## Automatic stop conditions

Immediately pause outbound on any of the following:

- duplicate send
- inaccurate personalization
- mismatched contact/domain
- broken unsubscribe
- authentication failure
- unexpected provider response
- hard-bounce cluster
- complaint
- database or worker instability
- uncertain legal basis

Do not disable the public audit/payment funnel when pausing outbound.

## Final deliverables

Update `TONIGHT_LAUNCH_STATUS.md` with:

- public Web URL
- commit SHA
- Web service status
- Worker status
- PostgreSQL status
- Gmail status
- domain-authentication status
- payment status
- public audit test result
- payment/unlock test result
- unsubscribe test result
- discovery-preview result
- outbound dry-run result
- whether live outbound remains disabled
- exact remaining blockers

Return a final report under 700 words. Do not spend tokens re-explaining the architecture.
