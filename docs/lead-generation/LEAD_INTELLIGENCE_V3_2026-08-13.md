# UberBond Lead Intelligence V3

Date: 2026-08-13

Lead Intelligence V3 completes the operator loop around the existing local lead-search and control-tower surfaces:

```text
first-party intake
→ account-safe identity boundary
→ local typed enrichment
→ owner action queue with SLA
→ descriptive outcome attribution
```

The implementation is deliberately local and reversible. It reads the UberBond corpus, owner imports and source-backed observations. It does not create a contact database, scrape protected networks, infer private email addresses, call a provider, send a message, book a meeting, charge a buyer or mark payment as cleared.

## What is included

- Privacy-aware intake normalization for forms, first-party inquiries, visitor activity, owner imports, licensed imports and provider exports.
- HTTPS source validation, consent/notice metadata, stable idempotency IDs and explicit omission of IP addresses, cookies and session identifiers.
- Account-level visitor activity: anonymous activity cannot become a person identity by inference.
- Typed local field results: `found`, `partial`, `missing`, `blocked` and `needs_verification`.
- Owner action queue with task type, priority, due time, reason, blockers and reversible next action.
- First-party event routing that prioritizes an owner response while keeping uncertain permission blocked or reviewable.
- Attribution by source and commercial funnel stage, with a 30-outcome minimum before any scoring calibration proposal.
- Public capture contract disabled by default and protected by a dedicated site key plus an in-memory rate limit.
- JSON and PostgreSQL persistence for intake events, field results and action tasks.
- Lead Intelligence V3 UI inside `public/outreach.html`.

Every V3 result exposes `providerCalls: 0` and `externalEffects: 0` in local mode so an operator can distinguish planning from execution.

## Owner API

| Route | Purpose | Effect boundary |
|---|---|---|
| `GET /api/leadgen/intelligence` | Joined V3 workspace | Read-only |
| `GET /api/leadgen/capture-spec` | Public capture contract | Read-only |
| `GET /api/leadgen/attribution` | Source/funnel outcome snapshot | Read-only |
| `GET /api/leadgen/action-queue` | Rebuildable next-action queue | Read-only |
| `POST /api/leadgen/intake` | Owner-authenticated intake | Local persistence only |
| `PATCH /api/leadgen/intake/:id` | Owner review/status/linking | Local persistence only |
| `POST /api/leadgen/action-queue` | Rebuild and optionally persist tasks | Local persistence only |
| `POST /api/leadgen/enrichment/run` | Run local field checks | Local persistence only when `commit: true` |
| `POST /api/public/lead-capture` | First-party site handoff | Disabled unless explicitly configured |

The public route requires `LEAD_CAPTURE_ENABLED=true`, a non-empty `LEAD_CAPTURE_SITE_KEY`, the `X-UberBond-Capture-Key` header and a valid HTTPS-bound payload. It accepts only form submissions, first-party inquiries and visitor events.

## Data model

Migration `017_lead_intelligence_v3.sql` adds:

- `lead_intake_events`: normalized intake, privacy metadata, source authority and review status;
- `lead_field_results`: field-level local/provider status and evidence result;
- `lead_tasks`: durable owner queue entries with active deduplication.

The JSON store mirrors the same collections and uniqueness rules. PostgreSQL stores the complete normalized record in `data` while indexing the queue, account, field and status columns used by the operator surface.

## Safe operating sequence

1. Run `npm run db:migrate` in PostgreSQL deployments.
2. Keep `LEAD_CAPTURE_ENABLED=false` while validating the owner UI and local intake route.
3. Import or create only exact, source-backed records.
4. Review the V3 queue and resolve privacy, evidence, contact or conflict blockers locally.
5. If first-party capture is needed, create a dedicated site key, configure the site integration and verify rate limits with a controlled test submission.
6. Keep provider enrichment and outbound execution behind their existing BYOK, route-evidence, suppression, approval and V9 gates.

## Verification

- Lead-generation and operations tests: 31 passed.
- Lead Intelligence V3 tests: 8 passed.
- PostgreSQL schema/store/import checks: 20 passed in the focused persistence run.
- Full repository run: 495 passed, 41 intentionally skipped; the only failure was the pre-existing browser test because this runtime has no Playwright Chromium executable.
- HTTP smoke: health, intake, idempotent duplicate, queue persistence, intelligence join, disabled public capture and static outreach assets all passed.
- Provider calls: `0`.
- External effects: `0`.
- The edited Innovate By Day email remains unchanged, prior-contact protected and unsent.
