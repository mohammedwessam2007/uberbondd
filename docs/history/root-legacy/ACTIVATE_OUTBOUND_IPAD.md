# Activate Outbound on iPad

This guide starts with the approved Version 1.4 release. It does not ask you to edit code.

## Important rule

Keep these values until the final stage:

```text
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
AUTOPILOT_ENABLED=false
DISCOVERY_ENABLED=false
DISCOVERY_DRY_RUN=true
```

Never paste passwords, OAuth secrets, database URLs, or encryption keys into a chat message. Paste them only into the hosting platform's protected Variables or Secrets screen.

## Stage 1: deploy the sleeping system

1. Follow `DEPLOY_WEB_WORKER_IPAD.md`.
2. Open the public Web URL in Safari.
3. Add `/api/health` to the end of the URL.
4. Confirm the page reports the Web service as healthy.
5. Open the protected admin dashboard.
6. Confirm a recent Worker heartbeat appears.
7. Confirm outbound status says disabled or dry run.

Stop if the database, Worker, migrations, or heartbeat show an error.

## Stage 2: create the required secrets

In the hosting dashboard, open the shared environment-variable group used by both Web and Worker.

Add:

- `ADMIN_TOKEN`: a random value with at least 32 characters
- `TOKEN_ENCRYPTION_KEY`: exactly 64 hexadecimal characters
- `UNSUBSCRIBE_SECRET`: a different random value with at least 32 characters
- `BUSINESS_ADDRESS`: your valid postal business address
- `APP_BASE_URL`: the public HTTPS URL of the Web service

Do not reuse one secret for another field.

## Stage 3: choose the initial policy boundary

Decide one narrowly defined business market and jurisdiction after checking its current rules.

In the shared variables, set:

```text
OUTBOUND_ALLOWED_COUNTRIES=the exact initial country name
```

In the admin campaign screen, enter the same country in **Allowed countries**.

The system requires both lists to agree. An empty or mismatched list blocks sending.

## Stage 4: connect Gmail

1. Complete the Gmail OAuth setup required by the hosting guide or Google project.
2. Add the Google client ID and client secret only to protected variables.
3. Set the redirect URI to the exact public Web callback URL shown by the application.
4. Open the admin dashboard and tap the Gmail connection action.
5. Sign in to the dedicated UBERBOND sending account.
6. Approve only the scopes shown by the application.
7. Return to the dashboard and confirm the account appears connected.

Keep outbound disabled.

## Stage 5: verify sender authentication outside the app

At the domain provider, configure the email service's required SPF and DKIM records. Add DMARC in the mode recommended for the initial monitoring stage.

Confirm the email provider reports authentication as passing. Do not continue while authentication is missing or failing.

## Stage 6: test unsubscribe with your own mailbox

1. Create a controlled test prospect using an email address you own.
2. Generate a dry-run message.
3. Open its unsubscribe link.
4. Confirm the unsubscribe page loads over HTTPS.
5. Confirm the dashboard records suppression.
6. Confirm another reservation to that address is blocked.

Do not test on a stranger.

## Stage 7: run discovery preview

Set:

```text
DISCOVERY_ENABLED=true
DISCOVERY_DRY_RUN=true
```

Run one small discovery preview. Inspect every candidate. Confirm websites, countries, and business categories are accurate. Do not import a large batch.

## Stage 8: run an outbound dry run

Set:

```text
AUTOPILOT_ENABLED=true
OUTBOUND_ENABLED=true
OUTBOUND_DRY_RUN=true
```

Create one approved campaign with:

- one country
- a high score threshold
- a very small daily cap
- `autoSend` enabled
- maximum one follow-up

Inspect every generated message and its evidence. Confirm:

- the contact is first-party published or positively verified
- the evidence is true and belongs to the same domain
- the message does not invent a name, result, or financial claim
- the unsubscribe link is present
- rejected contacts remain blocked
- the dashboard shows dry-run reservations rather than provider sends

## Stage 9: controlled live test

Only after all previous stages pass:

1. Keep the campaign to a tiny, observed batch.
2. Set conservative hourly and daily caps.
3. Leave every other campaign disabled.
4. Change only:

```text
OUTBOUND_DRY_RUN=false
```

5. Restart Web and Worker if the platform requires it.
6. Watch the first reservations and Gmail Sent folder.
7. Confirm each logical message appears once.
8. Test one opt-out from a controlled account.
9. Stop immediately after any unexpected duplicate, authentication error, complaint, hard-bounce cluster, or inaccurate personalization.

## Emergency stop

In the admin dashboard, use **Pause all outbound**. This blocks new message reservations without stopping audits, reports, or payments.

For a platform-level stop, set:

```text
OUTBOUND_ENABLED=false
```

and redeploy or restart the services.

## What success looks like

- Web and Worker are healthy.
- Gmail is connected.
- Domain authentication passes.
- The same narrow country appears in both allowlists.
- Dry-run messages are factual and evidence-backed.
- Suppression prevents another reservation.
- Live test messages appear once in Gmail Sent.
- No sender-health pause or unexpected error occurs.

Do not increase volume immediately. First inspect delivery, bounces, complaints, replies, and evidence quality.
