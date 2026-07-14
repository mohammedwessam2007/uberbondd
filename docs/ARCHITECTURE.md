# Architecture: Version 1.4

```text
Visitors / operator
        │
        ▼
UberBond Web service
  storefront · dashboard · reports · unsubscribe · payment webhook · admin API
        │
        ├──────── PostgreSQL ─────────────────────┐
        │          business records               │
        │          durable jobs                   │
        │          screenshot bytes               │
        │          outbound reservations          │
        │          sender health and events       │
        │                                         │
        ▼                                         ▼
Private report pages                       UberBond Worker service
                                           discovery · Playwright audits
                                           scoring · drafts · outbound
                                           replies · follow-ups · monitoring
```

## Web service

Run with:

```text
PROCESS_ROLE=web
node server.mjs
```

It does not execute crawler jobs in production. It enqueues work, receives webhooks, serves reports and shared screenshot artifacts, handles signed unsubscribe requests, and exposes health and operator APIs.

## Worker service

Run with:

```text
PROCESS_ROLE=worker
node worker.mjs
```

It schedules and claims durable jobs, records heartbeats, renews job locks, processes retries, performs discovery and audits, processes outbound reservations, polls replies, handles follow-ups, and drains active work during shutdown.

## Durable queue

The `jobs` table contains queue, attempt, priority, run time, lock, heartbeat, retry, deduplication, singleton, result, and dead-letter state.

- Concurrent workers claim rows with locked-row skipping.
- Dedupe keys prevent the same logical scheduled job from being inserted twice.
- Singleton keys prevent overlapping reply polling, monitoring, discovery, cleanup, follow-up, and outbound-processing jobs.
- Failed jobs retry with bounded exponential delay.
- Exhausted jobs remain visible as dead letters.
- Stale active jobs are recovered after a crashed Worker disappears.
- Pause state and worker heartbeats live in PostgreSQL.

## Unattended-send safety gate

The send path is a database-backed state machine rather than a direct `draft → Gmail` call.

```text
qualified draft
→ verify system, campaign, country, contact, evidence, score, time, and suppression
→ transactionally reserve sender capacity and idempotency key
→ mark reservation dispatching
→ call Gmail once
→ mark sent, dry-run, failed, or uncertain
```

The `outbound_reservations` table protects daily and hourly capacity, minimum spacing, and exactly-once logical message steps. A duplicate idempotency key cannot create another provider call.

If the provider result is ambiguous after dispatch begins, the reservation becomes `uncertain`. It is surfaced to the operator and never retried automatically because the provider may already have accepted the message.

The `sender_health` table stores pause state and delivery counters. The `outbound_events` table preserves operational events such as bounces, complaints, suppressions, pauses, and decisions.

## Contact and evidence requirements

Automatic sending accepts only:

- an address visibly published on the business's own website, or
- an address positively verified as `valid` by an approved provider.

It rejects unknown, unverified, catch-all, free-mail, risky-role, domain-mismatched, and suppressed addresses. The draft must reference stored evidence that passes confidence, domain, and campaign score thresholds.

## Time and jurisdiction controls

The country must appear in both the system allowlist and campaign allowlist. The system derives a recipient timezone from supported country and location data and allows a reservation only inside the configured local business-hour window.

These are technical policy controls, not legal determinations. The owner remains responsible for selecting jurisdictions and campaign purpose.

## Unsubscribe and sender health

Each message can include a signed, expiring unsubscribe link and RFC one-click headers. Unsubscribe and negative responses enter suppression. Hard bounces and complaints update sender health and can pause the sender automatically. A separate global outbound pause blocks all reservations without stopping audits or reports.

## Shared artifacts

The Worker initially writes Playwright screenshots to a temporary local directory. In PostgreSQL mode, each screenshot is stored in the `artifacts` table and the dossier URL is replaced with a random public artifact URL. The Web service reads the bytes from PostgreSQL, so separate containers do not need a shared filesystem.

Expired artifacts are removed by a scheduled cleanup job and once at Worker startup.

## Migration safety

Database migrations use a PostgreSQL advisory lock. Web and Worker services can start at the same time without racing to create schema objects. Applied migration versions are skipped on later starts.

## Local mode

For local testing, JSON and a combined process remain available:

```text
STORE_BACKEND=json
PROCESS_ROLE=all
npm start
```

Production fails closed unless it uses PostgreSQL and a separate `web` or `worker` role. Live outbound also fails closed unless required sender, encryption, unsubscribe, OAuth, allowlist, and business-address configuration is present.
