# Deployment

## Railway

1. Push the repository to a private GitHub repository.
2. Create a Railway project from that repository.
3. Railway builds the included Playwright Docker image.
4. Add a persistent volume at `/app/data`.
5. Set `DATA_DIR=/app/data` and `SCREENSHOT_DIR=/app/data/screenshots`.
6. Set a public domain and update `APP_BASE_URL`.
7. Add all required environment variables.
8. Confirm `/api/health` returns `ok: true`.

## Minimum production variables

```env
PORT=8080
APP_BASE_URL=https://YOUR-DOMAIN
DATA_DIR=/app/data
SCREENSHOT_DIR=/app/data/screenshots
ADMIN_TOKEN=LONG-RANDOM-VALUE
TOKEN_ENCRYPTION_KEY=64-HEX-CHARACTERS
AI_PROVIDER=rules
AUTOPILOT_ENABLED=true
PUBLIC_AUDIT_ENABLED=true
ALLOW_LOCAL_FIXTURES=false
ALLOW_TEST_PAYMENT_UNLOCK=false
```

## Volume warning

A deployment without persistent storage can lose reports and screenshots during a restart or redeploy.

## Render

The included `render.yaml` creates a Docker web service and a persistent disk. Add secrets manually in the Render dashboard.

## Health and uptime

Configure an uptime monitor against:

```text
https://YOUR-DOMAIN/api/health
```

Do not expose your admin token to an uptime service.

## Scaling rule

Do not add replicas while using the JSON store. Migrate to PostgreSQL and a durable job queue first.
