# UBERBOND Tonight Launch Status

Last reconciled: 2026-09-17 UTC. This file separates deployed software from owner-controlled external activation.

- Canonical version: 1.4.0
- GitHub repository: LIVE — `mohammedwessam2007/uberbondd`
- Main commit at last runtime observation: `64f36a4cb8f2b5867499945449e72ef39cbc43ac`
- Render service: LIVE — `uberbond-control-plane` on the Frankfurt free instance
- Public Web URL: https://uberbond-control-plane.onrender.com
- PostgreSQL: HEALTH CHECK 200; Postgres-backed runtime observed
- Worker service: ONLINE; worker heartbeat observed
- Vercel/Ubercel deployment lane: serving receipt recorded; Vercel deploy quota is a provider limit, not a source failure
- Cold-email send-path gate: WIRED; production default requires canonical domain/mailbox/workspace readiness before reservation or provider dispatch
- Gmail OAuth: NOT CONNECTED/NOT VERIFIED in this session
- Controlled Gmail send: NOT RUN
- Sender-domain ownership/SPF/DKIM/DMARC: NOT VERIFIED for an owner-controlled sending domain
- Discovery preview: NOT RUN
- Outbound dry run: NOT RUN
- Live outbound: DISABLED
- Free-first cold B2B capacity: 0 observed; no activated cold-capable transport
- Launch state: WAIT_EXTERNAL_ACTIVATION

Remaining owner-controlled blockers:

- Provide an owner-controlled sending domain and confirm its workspace linkage.
- Publish and freshly verify the provider-required DNS records, including SPF, DKIM, and DMARC/alignment.
- Connect one dedicated sending mailbox through the approved provider and record authenticated mailbox evidence.
- Complete provider-confirmed warm-up for that mailbox and record its current daily/hourly cap.
- Record explicit owner authorization for limited outreach on that exact domain/mailbox.
- Supply the initial lawful country/jurisdiction, niche, recipient evidence, suppression state, and campaign approval; no recipient list is inferred here.
- Run a controlled self-mail/dry-run and inspect the durable receipts before any stranger outreach.

Until every item above has fresh evidence, the system must remain in preparation-only mode. No passwords, OAuth tokens, provider keys, or recipient lists belong in chat.
