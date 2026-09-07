# Provider-neutral backend bundle

`docker-compose.yml` runs the existing UberBond backend as four bounded services: PostgreSQL, a one-shot migration, the HTTP server, and the durable worker. It uses the existing `Dockerfile`, canonical hardened `server.mjs`, `worker.mjs`, and `scripts/migrate.mjs`; it does not replace payment, auth, queue, scheduler, store, or shutdown logic.

Run `node scripts/provider-neutral-backend-doctor.mjs` with `POSTGRES_PASSWORD`, `APP_BASE_URL`, `ADMIN_TOKEN`, and `TOKEN_ENCRYPTION_KEY` set before a host rehearsal. A successful doctor result is static packaging evidence only. A real host must still run `docker compose up --build`, inspect the web healthcheck, prove the worker actually drains durable jobs, and separately establish provider and customer evidence.

`POSTGRES_PASSWORD` must contain only URL-safe characters (`A-Z`, `a-z`, digits, `.`, `_`, `~`, or `-`) because the existing migration/runtime contract receives it through a composed database URL. Both web and worker receive the production-required `APP_BASE_URL`, `ADMIN_TOKEN`, and `TOKEN_ENCRYPTION_KEY` values and are checked through the existing startup validator.

## PayPal route bridge

`portable-server.mjs` composes around the canonical hardened `server.mjs` facade and adds a thin Node HTTP bridge for the existing PayPal order, capture, and webhook handlers. It preserves the webhook raw body, bounds request bodies, and delegates payment business logic, binding, replay, provider-witness, and authority checks to the existing handlers. It must never boot `server-core.mjs` directly.

The portable web service passes through these existing optional variables:

- `PAYPAL_SANDBOX_CLIENT_ID`
- `PAYPAL_SANDBOX_CLIENT_SECRET`
- `PAYPAL_SANDBOX_WEBHOOK_ID`

Values are supplied by the deployment environment; none belong in Git. Their presence means configuration exists, **not** that credentials are valid, the provider is callable, a webhook is registered, or money cleared. Sandbox evidence remains non-commercial and cannot create real revenue truth.

The bundle introduces no new payment-authority switch. Existing payment truth and external-evidence gates remain authoritative.

## Restart and lifecycle posture

PostgreSQL, web, and worker use `restart: unless-stopped`. Web and worker use an init process and explicit stop-grace windows so Node's existing SIGTERM/SIGINT shutdown paths have a chance to drain/close cleanly. Migration remains a one-shot service with `restart: "no"`.

These declarations are **configuration intent**, not crash-recovery proof. Do not claim unattended resilience until the exact current image has been killed/restarted on an authorized host and durable queue/store state has been observed surviving correctly.

## Proof still required

Before calling the provider-independent backend operational, exercise at minimum:

1. real PostgreSQL migration + web startup;
2. real worker startup against the same PostgreSQL instance;
3. durable scheduler/job execution;
4. secure deployment-secret injection;
5. portable PayPal route behavior with authorized provider evidence;
6. process crash/restart with durable state intact;
7. backup/restore -> cutover -> rollback of the complete backend;
8. deployment on authorized compute independent of Vercel.

No provider, payment, customer, accepted-delivery, retention, or unattended-operation truth is created by this bundle or document.
