# UberBond Current Checkpoint — Lead Generation and Four-Offer Revenue Cell

**Recorded:** 2026-09-17T16:44Z  
**Checkpoint class:** verified source, GitHub main, Render deployment, and public-runtime state  
**Commercial truth:** product metadata and governed interest capture are live; no payment, customer, delivery, or revenue is asserted.

## Canonical commercial surface

The public revenue ladder is preserved as four paid offers plus one free lead generator:

1. **Opportunity Snapshot** — free lead generator.
2. **Full Digital Audit** — USD 49 one-time.
3. **Strategy Audit** — USD 299 one-time.
4. **Implementation Sprint** — from USD 1,000, scoped project.
5. **UberBond Watch** — USD 99/month monitoring.

The catalog is versioned in `src/revenue-offers.mjs`. The live public configuration exposes the same catalog and prices. Hosted checkout/booking URLs are not configured, so paid routes remain request-based; the system does not manufacture a payment or booking receipt.

## Lead-generator and data-collection audit

- Public intake now records the selected offer and preserves it through the lead/report path.
- Missing checkout or booking configuration now creates a durable, token-bound offer-interest record rather than a dead-end or a fabricated conversion.
- Lead intelligence is persisted through the Postgres-backed collections `lead_lists`, `lead_searches`, `lead_signals`, and `lead_enrichment_runs`, with supporting provider-event, intake, field-result, task, reply-draft, automation-plan, and automation-run collections.
- Migration `106_lead_intelligence_collections.sql` creates the missing durable tables, indexes, and idempotency/deduplication identities. Local PGlite migration tests cover the schema.
- Source provenance records exact page-level source URLs, observation timestamps, and explicit exact/inferred flags. Same-domain crawling and robots checks are enforced before link probes.
- The collection boundary remains public website, owner-provided, first-party, licensed, or otherwise permitted data. LinkedIn, Google Maps, private sessions, CAPTCHA bypass, and unauthorized corpus acquisition are not enabled.
- External enrichment/provider calls require both explicit provider switches (`LEAD_PROVIDER_CALLS_ENABLED` and `HUNTER_ENRICHMENT_ENABLED`) plus the required credential. The default is off; the owner-provided recipient path does not call a provider.

## Source and live deployment receipt

- Local code checkpoint before this handoff receipt: `d850cac1150fba0b61f3da269bea8237bd83a222`.
- GitHub `main` code commit and primary code deployment source: `066aa0db1ce5a653f144479c085f80c435f8bf39`.
- Render service: `uberbond-control-plane` (`srv-dali9vijnfac739m4vcg`).
- Primary code deployment: `dep-dam1fkek1f9s73e4i8j0`.
- Render deployment status: `live`; finished `2026-09-17T16:40:31.511931Z`.
- Public health at verification: HTTP 200; Postgres backend; web process healthy; foreground worker online with heartbeat; version `revenue-engine-1.4.0`.
- Render build logs checked out `066aa0db1ce5a653f144479c085f80c435f8bf39`, installed dependencies successfully, and started the web and worker processes using Postgres.
- `OMNIA V9 outbound integration mode: off` was present in the live deployment logs. No message was sent by this checkpoint.
- This handoff receipt was then published on GitHub `main` as `9df093b237f02c40a182075fdebd48b0dbcdd2f4` and deployed as the receipt-only Render deployment `dep-dam1i5qjnfac73cvif80`; that deployment checked out the receipt commit, built successfully, and started the same runtime.
- Final live probe after the receipt-only deployment: `/api/health` HTTP 200 at `2026-09-17T16:46:59.098Z`; Postgres backend and worker heartbeat online. The bare `/health` path is not a route and returned 404, as expected.

## Verification receipt

- Focused lead/revenue/schema/handler suite: **65/65 passing**.
- Follow-up freshness plus lead/revenue/schema checkpoint: **33/33 passing**.
- Syntax check, `npm run brain`, `npm run capabilities:doctor`, and `npm run genesis:doctor`: passing at the verified local checkpoint.
- Full deterministic repository run: 7,610 passing, 54 skipped, and 5 failures. The remaining failures are unrelated/pre-existing repository or runner conditions: missing historical `origin/feat/command-center-big-button`, the existing worker-context admission assertion, and freshness failures observed before the generated-truth refresh. The relevant freshness gates passed after refresh.
- Browser integration could not start because the host lacks the Playwright Chromium executable; the robots fail-closed assertions passed.

## Truth boundaries and unresolved observations

- No sender authorization, recipient permission record, outbound message, payment, customer acceptance, or cleared revenue is fabricated by this checkpoint.
- The Render SQL connector could not perform a direct readback because its connection attempt was rejected with `FATAL: SSL/TLS required (SQLSTATE 28000)`. This is a connector observability limitation, not a service-health result; the application started on the Render Postgres backend and the schema is covered by the local migration test.
- The live runtime therefore has a verified product/catalog/lead-intelligence implementation and a safe interest-capture path. Provider-backed checkout, booking, and external outcome receipts remain unproven until a real provider route supplies them.

## Next controlled frontier

Use the live Opportunity Snapshot to qualify permitted opportunities and route interested prospects into the four-offer ladder. Preserve provenance, deduplication, suppression, and idempotency on every subsequent record. Treat provider receipts, accepted delivery, cleared payment, and contribution margin as separate evidence classes.
