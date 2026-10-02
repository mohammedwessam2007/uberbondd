# Winnr Runtime Activation Receipt — 2026-10-02

Status: **TRANSPORT VERIFIED / PLACEMENT NOT PROMOTED**

This receipt records the bounded three-mailbox Winnr canary for the provider-leased domain `cedarpointdomains.com`. It does not authorize prospect outreach or a volume ramp.

## Commercial and custody truth

- Active Winnr subscription: 3 pre-warmed mailboxes, $9/month, no base plan, no paid Winnr warming add-on.
- Provider-leased domain: `cedarpointdomains.com`.
- Mailbox credentials are persisted in UberBond as AES-256-GCM encrypted account tokens.
- Runtime receipt reports 3 mailboxes and 6 encrypted account rows.
- Plaintext credentials were not logged.
- Core UberBond domains remain outside this canary.

## Transport verification

Render direct TCP/465 could not establish the Winnr SMTP connection, while IMAP was already reachable.

A credential-free Supabase Edge Function probe then connected to `inbound.mywinnr.com:465` and received an SMTP `220` greeting. No credentials were used and no message was sent by that probe.

PR #1149 introduced a fixed-host blind tunnel:
- Supabase can open raw TCP only to the configured Winnr endpoint.
- Render performs the inner TLS handshake directly with Winnr and validates Winnr's certificate.
- SMTP authentication and message plaintext remain inside Render and the Winnr TLS session.
- The relay sees only the opaque inner TLS byte stream.
- The tunnel is WSS-only, authenticated, restricted to the exact Winnr host, and restricted to port 465.

Merged commit: `e35e9ec9df5a83ede6c2093acb983ea3e5570fc3`.

Focused tunnel tests: 3/3 pass locally.

Render deploy `dep-davsi2ijnfac73d0jag0` went live on the merged commit.

Canonical runtime receipt:
- status: `WINNR_RUNTIME_TRANSPORT_VERIFIED`
- SMTP confirmed: 3/3
- IMAP confirmed: 3/3
- mailbox 1 SMTP: previously confirmed
- mailbox 2 SMTP: accepted
- mailbox 3 SMTP: accepted
- new owner-controlled canary messages sent during final activation: 2
- credential storage: `AES_256_GCM_ENCRYPTED`
- plaintext credentials logged: false

## Placement evidence

All three owner-controlled Winnr runtime canaries reached `uberbond.co@gmail.com`.

All three were classified by Gmail as **SPAM**.

Therefore:
- transport is green;
- authentication/connectivity is green;
- inbox placement is red;
- cold prospect sending remains frozen;
- no ramp is authorized from this receipt.

This placement result is real external evidence and supersedes any earlier vendor health score, blocklist score, or warming-age implication as a promotion signal.

## Reply loop

Owner-controlled Gmail replies were sent back to Winnr mailboxes 2 and 3 after the final SMTP canaries arrived.

UberBond's canonical worker already has encrypted IMAP reply polling wired through `replies.poll`. The temporary reply-poll cadence was reduced to one minute for observation and then restored to the normal ten-minute setting. No IMAP failure was logged during the observation window, but the successful worker path is silent, so this receipt does **not** upgrade reply ingestion from inferred to independently observed database evidence.

A direct database receipt can be checked later through the Neon integration without exposing the database credential. Until then, reply ingestion remains **transport-capable but database receipt pending**.

## Cleanup

- The credential-free public Supabase TCP probe was retired after the connectivity experiment and redeployed behind JWT verification with a 410 retired response.
- The authenticated fixed-host blind tunnel remains because it is required for Render-to-Winnr SMTP transport.
- The temporary Replit experiment was never published.
- Normal reply polling cadence restored to 10 minutes.
- No new infrastructure purchase was made.
- No prospect was contacted.

## Promotion gate

Do not send cold prospects from this Winnr pilot until a new evidence cycle demonstrates acceptable placement. Any future ramp must preserve suppression/unsubscribe controls, provider limits, truthful identity, and the existing consequence gates.
