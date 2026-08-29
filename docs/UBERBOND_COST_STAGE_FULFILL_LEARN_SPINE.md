# UberBond Cost → Stage → Fulfill → Learn Spine

Date: 2026-08-29
Base main: `92fa9adf7ec53c94543f8985fb052143fa7ec39f`

## Why

Four proposed bottlenecks were evaluated against current UberBond code:

1. enrichment/data cost explosion;
2. dynamic content generation latency at send time;
3. the gap between canonical payment truth and programmatic customer provisioning;
4. manual or unstable learning/allocation loops.

All four are directionally useful. They are implemented as extensions of current canonical systems rather than parallel replacements.

## 1. Cost-aware public evidence tier

UberBond already had `budgeted-enrichment-waterfall.mjs`, `prospect-enrichment-planner.mjs`, `prospect-enrichment-budget-gate.mjs`, `prospect-evidence-reconciliation.mjs`, and `web-context-extraction-contract.mjs`.

The missing composition was a strict lower-cost evidence tier before paid enrichment.

New order:

`fresh cache → public DNS → official registry → static public HTTP → headless browser only when static HTTP is observably insufficient → licensed API → model inference`

The system stops as soon as the declared evidence threshold is satisfied.

Important corrections:

- headless browser execution is not treated as free;
- public visibility is not permission for unrestricted crawling;
- robots policy, terms/purpose and public-source checks are required for public web acquisition;
- no credentialed/private/CAPTCHA-bypass path;
- no personal/private-contact inference;
- cache entries are provenance-bound and expire.

The cache stores evidence/content references and hashes rather than turning copied web pages into ungoverned durable truth.

## 2. Asynchronous staged-content repository

Heavy generation is moved away from the send-time path.

`research/evidence → batch content generation → staged Postgres content → READY → sender/journey worker claims static contentRef → channel admission → provider`

The repository uses PostgreSQL row claiming with `FOR UPDATE SKIP LOCKED`, allowing concurrent consumers to skip content already being claimed rather than queueing behind the same row.

A staged asset is bound to:

- asset type;
- audience ref;
- offer ref;
- target profile ref;
- source evidence refs;
- policy ref;
- payload hash;
- generation/expiry time.

Staging never grants publication or send authority.

## 3. Programmatic fulfillment router

Current UberBond already represents the payment/delivery/acceptance truth ladder and has `service-fulfillment.mjs`.

The new router fills the provisioning seam after canonical cleared-payment evidence is available.

Supported planning primitives include:

- create workspace;
- create dashboard invite;
- provision API client;
- queue service delivery;
- create monitoring subscription.

Every plan is idempotently bound to the payment occurrence, ServiceSKU and customer ref.

A provider success is not canonical until a provider receipt is normalized.

An uncertain provider result blocks blind retry until reconciliation.

### Access-token correction

Long-lived raw API/access tokens must not be sent directly in email.

Customer access should use provider-native invitations, expiring magic links or one-time claim flows. The communication layer carries a safe content/reference path, not durable raw credentials.

## 4. Economic feedback allocator

The learning loop updates bounded allocation weights rather than rewriting code, policy or authority.

Eligible dimensions are business targeting dimensions such as industry, company size class, observable software stack, business trigger and other non-sensitive account attributes.

Protected/sensitive personal characteristics are prohibited from the targeting-weight loop.

The allocator requires enough observations and paid/accepted outcomes plus measured cleared contribution and founder minutes before a profile can receive an economic reallocation.

Small samples are shrunk using a Beta(1,1)-style paid/accepted rate rather than treating a 1/1 result as certainty.

Each cycle preserves:

- minimum evidence thresholds;
- exploration floor;
- maximum weight delta;
- bounded min/max weights;
- optimistic concurrency when weights are persisted.

This avoids a runaway feedback loop where one lucky early conversion permanently monopolizes future discovery.

## Postgres support

`migrations/100_cost_stage_fulfill_learn.sql` adds:

- `public_evidence_cache`;
- `staged_content_repository`;
- `fulfillment_provisioning_runs`;
- `economic_profile_weights`.

These are internal state. None grants customer contact, spend, provider, payment, publication or production authority.

## Existing systems reused

This spine composes with, rather than replaces:

- budgeted enrichment waterfall;
- web context extraction contract;
- prospect evidence reconciliation;
- evidence-to-content compiler;
- enterprise journey orchestrator;
- omnichannel communication contract;
- social publication schedule;
- Sender Infrastructure Mesh;
- canonical scheduler/jobs;
- payment/renewal truth;
- service fulfillment;
- Growth Graph attribution/economic architecture.

## Current external truth

This implementation creates no live enrichment calls, web crawling, buyer contact, message send, customer workspace, provider provisioning, payment, or economic outcome.

Current customer/revenue truth remains unchanged until external receipts exist.

## Current official-source considerations

- RFC 9309 standardizes the Robots Exclusion Protocol for crawler access preferences; robots is not authorization by itself.
- PostgreSQL documents `SKIP LOCKED` as skipping locked rows without waiting, appropriate for multi-consumer queue-style claiming.
- Lemon Squeezy currently documents signed webhooks, webhook retry behavior, and recommends storing webhook events locally and processing them asynchronously after returning success. UberBond still requires its own canonical payment witness/reconciliation before fulfillment.

## Next integration frontier

1. connect evidence-tier planner to the existing budgeted enrichment waterfall and web-extraction adapter selection;
2. feed evidence-to-content output into staged-content Postgres storage during scheduled low-load generation cycles;
3. add provider-specific fulfillment adapters only for the first paid offer actually requiring them;
4. feed real Growth Graph attribution/economic receipts into the bounded weight allocator;
5. keep all external consequences behind current OMNIA/authority/provider gates.

The goal is not autonomous activity. The goal is autonomous, economical, attributable operation.