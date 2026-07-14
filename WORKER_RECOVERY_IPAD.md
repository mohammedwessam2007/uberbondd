# Worker recovery from an iPad

## Green state

Open `/api/health` on the Web address. A healthy deployment shows:

- `ok: true`
- `processRole: web`
- `worker.online: true`
- `worker.paused: false`

## Worker offline

1. Open the hosting project.
2. Tap **UberBond Worker**.
3. Open **Deployments** or **Logs**.
4. Confirm it uses `node worker.mjs` and `PROCESS_ROLE=worker`.
5. Tap **Restart** or **Redeploy**.
6. Wait about one minute and reload `/api/health`.

Jobs are stored in PostgreSQL. A job abandoned by a crashed worker is recovered after its lock expires and can be claimed by the replacement worker.

## Pause all background work

Use the **Pause worker** button in the protected admin dashboard. The pause state is stored in PostgreSQL and survives restarts.

## Dead-letter job

A job moves to `dead-letter` after exhausting its retries. Open the Jobs area in the admin dashboard, read the last error, fix the underlying account or configuration problem, then tap **Retry** once.

Repeatedly retrying without fixing the cause can create provider costs or duplicate external actions.

## Emergency rule

Keep campaign `autoSend` disabled until Mission 3 is approved. The durable worker is operational infrastructure, not permission to begin live cold sending.
