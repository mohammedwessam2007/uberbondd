# Provider neutral backend bundle

`docker-compose.yml` runs the existing UberBond backend as four bounded services: PostgreSQL, a one shot migration, the HTTP server, and the durable worker. It uses the existing `Dockerfile`, `server.mjs`, `worker.mjs`, and `scripts/migrate.mjs`; it does not replace any application path.

Run `node scripts/provider-neutral-backend-doctor.mjs` with `POSTGRES_PASSWORD`, `APP_BASE_URL`, `ADMIN_TOKEN`, and `TOKEN_ENCRYPTION_KEY` set before a host rehearsal. A successful doctor result is static packaging evidence only. A real host must still run `docker compose up --build`, inspect the web healthcheck, verify worker heartbeats, and separately establish provider and customer evidence.

`POSTGRES_PASSWORD` must contain only URL safe characters (`A-Z`, `a-z`, digits, `.`, `_`, `~`, or `-`) because the existing migration/runtime contract receives it through a composed database URL. Both web and worker receive the production required `APP_BASE_URL` and `ADMIN_TOKEN` values and are checked through the existing startup validator.

The bundle has no outbound, discovery, or payment activation flags. Keep those capabilities disabled until their existing authority and external evidence gates are satisfied.
