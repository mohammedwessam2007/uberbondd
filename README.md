# UberBond Revenue Engine 1.4

> **Looking for the free, zero-cost launch variant?** See [`lite/`](lite/README.md) — Cash Engine Lite runs on Vercel + Neon Postgres + GitHub Actions with no paid hosting and no Stripe. Beginner setup guide: [`DEPLOY_CASH_ENGINE_LITE_IPAD.md`](DEPLOY_CASH_ENGINE_LITE_IPAD.md). It is fully isolated from everything below and does not change how the full engine runs.

UberBond is a self-hosted revenue operating system for evidence-first website audits, personalized outreach, paid reports, and recurring monitoring.

Version 1.4 completes the unattended outbound safety gate on top of the PostgreSQL and durable-worker foundation:

- automatic permitted business discovery
- Playwright desktop and mobile evidence capture
- PostgreSQL source of truth
- durable Web and Worker services
- verified-contact and first-party-published-contact enforcement
- system and campaign country allowlists
- transactional daily and hourly sending capacity
- minimum spacing between sends
- recipient-local business-hour enforcement
- durable send idempotency
- ambiguous-provider-result quarantine
- signed one-click unsubscribe
- hard-bounce and complaint suppression
- automatic sender-health pauses
- global outbound emergency stop
- one-follow-up maximum by default

It does not guarantee demand, revenue, legal compliance, inbox placement, or provider approval. Live Gmail sending remains disabled by default until the owner completes staging deployment, DNS authentication, account connection, and a controlled dry run.

## Current autonomous loop

```text
Permitted discovery or public audit request
→ durable PostgreSQL job
→ Playwright inspection
→ screenshots and deterministic evidence
→ scoring and optional AI enhancement
→ contact discovery
→ strict unattended-send safety gate
→ personalized outreach reservation
→ Gmail send or dry run
→ one safe follow-up
→ reply, bounce, complaint, and unsubscribe handling
→ private report
→ checkout and signed payment webhook
→ paid report unlock
→ recurring monitoring
```

## Services

### Web

```bash
PROCESS_ROLE=web node server.mjs
```

Provides:

- `/` public storefront
- `/report.html?token=...` customer report
- `/admin.html` protected operator dashboard
- `/api/health` service, queue, worker, and outbound status
- payment webhooks and Gmail OAuth callback
- signed unsubscribe endpoint
- shared screenshot delivery
- outbound and sender-health controls

### Worker

```bash
PROCESS_ROLE=worker node worker.mjs
```

Performs:

- scheduled discovery
- browser audits
- scoring and drafting
- outbound processing
- reply polling
- follow-up processing
- recurring monitoring
- sender-health event handling
- artifact cleanup

### Local combined mode

```bash
STORE_BACKEND=json PROCESS_ROLE=all npm start
```

Combined mode is for development only. Production validation rejects `PROCESS_ROLE=all`.

## Safe defaults

The release ships with live outbound disabled:

```env
AUTOPILOT_ENABLED=false
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
DISCOVERY_ENABLED=false
DISCOVERY_DRY_RUN=true
AI_PROVIDER=rules
```

Do not change both `OUTBOUND_ENABLED=true` and `OUTBOUND_DRY_RUN=false` until every item in `ACTIVATE_OUTBOUND_IPAD.md` is complete.

## Production variables

Minimum platform shape:

```env
NODE_ENV=production
STORE_BACKEND=postgres
DATABASE_URL=postgresql://...
DATABASE_SSL=true
PROCESS_ROLE=web                 # use worker on the second service
APP_BASE_URL=https://your-domain.example
ADMIN_TOKEN=at-least-32-random-characters
TOKEN_ENCRYPTION_KEY=64-hexadecimal-characters
UNSUBSCRIBE_SECRET=another-random-secret-at-least-32-characters
AUTOPILOT_ENABLED=false
DISCOVERY_ENABLED=false
DISCOVERY_DRY_RUN=true
OUTBOUND_ENABLED=false
OUTBOUND_DRY_RUN=true
OUTBOUND_ALLOWED_COUNTRIES=
AI_PROVIDER=rules
BUSINESS_ADDRESS=your-valid-postal-business-address
```

Both services use the same PostgreSQL database and `APP_BASE_URL`. The Worker needs the public Web URL so report and unsubscribe links resolve correctly.

## Unattended-send gate

A message cannot reserve a live send unless all required checks pass:

