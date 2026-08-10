# Solicited Opportunity Factory

Status: `OFFLINE_PREPARATION_ONLY`

The Opportunity Factory is a deterministic acquisition compiler placed before the existing V9 consequence gate. It converts current official invitations into bounded owner-review packets while refusing to infer permission, qualifications, recipients, outcomes, or legal readiness.

## Why it exists

UberBond has enough architecture. The commercial bottleneck is one lawful paid diagnostic. The factory spends compute on the part that can compound toward that proof:

1. capture a current official opportunity;
2. bind the exact source excerpt and observation window;
3. reject duplicate organizations, recipients, sources, or messages;
4. test mandatory qualifications against an explicit profile;
5. bind every claim to a hashed asset;
6. rank the surviving routes with a transparent score;
7. compile an owner-review packet;
8. route an email candidate to V9 without creating an approval;
9. keep official forms and platforms manual;
10. learn only from receipt-backed outcomes.

## Boundary

```text
Official source
  -> closed opportunity record
  -> prior-contact tombstones
  -> hard requirements
  -> claim and asset registry
  -> transparent score
  -> owner-review packet
  -> manual official form OR V9 exact-approval gate
  -> external evidence reconciliation
```

The module has no network client, browser automation, Gmail client, form submitter, payment client, queue writer, or self-approval function. `compileCanaryProspectDraft()` returns `status=owner-review`, `outreachApproval=null`, and `externalActionAuthorized=false`.

## Decisions

| Decision | Meaning |
|---|---|
| `READY_FOR_OWNER_REVIEW` | Current source, requirements, claims, assets, and score pass; no external action is authorized |
| `BLOCKED_PRIOR_CONTACT` | Recipient, domain, source, or exact message collides with a durable tombstone |
| `BLOCKED_SOURCE_RECHECK` | Source evidence is stale, expired, or future-dated |
| `REJECT_REQUIREMENT_MISMATCH` | A mandatory published requirement conflicts with the evidenced profile |
| `HOLD_EXTERNAL_REQUIREMENT` | Legal, payment, owner, or other external evidence is unresolved |
| `HOLD_MATERIALS` | Exact message or required hashed asset is missing or unhealthy |
| `REJECT_CLAIM_RISK` | Message uses a prohibited phrase or claim that is not evidenced |
| `HOLD_PROVIDER_ROUTE` | The intended provider does not accept the permission route |
| `HOLD_LOW_PRIORITY` | Transparent fit score is below 60 |
| `HOLD_NO_SUBMISSION_ROUTE` | No official submission mechanism exists |
| `REJECT_INVALID` | Closed-schema, identity, source, time, or digest validation failed |

## Scoring

The 100-point score is a ranking aid, never authorization:

| Component | Points |
|---|---:|
| QA explicit | 20 |
| Freelance/contract explicit | 10 |
| Remote explicit | 5 |
| Agency context | 10 |
| Website scope explicit | 10 |
| Medical context | 5 |
| Fixed diagnostic fit | 10 |
| Decision speed | 4–15 |
| Application effort | 5–15 |

Hard failures and unknown mandatory gates override any score. A caller cannot supply a precomputed score because unknown fields are rejected.

## Current seed register

The 2026-08-10 seed is intentionally small and official-source-only:

- Innovate By Day: known-contact collision; exact user-edited message is tombstoned and cannot re-enter as an initial application.
- Organic: broad freelancer-network form; potentially relevant after legal/payment clearance and owner fit review.
- Testlio: QA freelance community; separate side-income route, not a substitute for the frozen UberBond offer.
- Adaptable and Gate 7: official freelancer forms but lower direct QA fit.
- Ars Futura: rejected because the current profile does not meet the published experience/language requirements.
- Toptal: rejected because the current profile does not meet its published typical experience threshold.

Every source expires after seven days in the register and must be re-opened before use.

## Frozen commercial law

`USD 250 QA diagnostic -> USD 500 paid proof pilot -> USD 447 / USD 1,190 monthly agency wholesale`

The factory accelerates the first step. It does not authorize standalone SaaS work, bulk outreach, automatic follow-ups, price changes, or a volume increase.

## Run

```bash
npm run opportunities:dry-run
```

For an isolated output directory:

```bash
OPPORTUNITY_FACTORY_OUTPUT_DIR=/tmp/uberbond-opportunities npm run opportunities:dry-run
```

Outputs:

- `DRY_RUN_REPORT.json`
- `DRY_RUN_REPORT.md`
- `SOURCE_LEDGER.csv`
- `OWNER_REVIEW_PACKETS.json`
- `CANARY_DRAFTS.json`

The committed real seed should currently create zero packets because the B2B legal/payment gate is intentionally `UNVERIFIED`.
