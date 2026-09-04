# UberBond Total Brain Cloud Fabric Addendum

Status: **LONG-HORIZON SUPERSET MEMORY / ANTI-EVAPORATION OVERLAY**

Created: 2026-09-05 (Africa/Cairo)
Creation base main: `801639b5c3d996a5ab3e0793e1d51a5faecf459e`
Implementation branch at creation: `gpt/cloud-cache-ephemeral-fabric-20260905`
Integration PR: #390
Parallel Claude security task: #389

This addendum exists so the owner-supplied cloud-worker, shared-context-cache, and ephemeral-client ideas cannot disappear when a chat, handoff, model session, branch, or provider changes. It records the corrected mechanisms and the truth boundaries that future sessions must preserve.

## Permanent doctrine

UberBond should become increasingly device-independent without pretending that serverless functions are immortal processes, prompt-cache discounts are guaranteed, or browser RAM produces literally zero forensic traces.

Durable target:

`durable company state -> deterministic occurrence -> replaceable cloud wake transport -> canonical UberBond queue -> bounded worker -> evidence receipt -> retry/reconcile -> next occurrence`

and:

`stable shared context -> cache-eligible prefix -> bounded model task -> observed cache usage -> conservative cost receipt -> routing/economic learning`

and:

`server-side secrets/data -> no-store private API -> browser application memory only -> authenticated server calls -> lifecycle purge -> no application-side persistent secret`

Capability never creates authority. A cheaper/faster/cloud-hosted execution path does not create permission to send messages, spend, move money, alter credentials/DNS, contact customers, or manufacture commercial truth.

## 1. Durable cloud worker fabric

### Corrected meaning of “24/7”

UberBond may operate while the founder’s iPad is off only when durable cloud infrastructure actually schedules and executes work. A Vercel Function is a bounded invocation, not an immortal daemon.

The canonical architecture is provider-neutral:

1. UberBond’s durable queue/database remains the source of job truth.
2. A cloud scheduler/queue/workflow may wake bounded workers.
3. Every scheduled occurrence has a deterministic occurrence/idempotency key.
4. At-least-once cloud delivery is expected and must not create duplicate company actions.
5. Worker crashes/redeployments resume from durable state rather than in-memory timers.
6. Cloud transport is replaceable; migration to/from Vercel Queues, workflows, another queue, or a long-lived worker must not create a second business ledger.

Repository implementation introduced on #390:
- `src/scheduler.mjs::compileCloudWakePlan`
- policy `uberbond-cloud-wake-plan-1.0.0`
- bounded rolling delayed-delivery plan up to seven days
- deterministic occurrence keys and idempotency keys
- canonical job truth `UBERBOND_DURABLE_QUEUE`
- status `CLOUD_WAKE_PLAN_COMPILED_NOT_PUBLISHED`
- cloud publish authority `NONE`

A compiled plan is not a live cloud worker receipt. Future activation must prove the transport, consumer, exact source identity, retries, and elapsed operation.

## 2. Shared context cache economics

### Corrected meaning of “90% cheaper”

Prompt caching can materially reduce repeated-input cost and latency when a provider/model supports it and the exact stable prefix is reused. “90%” is not a universal UberBond guarantee.

Permanent rules:

1. Stable high-volume context belongs before dynamic per-task material when the target provider’s cache semantics are prefix-based.
2. Do not copy the heavy context into durable execution receipts. Record bounded metadata such as digest and byte size.
3. Request caching only through provider-supported options.
4. A configured cache option is not a cache hit.
5. A cache hit is claimed only from observed provider usage fields.
6. Cost savings are claimed only when both cache-read usage and verified cache-read pricing exist.
7. Pre-call spend reservation remains conservative enough to survive a cache miss.
8. Cache write premiums, TTL expiry, provider differences, model changes, prefix drift, and privacy constraints remain first-class evidence.

Repository implementation introduced on #390:
- `src/vercel-ai-gateway-executor.mjs` policy `vercel-ai-gateway-executor-1.1.0`
- requests `providerOptions.gateway.caching = auto`
- optional bounded `cacheableContext`
- stable-context prefix before request-specific task data
- observed cache-read/write token normalization
- receipt states `OBSERVED_CACHE_HIT`, `OBSERVED_NO_CACHE_READ`, or `CACHE_USAGE_FIELDS_NOT_OBSERVED`
- no calculated savings without verified cache pricing
- conservative full-input cost basis when cache economics are not separately verified

## 3. Ephemeral client contract

### Corrected meaning of “RAM evaporates”

UberBond should minimize application-created persistence on the founder’s phone/tablet. This is not a claim that Safari, the OS, network infrastructure, screenshots, crash logs, swap, or a compromised device leave literally zero traces.

Permanent contract for protected admin state:

1. Admin bearer tokens and protected workspace state must not be stored in `localStorage`, `sessionStorage`, IndexedDB, CacheStorage, service-worker caches, or similar application persistence unless a future explicit security design authorizes a narrowly scoped exception.
2. Admin credentials must not be placed in query strings, download URLs, referrers, filenames, or durable client logs.
3. Protected downloads should use authenticated requests and ephemeral Blob/ObjectURL handling, then revoke the object URL.
4. Privileged database credentials remain server-side. Browser-direct Neon access is not the default privileged architecture even if a serverless driver technically supports browser runtimes.
5. Protected APIs remain private/no-store.
6. In-memory protected state should be cleared on explicit lock/logout and page-lifecycle exit where practical. JavaScript memory clearing is best-effort, not cryptographic RAM erasure.
7. Public capability tokens used for deliberately public flows such as report/unsubscribe URLs are a separate evidence class and must not be confused with the admin bearer.

Security defect discovered during this wave on creation-base main:
- `public/admin.js` loaded the admin bearer from `localStorage`;
- Save Token persisted it back to `localStorage`;
- protected export URLs carried `?token=<admin bearer>`;
- Gmail OAuth start URLs carried the same query token;
- `server.mjs` accepted the admin bearer from a query-string fallback.

Claude task #389 owns the parallel repair on the same #390 branch. Do not mark the Ephemeral Client Contract complete until that exact branch carries the repair and hostile regression evidence.

## No-evaporation law

1. Future sessions must read this addendum whenever they read the mandatory orchestration Total Brain addendum.
2. “24/7 worker”, “shared context cache”, and “ephemeral client” are permanent UberBond capability goals, even if their current provider-specific implementation is replaced.
3. A future provider may supersede Vercel Queue/Gateway/Neon implementation details, but must preserve the donated mechanisms and truth boundaries.
4. A new optional frontier feature may not move the fixed Core Completion finish line merely by existing. Optional growth and core closure remain separate scoreboards.
5. Every material activation or supersession must leave repository-native evidence with exact source identity, tests/receipts, rollback/revocation semantics, and external-proof classification.
6. Chat memory alone is never sufficient persistence for these mechanisms.

## Evidence boundary at creation

Source-level changes for prompt-cache economics and cloud-wake compilation are present on #390. Exact-head executable verification and Claude #389 reconciliation are still required before merge.

This addendum is memory, not a green build receipt, production-activation receipt, cost-savings receipt, customer receipt, payment receipt, or elapsed 24/7-operation proof.
