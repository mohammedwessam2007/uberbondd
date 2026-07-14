# Connect PostgreSQL from iPad

Use this only when the final deployment mission says the worker is ready.

## Values the hosting dashboard will need

- `STORE_BACKEND`: `postgres`
- `DATABASE_URL`: copied from the database provider
- `DATABASE_SSL`: `true`
- `NODE_ENV`: `production`

## Safety

Never paste `DATABASE_URL` into chat, a public GitHub file, a screenshot, or a website form. Paste it only into the hosting provider's secret/environment-variable screen.

## Success looks like

The deployment logs show that migrations completed, the health endpoint returns `ok`, and the admin dashboard reports `storeBackend: postgres`.
