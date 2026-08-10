# Bounded Outreach Canary Runbook

This runbook activates at most one first message while keeping generic cold email blocked on Gmail API.

## 1. Keep the system asleep

Deploy Web and Worker with PostgreSQL, apply all migrations including `012_outreach_recipient_cooldowns.sql`, and keep:

```env
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
OUTBOUND_LAUNCH_PHASE=off
```

Run:

```bash
npm ci
npm run check
```

## 2. Configure the canary boundary

Store secrets only in the hosting platform's protected variables. Use a unique random value for each secret.

```env
OUTBOUND_PROVIDER=gmail-api
OUTREACH_APPROVAL_SECRET=<32-or-more-random-characters>
OUTREACH_APPROVER_ID=mohamed
OUTBOUND_ALLOWED_COUNTRIES=CA
OUTBOUND_CANARY_DAILY_CAP=1
OUTBOUND_CANARY_MIN_GAP_SECONDS=1800
OUTBOUND_ROUTE_EVIDENCE_MAX_AGE_DAYS=7
OUTBOUND_RECIPIENT_COOLDOWN_DAYS=365
OUTBOUND_DOMAIN_COOLDOWN_DAYS=90
BUSINESS_ADDRESS=<valid-postal-business-address>
```

Also configure strong admin, encryption, and unsubscribe secrets; Google OAuth; an HTTPS application URL; and SPF, DKIM, and DMARC.

## 3. Reconcile before import

Search Gmail Sent, replies, suppressions, outbound reservations, and the exact business domain. Do not create a new initial prospect for an address or company already contacted. Any `uncertain` provider outcome remains quarantined and is never automatically retried.

Known reconciliation: `careers@innovatebyday.ca`, subject `Freelance Web Developer`, was already sent on 2026-07-27 at 23:00:49 and must not be queued again as an initial message.

## 4. Prepare one eligible record

Use a current official source that explicitly invites the application, records explicit recipient consent, or contains the recipient's request for information. Preserve the exact HTTPS URL and source excerpt outside the message record as launch evidence.

The prospect needs:

- one resolved non-free-mail recipient aligned to the business domain;
- country and timezone that pass both allowlists and recipient-local business hours;
- a qualified website finding;
- a signed unsubscribe URL;
- one connected Gmail sender slot;
- no suppression, reply, prior contact, uncertain outcome, or cooldown conflict.

## 5. Turn on dry-run canary mode

```env
AUTOPILOT_ENABLED=true
OUTBOUND_ENABLED=true
OUTBOUND_DRY_RUN=true
OUTBOUND_LAUNCH_PHASE=canary
```

Restart Web and Worker. Approve the campaign and enable `autoSend`, but include only the one canary prospect.

## 6. Approve the exact effect

Send `docs/outreach/OUTREACH_APPROVAL_REQUEST.example.json` to the protected endpoint. Replace every placeholder and set source times no more than seven days apart. Never place `ADMIN_TOKEN` in a file or query string.

```bash
curl --fail-with-body \
  -X POST "https://YOUR-APP.example/api/outbound/approve-prospect" \
  -H "Authorization: Bearer $UBERBOND_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @docs/outreach/OUTREACH_APPROVAL_REQUEST.example.json
```

The response returns only digests and identifiers. The approval is bound to one prospect, campaign, recipient, sender slot, message, route, unsubscribe URL, and final provider payload. It expires within 24 hours. Any mutation fails closed.

## 7. Prove the dry run

```bash
OUTREACH_DRY_RUN_ASSUME_LIVE=true npm run outreach:dry-run
```

Proceed only when the intended prospect is the sole `eligible` row. Revoke an incorrect approval immediately:

```bash
curl --fail-with-body \
  -X POST "https://YOUR-APP.example/api/outbound/revoke-prospect-approval" \
  -H "Authorization: Bearer $UBERBOND_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"prospectId":"REPLACE_ME","followup":0,"reason":"owner-revoked"}'
```

## 8. Execute one live canary

Change only `OUTBOUND_DRY_RUN=false`, restart if required, and invoke outbound processing once. The worker handles at most one prospect per invocation. Watch the reservation and Gmail Sent in parallel.

Immediately pause after the first result:

```bash
curl --fail-with-body \
  -X POST "https://YOUR-APP.example/api/outbound/pause" \
  -H "Authorization: Bearer $UBERBOND_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"reason":"first-canary-reconciliation"}'
```

Confirm one reservation, one provider message, correct headers/body, and one Sent item. If the provider result is ambiguous, leave it `uncertain`; do not resend.

## 9. Follow-up boundary

There is no unapproved follow-up. A follow-up requires the stored original `threadId` and RFC message ID, no reply or suppression, and another exact approval with `followup: 1`. The maximum is one follow-up.

Do not raise volume from one canary until delivery, unsubscribe, suppression, bounce, reply, and duplicate-reconciliation behavior has been inspected.
