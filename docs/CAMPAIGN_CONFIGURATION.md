# Campaign configuration

UberBond campaigns use one strict JSON contract. Validation is deterministic, unknown fields are rejected, and campaign files never contain credentials. The executable schema and validator live in `src/campaign-config.mjs`.

The disabled demonstration is `config/campaigns/demo-healthcare-dry-run.json`. The executable acceptance fixture is `config/campaigns/e2e-acceptance-dry-run.json`; it is enabled only for local processing, remains `dryRun: true`, uses the test provider, permits one simulated initial message, and cannot auto-send.

## Safety model

- `dryRun` is required and defaults are not inferred from strings.
- `autoSend: true` is invalid while `dryRun: true`.
- `autoSend: true` is invalid while `enabled: false`.
- Any configuration with `dryRun: false` requires two trusted approvals passed outside the campaign JSON: system live-send approval and campaign live-send approval.
- The campaign creation API deliberately supplies no campaign live-send approval, so a creation request cannot arm itself.
- Runtime sending separately requires `OUTBOUND_ENABLED=true`, `OUTBOUND_DRY_RUN=false`, `OUTBOUND_LIVE_SEND_APPROVED=true`, a campaign live-send approval record, Gmail prerequisites, evidence, contact, suppression, cap, and business-hour checks.
- The demonstration campaign is disabled, dry-run only, has zero send capacity, and has no allowed inboxes.

## Field contract

| Field | Type and bounds | Purpose |
|---|---|---|
| `campaignId` | lowercase identifier, 3–64 characters | Stable campaign identity |
| `name` | string, 3–120 characters | Operator-facing name |
| `niche` | string, 2–180 characters | Target business segment |
| `countries` | 1–25 valid ISO alpha-2 countries | Discovery and outbound allowlist |
| `cities` | up to 100 strings | Geographic labels |
| `boundingBoxes` | up to 100 `[south, west, north, east]` arrays; maximum 5° per side | City-sized discovery areas |
| `discoveryCategories` | supported OpenStreetMap category names | Deterministic source selectors |
| `minimumProspectScore` | integer, 0–100 | Qualification floor |
| `minimumEvidenceConfidence` | number, 0–1 | Evidence confidence floor |
| `dailyDiscoveryCap` | integer, 0–100 | Daily discovery ceiling |
| `dailyAuditCap` | integer, 0–100 | Daily audit ceiling |
| `dailyDraftCap` | integer, 0–100 | Daily draft ceiling |
| `maximumPagesPerSite` | optional integer, 1–12; defaults to 5 | Per-campaign crawl ceiling, additionally bounded by the system limit |
| `dailySendCap` | integer, 0–50 | Campaign send ceiling; system caps may be lower |
| `hourlySendCap` | integer, 0–10 and no greater than daily cap | Campaign hourly ceiling |
| `allowedInboxes` | unique subset of `A`, `B` | Permitted sender slots |
| `businessHourStart` | integer, 0–23 | Earliest recipient-local send hour |
| `businessHourEnd` | integer, 1–24; later than start | Exclusive recipient-local end hour |
| `maximumFollowups` | integer, 0–1 | Follow-up limit |
| `followupDelayDays` | integer, 1–30 | Delay before the one permitted follow-up |
| `offer` | string, 3–600 characters | Campaign offer boundary |
| `callToAction` | string, 2–240 characters | Approved low-friction CTA |
| `subjectVariants` | 1–10 unique strings, each up to 160 characters | Approved subject inputs |
| `messageVariants` | 1–10 unique strings, each up to 4,000 characters | Approved message inputs |
| `suppressionKeywords` | up to 100 unique strings | Campaign-specific stop language |
| `prohibitedClaims` | 1–100 unique strings | Claims the composer must reject |
| `dryRun` | JSON boolean | Preview-only mode |
| `autoSend` | JSON boolean | Requests unattended sending only after all external approvals |
| `enabled` | JSON boolean | Enables campaign research processing; it is not live-send approval |

## Validation behavior

The validator rejects:

- missing or unknown fields;
- non-JSON booleans such as `"false"`;
- unsupported country names or pseudo-region codes;
- oversized, reversed, or out-of-range bounding boxes;
- unknown discovery categories;
- negative, fractional, or excessive caps;
- invalid or inverted business-hour windows;
- duplicate list values;
- send capacity without an allowed inbox;
- auto-send with dry-run, disabled campaigns, or zero send capacity;
- `dryRun: false` without both trusted approvals;
- credential-like fields or recognizable secret material.

## Runtime compatibility

`createCampaignRecord` preserves the canonical fields and adds existing runtime aliases so current pipeline code continues to work:

| Canonical field | Runtime alias |
|---|---|
| `campaignId` | `id` |
| `countries` | `allowedCountries` |
| `minimumProspectScore` | `minScore` |
| `minimumEvidenceConfidence` | `minEvidenceConfidence` |
| `dailySendCap` plus `allowedInboxes` | per-inbox `dailyCaps` |
| `maximumFollowups` | `maxFollowups` |
| `enabled` | research-processing `approved` |

These aliases do not bypass validation or create live-send approval.

## Owner activation boundary

Do not place OAuth tokens, API keys, database URLs, passwords, webhook secrets, or sender credentials in campaign JSON. They belong in deployment secrets. Live activation must occur through a separate privileged workflow that records both approvals and can be audited; campaign creation alone intentionally cannot do this.

## Deterministic acceptance campaign

The end-to-end fixture intentionally separates research enablement from live-send permission:

- `enabled: true` lets the local acceptance runner discover, import, audit, and draft its single reserved fixture.
- `dryRun: true` requires the test Gmail provider at the final dispatch fence.
- `autoSend: false` requires explicit owner approval and scheduling of the simulated initial message.
- daily and hourly caps are both one; the allowed inbox is only `A`.
- the follow-up setting is one, but the harness creates only a test-only scheduled marker and proves that a simulated reply cancels it before any second provider call.
- the fixture domain and contact are reserved test data and are never real outreach targets.

Validate the complete contract and state machine with:

```bash
npm run acceptance
```

Do not copy acceptance-only domains, webhook material, prices, or enablement values into a real campaign. Start real campaign design from the disabled demonstration and complete the owner authentication checklist first.