1. The system outbound switch is enabled.
2. The campaign is approved and `autoSend` is enabled.
3. The prospect country appears in both the system and campaign allowlists.
4. The prospect has a qualified evidence finding above the configured confidence and score thresholds.
5. The contact is either visibly published on the business's own website or positively verified as `valid` by an approved verifier.
6. Free-mail, risky-role, unknown, unverified, catch-all, mismatched-domain, and suppressed contacts are rejected.
7. The recipient is inside the configured local business-hour window.
8. Transactional daily and hourly capacity is available for the sender.
9. The configured minimum gap from the sender's previous reservation has elapsed.
10. The message-step idempotency key has never been used.
11. The sender and global outbound switches are not paused.

The reservation is stored before the provider call. If Gmail returns an ambiguous result after dispatch begins, the reservation is marked `uncertain` and is never retried automatically.

## Unsubscribe and sender health

Every live message can include:

- a signed unsubscribe URL in the body
- RFC `List-Unsubscribe` metadata
- RFC one-click unsubscribe metadata

Negative replies and unsubscribe requests enter suppression immediately. Hard bounces and complaints update sender health. Configured thresholds pause the sender automatically. The dashboard can pause all outbound activity independently of pausing background workers.

## Database and queue

Run migrations:

```bash
npm run db:migrate
```

Import an older JSON database:

```bash
npm run db:import-json -- --file=./data/db.json --dry-run
npm run db:import-json -- --file=./data/db.json
```

The database stores prospects, campaigns, evidence, messages, replies, suppressions, payments, subscriptions, jobs, artifacts, outbound reservations, outbound events, and sender-health state.

The queue stores attempts, run time, locks, heartbeats, results, errors, dedupe keys, singleton keys, and dead-letter state. Jobs abandoned by a crashed Worker are recovered after the lock timeout.

## Shared screenshots

In PostgreSQL mode, Worker-created screenshots are copied into the `artifacts` table. Report URLs point to `/api/public/artifacts/...`, allowing the Web container to serve evidence created by a separate Worker container.

Launch-stage settings:

```env
ARTIFACT_MAX_BYTES=6291456
ARTIFACT_RETENTION_DAYS=90
ARTIFACT_DELETE_LOCAL_AFTER_UPLOAD=true
```

Move high screenshot volume to S3-compatible object storage later.

## Verification

```bash
npm ci
npm run check
npm run smoke
npm run smoke:discovery
npm run smoke:postgres
npm run smoke:postgres-app
npm run smoke:queue
npm run smoke:services
npm run smoke:outbound
npm run probes
npm run probes:outbound
npm run visual
npm audit --omit=dev
```

`smoke:services` starts a temporary PostgreSQL database, one Web process, one separate Worker process, and a controlled target site. It confirms durable audit execution and shared artifact delivery.

`smoke:outbound` uses real PostgreSQL transactions and a mocked Gmail provider. It confirms atomic capacity, single provider invocation, idempotent duplicate rejection, complaint-triggered sender pause, and pause enforcement.

## Automatic discovery

The OpenStreetMap Overpass provider:

- accepts only whitelisted categories
- restricts geographic bounding-box size
- requires a public website
- normalizes and deduplicates domains
- records source attribution
- uses transactional daily capacity
- defaults to preview mode

The system does not scrape Google Maps, LinkedIn, or protected social platforms.

## Revenue features

- free opportunity snapshot
- paid full audit
- strategy review offer
- implementation call to action
- recurring monitoring subscription records
- signed Lemon Squeezy webhook adapter
- idempotent order and revenue ledgers
- optional transactional report email
- revenue and MRR dashboard

Payment and Gmail features require owner-created accounts and credentials.

## Remaining live-validation boundary

The release has not yet sent a real commercial message through Gmail or received a real provider complaint event. Before live activation, complete:

- deployed Web, Worker, and PostgreSQL health check
- sender-domain SPF, DKIM, and DMARC setup
- Gmail OAuth connection
- real unsubscribe test to a controlled mailbox
- real bounce test to a controlled invalid address
- payment test mode checkout and webhook
- discovery preview review
- small dry-run campaign review
- explicit jurisdiction and campaign allowlist decision
- tiny staged live campaign with manual observation

See `ACTIVATE_OUTBOUND_IPAD.md`, `POLICY_BOUNDARIES.md`, and `docs/LIMITATIONS.md`.

## iPad operator guides

- `START_HERE_IPAD.md`
- `DEPLOY_WEB_WORKER_IPAD.md`
- `CONNECT_POSTGRES_IPAD.md`
- `ACTIVATE_OUTBOUND_IPAD.md`
- `WORKER_RECOVERY_IPAD.md`
- `MIGRATE_JSON_IPAD.md`
- `ROLLBACK_IPAD.md`
