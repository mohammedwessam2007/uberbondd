# UberBond Runtime Resilience, Storage & Payment Hardening — 2026-08-29

Base reviewed main: `848a55a926d097157d3b7edabf5ec68d892ba516`.

This slice absorbs four external-audit concerns without replacing stronger existing truth systems or introducing anti-bot behavior.

## 1. Playwright process reuse with per-job isolation

The audit correctly identified that `crawlSiteBrowser()` launched a Chromium process for every crawl. Existing code did close pages/context/browser in `finally`, so a guaranteed memory leak was not established, but repeated process launch under worker concurrency is needless churn.

The new `BrowserRuntimePool`:

- shares a bounded Chromium process per compatible runtime key;
- reserves context slots atomically;
- gives every crawl its own fresh BrowserContext;
- closes every context on lease release;
- recycles the browser after a bounded number of served contexts;
- closes shared runtimes during worker shutdown;
- never shares cookies/session state across prospects;
- does not spoof fingerprints or impersonate human browser profiles.

`src/browser-crawler.mjs` now acquires a context lease instead of launching/closing Chromium per prospect.

## 2. Overpass public-instance resilience

Current UberBond uses one bounded Overpass query per discovery run, not an unbounded query fanout, but repeated/concurrent runs previously had no provider throttle or transient retry law.

`src/overpass-throttle.mjs` now provides:

- per-endpoint serialization inside a worker process;
- bounded attempts;
- request timeout per attempt;
- `Retry-After` support when present;
- fallback 30-second delay for 406/429;
- bounded exponential retry for transient 502/503/504/network failures;
- no retry for permanent 4xx failures;
- a minimum spacing gate between calls.

The implementation deliberately does not depend on an invented `X-Overpass-Rate-Limit` contract.

High-volume commercial discovery should still move to a suitable licensed/self-hosted source rather than treating a public Overpass instance as infinite infrastructure.

## 3. Object-storage-ready artifact boundary

Current historical artifact storage is real PostgreSQL `BYTEA`, confirmed in `migrations/003_shared_artifacts.sql` and `PostgresStore.putArtifact()`.

Migration `102_runtime_resilience_and_external_artifacts.sql` adds a migration-safe dual shape:

- legacy `storage_backend='postgres'` rows retain `content` bytes;
- future `storage_backend='object'` rows store a private `storage_key` and no PostgreSQL bytes;
- a database CHECK prevents ambiguous mixed shapes;
- provider ETag metadata is available for reconciliation.

`src/artifact-storage-contract.mjs` creates deterministic private object keys and fails closed when object storage is requested without a configured adapter. It explicitly prohibits silent fallback to PostgreSQL bytes and public-by-default object receipts.

This shift is SOURCE-READY, not production-activated. No R2/S3/MinIO account, subscription, bucket, credentials or external object writes were created by this mission. Existing artifact read/write routing remains on the legacy path until an authorized private object-storage adapter is configured and integrated end-to-end.

## 4. Payment reconciliation watchdog, not fake distributed 2PC

UberBond already had stronger crash/replay payment semantics than the proposed two-phase-commit rewrite:

- provider event identity and payment-state classification;
- crash recovery after durable payment witness but before economic completion;
- exact-once concurrent duplicate collapse;
- exact-once refund replay.

The newer durable `billing_webhook_inbox` is extended rather than replaced.

Migration 102 adds:

- `claim_attempts`;
- `next_attempt_at`;
- `last_error_at`.

`claimBillingEvents()` now treats claims as recoverable leases:

- due RECEIVED/RETRYABLE work can be claimed;
- stale CLAIMED work below the attempt cap can be reclaimed;
- stale claims at the cap become UNCERTAIN rather than being blindly retried or marked paid;
- claim attempts are counted durably.

`finishBillingEvent()` now requires a canonical receipt reference before `RECONCILED`, supports bounded retry scheduling, and clears retry leases safely.

`src/payment-reconciliation-watchdog.mjs` makes the core law explicit: webhook presence never authorizes unlock or fulfillment, and UNCERTAIN provider state requires reconciliation/escalation rather than blind retry.

## Focused executable evidence

Isolated Node policy suite: **9/9 PASS**.

Killed independent hostile mutations:

- remove browser concurrency gate → **8/9**, third-context blocking test fails;
- retry permanent Overpass 400 responses → **8/9**, permanent-error test fails;
- permit object backend to persist PostgreSQL bytes → **8/9**, no-silent-fallback test fails;
- grant payment unlock from reconciliation-watchdog state → **8/9**, no-webhook-unlock test fails.

A first BrowserRuntimePool draft exposed a real acquire-slot race during review. Slot reservation was corrected to be atomic before repository integration; the corrected baseline returned to 9/9 PASS.

Repository-level exact-head/PostgreSQL/browser proof is not claimed by this document until the branch executes in trusted repo infrastructure.

## External-effect ledger

- customer/prospect contacts: 0
- outbound messages/calls: 0
- live browser crawls: 0
- live Overpass calls: 0
- paid/licensed provider calls: 0
- external object-storage writes: 0
- purchases/upgrades: 0
- credential changes: 0
- DNS/KYC/payment configuration changes: 0
- money movement: 0
- customer-system mutations: 0
- spend: $0

`lite/` is untouched.
