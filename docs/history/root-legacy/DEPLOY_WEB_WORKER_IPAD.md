# Deploy the web app and worker from an iPad

This guide is prepared for later. Do not enable live outreach yet. Mission 3 must first install the verified-contact, country, atomic sending-cap, and bounce-safety gates.

## What the finished deployment contains

- **PostgreSQL:** shared source of truth
- **UberBond Web:** storefront, dashboard, reports, payments, and API
- **UberBond Worker:** discovery, browser audits, follow-ups, reply polling, and monitoring

Both services use the same repository and `DATABASE_URL`. Their start commands are different.

## Railway path

1. Put the approved ZIP in a private GitHub repository.
2. Open Railway in Safari.
3. Create a project and add PostgreSQL.
4. Tap **+ New → GitHub Repo**, then select the UberBond repository. Name this service **UberBond Web**.
5. In the Web service, open **Settings → Config as Code** and keep `/railway.json`.
6. Open **Variables** and add `PROCESS_ROLE=web`.
7. Add a reference variable named `DATABASE_URL` that points to the PostgreSQL service.
8. Add the shared variables from `.env.example`. Keep `AUTOPILOT_ENABLED=false` and `DISCOVERY_DRY_RUN=true`.
9. Generate a public domain for the Web service. Copy its HTTPS URL into `APP_BASE_URL`.
10. Add the same GitHub repository again as a second service. Name it **UberBond Worker**.
11. In the Worker service, open **Settings → Config as Code** and enter `/railway-worker.json`.
12. Add `PROCESS_ROLE=worker` and reference the same `DATABASE_URL`.
13. Share the same secret variables with both services. The Worker needs no public domain.
14. Deploy both services.
15. Open `https://YOUR-DOMAIN/api/health`. Success means `processRole` is `web` and `worker.online` is `true`.

## Render path

The included `render.yaml` defines one Postgres database, one Docker web service, and one Docker background worker.

1. Push the repository to GitHub.
2. Open Render in Safari and create a new Blueprint.
3. Select the repository containing `render.yaml`.
4. Render prompts for service-level secrets. Paste the same `ADMIN_TOKEN`, `TOKEN_ENCRYPTION_KEY`, and final HTTPS `APP_BASE_URL` into both the Web and Worker services.
5. Apply the Blueprint with `AUTOPILOT_ENABLED=false`, `DISCOVERY_ENABLED=false`, and `DISCOVERY_DRY_RUN=true`.
6. Open `/api/health` on the Web service and confirm the separate Worker appears online.

## Secrets you must create personally

- `ADMIN_TOKEN`: a long random value, at least 32 characters
- `TOKEN_ENCRYPTION_KEY`: exactly 64 hexadecimal characters
- Gmail, payment, AI, and verification credentials only when those modules are activated

Never paste these values into chat, GitHub files, screenshots, or documentation.
