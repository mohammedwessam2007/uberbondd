# Start Here on iPad: Mission 3

The autonomous engine now has its outbound safety armour.

## What the system can do

1. Discover permitted public businesses.
2. Audit their websites in a separate background Worker.
3. Store screenshots and evidence.
4. Find a first-party-published or positively verified business email.
5. Reject risky, unknown, mismatched, catch-all, free-mail, or suppressed contacts.
6. Enforce country allowlists and the recipient's local business hours.
7. Reserve hourly and daily sending capacity transactionally.
8. prevent duplicate sends after retries or restarts.
9. include a signed unsubscribe link.
10. pause a sender after hard bounces or complaints.

## Your action today

Keep this ZIP as the approved Mission 3 baseline. Do not switch on live outreach from a local device.

The next stage is deployment with live sending still off. You will only need to:

- connect a private GitHub repository,
- create PostgreSQL,
- create one Web service and one Worker service,
- paste protected variables,
- connect Gmail and payments through their login screens,
- run dry-run checks,
- approve a tiny first campaign.

Use these guides in order:

1. `DEPLOY_WEB_WORKER_IPAD.md`
2. `CONNECT_POSTGRES_IPAD.md`
3. `ACTIVATE_OUTBOUND_IPAD.md`
4. `WORKER_RECOVERY_IPAD.md` only when the dashboard reports a problem

Live outbound remains disabled until the activation checklist reaches its final stage.
