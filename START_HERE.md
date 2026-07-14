# Start Here

The canonical build is **UberBond Revenue Engine 1.4, Mission 3**.

## What is complete

- permitted automatic business discovery
- browser evidence and scoring
- PostgreSQL production state
- durable queue and separate Web/Worker services
- strict unattended-send safety gate
- transactional caps and send idempotency
- signed unsubscribe and suppression
- bounce, complaint, and sender-pause logic
- report, payment, and monitoring foundations

## Local verification

```bash
npm ci
npm run check
npm run smoke:services
npm run smoke:outbound
npm run probes:outbound
```

## Production shape

Deploy the same repository twice:

- Web: `PROCESS_ROLE=web`, start `node server.mjs`
- Worker: `PROCESS_ROLE=worker`, start `node worker.mjs`

Both services must share the same PostgreSQL `DATABASE_URL` and `APP_BASE_URL`.

## Launch boundary

The code gate is complete, but live outbound is deliberately disabled in the release defaults. Deploy first with:

```env
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
```

Then follow `ACTIVATE_OUTBOUND_IPAD.md`. Real Gmail, DNS authentication, unsubscribe delivery, bounces, payments, and jurisdiction choices still require owner-controlled accounts and staged validation.
