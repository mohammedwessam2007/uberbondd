# Acquisition architecture

UberBond’s acquisition system is an evidence-first state machine. Research can run unattended; consequential actions remain bounded by owner approval, provider authentication, suppression, and final dispatch checks. It does not promise income or treat code existence as proof of a live integration.

## Isolation boundary

The production Cash Engine Lite service at `https://uberbondd-lite-private.vercel.app` is a separate application under `lite/` with its own Neon queue and `.github/workflows/lite-audits.yml` worker. Acquisition code must not rename, merge into, redeploy, or replace it. The obsolete Vercel project named `uberbondd` is not a deployment target.

## Acquisition flow

1. A validated campaign selects supported countries, city-sized bounding boxes, OpenStreetMap categories, evidence thresholds, capacities, offer language, and safety policy.
2. `DiscoveryRunner` queries the public Overpass interface, preserves ODbL attribution, normalizes websites, rejects unsafe or non-business targets, deduplicates, imports, and queues bounded work.
3. The queue claims work with an exact worker lease. A stale worker cannot complete or fail a job after another worker reclaims it.
4. The browser crawler enforces public-network resolution, DNS pinning, actual response-address checks, same-business-origin requests, robots awareness, per-domain pacing, page ceilings, and controlled concurrency.
5. Deterministic rules produce findings only from stored crawl observations. Degraded rendering suppresses unsupported absence findings.
6. Qualification validates evidence URL, excerpt, confidence, screenshot reference, severity, qualitative impact, and effort; weak crawls and unsupported prospects are rejected.
7. Contact intelligence accepts only same-domain business contacts published on the business website or explicitly verified by an optional provider. Risky, free-mail, unrelated, or guessed addresses are rejected.
8. The outreach composer binds every sentence to stored facts, creates multiple deterministic variants, scores quality, and routes only passing drafts to owner review.
9. Owner approval and scheduling are separate actions. Immediately before dispatch, the store atomically rechecks the exact draft, campaign, recipient, suppression, reply/payment stops, global kill switch, inbox health, capacity, and live/test approvals.
10. Gmail test mode records simulated messages without a network provider. Live Gmail requires separate OAuth and explicit activation.
11. Reply ingestion matches threads, applies deterministic high-confidence rules first, cancels follow-ups atomically, and routes uncertain replies to the owner.
12. An offer remains a draft until owner approval. Checkout issue is another owner action. Paid state requires a verified provider webhook, explicit manual owner confirmation, or the isolated test adapter.
13. Verified paid state creates one delivery record and one owner task. Customer-site modification is never automatic and requires separate customer authorization and access.
14. The learning projection uses replies and commercial outcomes, not open pixels, and only recommends experiment changes for owner review.

## Components

| Responsibility | Reused implementation | Durable records |
|---|---|---|
| Campaign validation | `src/campaign-config.mjs` | `campaigns` |
| Discovery/import | `src/discovery.mjs`, `src/discovery-runner.mjs`, `src/prospect-import.mjs` | `discoveryRuns`, `prospects`, `jobs` |
| Crawl/audit/qualification | `src/browser-crawler.mjs`, `src/audit-rules.mjs`, `src/qualification.mjs`, `src/pipeline.mjs` | `prospects`, `artifacts`, `auditLog` |
| Public contacts | `src/contacts.mjs` | evidence inside `prospects` |
| Copy and review | `src/copy.mjs`, `src/cockpit.mjs` | drafts and approvals inside `prospects` |
| Controlled outbound | `src/gmail.mjs`, `src/send-safety.mjs`, `src/store.mjs` | `outboundReservations`, `messages`, `senderHealth`, `outboundEvents` |
| Replies and stops | `src/replies.mjs`, `src/pipeline.mjs` | `replies`, `suppressions`, `notifications` |
| Offers/payments | `src/payments.mjs`, `src/revenue.mjs` | `offers`, `orders`, `revenueEvents` |
| Delivery | `src/delivery.mjs`, `src/revenue.mjs` | `deliveries`, `notifications` |
| Learning | `src/learning.mjs` | `experiments` plus projected outcomes |
| Scheduling | `src/queue.mjs`, `src/scheduled-workers.mjs`, `.github/workflows/acquisition-workers.yml` | PostgreSQL jobs and heartbeats |

## Trust boundaries

- Public website input is untrusted. URL parsing, public-IP checks, redirect checks, browser response-address checks, HTML escaping, and typed evidence validation apply before use.
- Owner access uses an authorization header. Admin credentials are never accepted in a query string.
- Report access is a hashed capability delivered in a URL fragment and POST body, not in an HTTP request path.
- Provider output is untrusted. Gmail ambiguity quarantines a send; AI cannot create evidence; payment redirects and frontend assertions cannot mark paid.
- Operational logs pass through redaction and omit addresses, secrets, database URLs, OAuth material, report capabilities, and raw provider payloads.
- CSV exports neutralize spreadsheet formula prefixes.

## Persistence and concurrency

JSON storage is for local development and deterministic acceptance. Production acquisition services require PostgreSQL. PostgreSQL transactions and advisory locks protect queue leases, global/inbox/campaign/recipient send state, suppression, replies, and idempotent payment events. Browser screenshots move to shared database artifacts when Web and Worker run separately.

## Demonstrated acceptance

Run:

```bash
npm run acceptance
```

The command uses one local OSM fixture, one deterministic crawl, rules-only audit/copy, the test Gmail adapter, a simulated reply, and an HMAC-signed Lemon Squeezy `test_mode` webhook. It prints every transition through `delivery-queued` and asserts zero real emails, zero real payments, zero external network calls, and zero customer-site modifications.

The harness proves the provider-independent test path. It does not prove Gmail OAuth, inbox deliverability, a live payment account, remote GitHub publication, or a deployed acquisition Web/Worker pair.
