# Environment Variables

Complete reference for the UberBond Revenue Engine (full engine). Defaults are
the values used when the variable is unset. For the zero-cost Cash Engine Lite
variant, see [`LITE_ENV_CHECKLIST.md`](LITE_ENV_CHECKLIST.md) instead.

`validateStartupConfig()` in `src/config.mjs` enforces the production rules noted
below and refuses to boot if they are unmet — this is intentional fail-closed
behavior.

## Core (required in production)

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` on deploy — this activates all fail-closed checks below. |
| `PROCESS_ROLE` | `all` (dev) / `web` (prod) | `web`, `worker`, or `all`. **Production forbids `all`** — run `web` and `worker` as separate services. |
| `STORE_BACKEND` | `json` (dev) / `postgres` (prod) | **Production requires `postgres`.** |
| `DATABASE_URL` | — | **Required when `STORE_BACKEND=postgres`.** Postgres connection string. |
| `DATABASE_SSL` | `true` in production | Set `false` only for a local non-SSL database. |
| `ADMIN_TOKEN` | — | **Production requires ≥32 chars.** Guards every `/api/*` admin route (constant-time compared). |
| `APP_BASE_URL` | `http://localhost:8080` | **Production requires `https://`.** Used for absolute links and OAuth redirect. |
| `PORT` | `8080` | HTTP listen port. |
| `TOKEN_ENCRYPTION_KEY` | — | 64-char hex. Required if Gmail/outbound is configured; encrypts stored OAuth tokens at rest. |

## Public intake & pricing

| Variable | Default | Notes |
|---|---|---|
| `PUBLIC_AUDIT_ENABLED` | `true` | Enables the public `/api/public/audit` intake. |
| `PUBLIC_RATE_LIMIT_PER_HOUR` | `8` | Per-IP public audit submissions per hour. |
| `FREE_REPORT_FINDINGS` | `1` | Findings shown free before the paywall. |
| `FULL_AUDIT_PRICE_USD` | `49` | Full report price. |
| `STRATEGY_AUDIT_PRICE_USD` | `299` | Strategy audit price. |
| `MONITORING_PRICE_USD` | `99` | Monitoring subscription price (per month). |
| `IMPLEMENTATION_FROM_USD` | `1000` | "Implementation from" anchor price. |
| `BOOKING_URL` | — | External booking link for implementation calls. |

## Payments (Lemon Squeezy)

| Variable | Default | Notes |
|---|---|---|
| `PAYMENT_PROVIDER` | `links` | `links` uses hosted checkout URLs below. |
| `FULL_AUDIT_CHECKOUT_URL` | — | Hosted checkout link for the full audit. |
| `STRATEGY_AUDIT_CHECKOUT_URL` | — | Hosted checkout link for the strategy audit. |
| `MONITORING_CHECKOUT_URL` | — | Hosted checkout link for monitoring. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | — | Verifies inbound payment webhooks (HMAC of raw body). |
| `ALLOW_TEST_PAYMENT_UNLOCK` | `false` | **Keep `false` in production.** Test-only report unlock bypass. |

## Outbound email safety (all off by default)

Live sending stays disabled until every one of these is satisfied. `OUTBOUND_ENABLED=true`
with `OUTBOUND_DRY_RUN=false` additionally requires `BUSINESS_ADDRESS`,
`OUTBOUND_ALLOWED_COUNTRIES`, Google OAuth, a 64-hex `TOKEN_ENCRYPTION_KEY`, and a
≥32-char `UNSUBSCRIBE_SECRET`.

| Variable | Default | Notes |
|---|---|---|
| `OUTBOUND_ENABLED` | `false` | Master switch for outbound. |
| `OUTBOUND_DRY_RUN` | `true` | When `true`, composes but never sends. |
| `OUTBOUND_ALLOWED_COUNTRIES` | — | Comma-separated allowlist; required for live send. |
| `OUTBOUND_HOURLY_CAP_A` / `_B` | `5` / `5` | Per-inbox hourly send cap. |
| `DEFAULT_DAILY_CAP_A` / `_B` | `20` / `20` | Per-inbox daily send cap. |
| `OUTBOUND_MIN_GAP_SECONDS` | `90` | Minimum spacing between sends. |
| `OUTBOUND_BUSINESS_HOUR_START` / `_END` | `9` / `17` | Recipient-local send window. |
| `OUTBOUND_MIN_EVIDENCE_CONFIDENCE` | `0.75` | Minimum finding confidence to be outreach-eligible. |
| `OUTBOUND_HARD_BOUNCE_PAUSE_THRESHOLD` | `2` | Auto-pause after N hard bounces. |
| `OUTBOUND_COMPLAINT_PAUSE_THRESHOLD` | `1` | Auto-pause after N complaints. |
| `OUTBOUND_FAILURE_PAUSE_THRESHOLD` | `3` | Auto-pause after N send failures. |
| `OUTBOUND_PROCESS_BATCH_SIZE` | `10` | Reservations processed per worker tick. |
| `UNSUBSCRIBE_SECRET` | falls back to `TOKEN_ENCRYPTION_KEY` | Signs one-click unsubscribe tokens. |
| `BUSINESS_ADDRESS` | — | Physical address in the email footer (CAN-SPAM). Required for live send. |
| `SENDER_NAME` | `Mohamed Wessam` | From-name. |
| `SENDER_COMPANY` | `UberBond` | From-company. |

## Google / Gmail OAuth

| Variable | Default | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | — | OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | `${APP_BASE_URL}/oauth/google/callback` | Must be registered in Google Cloud. |

## Crawler & browser

| Variable | Default | Notes |
|---|---|---|
| `CHROMIUM_PATH` | — | Override Chromium binary path (usually unnecessary in the Playwright Docker image). |
| `CRAWL_CONCURRENCY` | `2` | Parallel page fetches. |
| `CRAWL_DELAY_MS` | `500` | Delay between page fetches. |
| `MAX_PAGES_PER_SITE` | `5` | Pages crawled per site. |
| `CRAWL_TIMEOUT_MS` | `25000` | Per-navigation timeout. |
| `SCREENSHOT_DIR` | `./data/screenshots` | Local screenshot output. |

## Durable queue & worker

| Variable | Default | Notes |
|---|---|---|
| `QUEUE_CONCURRENCY` | `2` | Concurrent jobs per worker. |
| `QUEUE_MAX_ATTEMPTS` | `5` | Retries before dead-letter. |
| `QUEUE_POLL_MS` | `1000` | Queue poll interval. |
| `QUEUE_RETRY_BASE_MS` / `QUEUE_RETRY_MAX_MS` | `30000` / `3600000` | Exponential backoff bounds. |
| `QUEUE_LOCK_TIMEOUT_MS` | `1200000` | Stale-job reclaim threshold. |
| `QUEUE_JOB_HEARTBEAT_MS` | `15000` | In-flight job heartbeat. |
| `QUEUE_MAX_RUNTIME_MS` | `900000` | Hard per-job runtime cap. |
| `WORKER_HEARTBEAT_MS` | `15000` | Worker liveness heartbeat. |
| `WORKER_STALE_MS` | `90000` | Worker considered offline after this. |

## Discovery (OpenStreetMap Overpass — off by default)

| Variable | Default | Notes |
|---|---|---|
| `DISCOVERY_ENABLED` | `false` | Master switch. |
| `DISCOVERY_DRY_RUN` | `true` | Preview without importing. |
| `DISCOVERY_OVERPASS_ENDPOINT` | `https://overpass-api.de/api/interpreter` | Overpass API endpoint. |
| `DISCOVERY_CATEGORIES` | `clinic,dentist,medical` | Whitelisted category names. |
| `DISCOVERY_BBOX` | — | Bounding box; span capped by `DISCOVERY_MAX_BBOX_SPAN` (`5`). |
| `DISCOVERY_COUNTRY` / `DISCOVERY_CITY` | — | Geographic scoping. |
| `DISCOVERY_CAMPAIGN_ID` | — | Campaign to import discovered prospects into. |
| `DISCOVERY_DAILY_CAP` | `50` | Max imports per run. |
| `DISCOVERY_RUN_EVERY_HOURS` | `24` | Scheduler cadence. |
| `DISCOVERY_TIMEOUT_MS` | `30000` | Overpass request timeout. |
| `DISCOVERY_USER_AGENT` | `UberBondRevenueEngine/1.3` | Sent to Overpass. |

## AI provider & enrichment (optional)

| Variable | Default | Notes |
|---|---|---|
| `AI_PROVIDER` | `rules` | `rules` is fully deterministic and needs no key. `anthropic`/`openai` enable model-assisted copy. |
| `ANTHROPIC_API_KEY` | — | Required only if `AI_PROVIDER=anthropic`. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Anthropic model id. |
| `OPENAI_API_KEY` | — | Required only if `AI_PROVIDER=openai`. |
| `OPENAI_MODEL` | `gpt-5-mini` | OpenAI model id. |
| `HUNTER_API_KEY` | — | Optional contact enrichment. |

## Storage, artifacts & misc

| Variable | Default | Notes |
|---|---|---|
| `DATA_DIR` | `./data` | JSON-backend data directory (dev). |
| `ARTIFACT_MAX_BYTES` | `6291456` | Max stored artifact size (6 MB). |
| `ARTIFACT_RETENTION_DAYS` | `90` | Artifact retention. |
| `ARTIFACT_DELETE_LOCAL_AFTER_UPLOAD` | `true` in production | Remove local copy after DB store. |
| `AUTOPILOT_ENABLED` | `false` | Master autopilot switch. |
| `AUTO_EMAIL_REPORTS` | `false` | Auto-email finished reports. |
| `REPORT_DELIVERY_INBOX` | `B` | Inbox used for report delivery. |
| `MONITORING_INTERVAL_DAYS` | `30` | Monitoring re-scan cadence. |
| `MONITORING_BATCH_SIZE` | `10` | Monitoring runs per batch. |
| `MAX_BATCH_SIZE` | `25` | Max prospects per manual batch. |
| `REPLY_POLL_MINUTES` | `10` | Reply-polling cadence. |
| `ALLOW_LOCAL_FIXTURES` | `false` (auto-`true` under `NODE_ENV=test`) | Allows crawling localhost fixtures — never enable in production. |

## Minimum production set (public-audit launch, no outbound)

```
NODE_ENV=production
PROCESS_ROLE=web            # and a second service with PROCESS_ROLE=worker
STORE_BACKEND=postgres
DATABASE_URL=postgres://...
DATABASE_SSL=true
ADMIN_TOKEN=<32+ random chars>
APP_BASE_URL=https://your-domain
# optional but recommended for revenue:
FULL_AUDIT_CHECKOUT_URL=https://...
LEMONSQUEEZY_WEBHOOK_SECRET=<from Lemon Squeezy>
```

## Secret handling

Never commit real values, paste secrets into chat, or place them in client-side
code. Set them only in your host's environment/secret manager. `ADMIN_TOKEN`,
`TOKEN_ENCRYPTION_KEY`, `DATABASE_URL`, and `LEMONSQUEEZY_WEBHOOK_SECRET` are the
sensitive ones.
