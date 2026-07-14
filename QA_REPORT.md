# QA Report: Version 1.4 Mission 3

## Automated suite

`npm run check` passed and included JavaScript syntax validation plus **51 tests** covering:

- Chromium evidence capture
- URL and SSRF protection
- robots matching
- discovery validation and normalization
- deterministic findings and scoring
- production configuration fail-closed rules
- JSON import rollback and idempotency
- PostgreSQL schema and uniqueness
- queue claims, retries, dead letters, and stale recovery
- shared screenshots across services
- payment signature and paid-report access
- contact and evidence send gates
- country and timezone handling
- unsubscribe token signing and expiry
- transactional caps, cadence, and idempotency
- sender-health pauses
- exactly-once logical provider dispatch
- uncertain provider result quarantine

Result: **51 passed, 0 failed**.

## Adversarial probes

### Discovery

`npm run probes`

Result: **33 passed, 0 failed**.

This covered hostile bounding boxes and categories, invalid campaigns, dry-run fail-safe behavior, domain deduplication, attribution retention, admin authorization, daily-cap races, and proof that discovery cannot silently enable sending.

### Outbound

`npm run probes:outbound`

Result: **22 passed, 0 failed**.

This covered disabled and dry-run states, missing identity and unsubscribe data, country allowlists, free-mail and risky addresses, domain mismatch, unknown verification, unsafe evidence, low score, off-hours, multi-timezone ambiguity, bounce and complaint recognition, pause state, transactional caps, cadence, and idempotency.

## Integration and smoke results

- `npm run smoke`: score 71, 7 findings, 2 screenshots, simulated revenue $49
- `npm run smoke:discovery`: 2 previewed and 2 imported businesses
- `npm run smoke:postgres`: PostgreSQL 18.4, 23 public tables, uniqueness, rollback, concurrency, cap, and JSON migration passed
- `npm run smoke:postgres-app`: complete application loop on PostgreSQL passed
- `npm run smoke:queue`: 20 jobs executed exactly once; retry, dead-letter, stale recovery, and worker visibility passed
- `npm run smoke:services`: separate Web and Worker, completed job, and 14,934-byte shared screenshot passed
- `npm run smoke:outbound`: one concurrent reservation allowed, provider called once, duplicate blocked, complaint paused sender, sender pause blocked another reservation
- `npm run visual`: desktop and mobile preview generation passed
- `npm audit --omit=dev`: 0 reported vulnerabilities

## Provider boundary

Tests use real PostgreSQL transactions and controlled local services, but Gmail provider calls are mocked. The release has not yet performed a real commercial send, real one-click unsubscribe through an inbox provider, real bounce event, or real complaint event.

## Launch recommendation

Deploy first with live outbound disabled and dry-run enabled. Complete `ACTIVATE_OUTBOUND_IPAD.md` before any controlled live message.
