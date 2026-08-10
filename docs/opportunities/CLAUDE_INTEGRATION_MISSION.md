# Claude Integration Mission — Solicited Opportunity Factory

## Objective

Apply the combined handoff patch to the pinned V9 branch, preserve the offline acquisition boundary, validate all deterministic and environment-backed checks, and open a draft pull request. Do not submit an application, send an email, configure production, or enable outbound.

## Invariants

1. `lite/` remains byte-for-byte outside the diff.
2. The Opportunity Factory remains offline and is not wired into Web or Worker execution.
3. No HTTP client, browser submitter, Gmail client, payment client, queue writer, or provider credential enters `src/opportunity-factory.mjs`.
4. Unknown schema fields fail closed.
5. Official source URLs must bind to the declared organization domain.
6. Evidence expires and cannot be silently refreshed.
7. Recipient/domain/source/message tombstones win before scoring.
8. Mandatory requirement failures reject; mandatory unknowns hold.
9. Claims require `EVIDENCED` registry status and hashed assets.
10. Manual forms and platforms never compile into Gmail prospects.
11. Email compilation produces `outreachApproval=null` and owner-review status only.
12. Consequence states require external evidence digests.
13. Cleared revenue counts only with a receipt digest.
14. The exact Innovate By Day edited body retains SHA-256 `c3f8015ebba1ed3c93327ce8aff243efdc9198d91e811384eed5a5fa3158473a` and remains blocked by the known-contact tombstone.

## Validation

```bash
npm ci
npm run check
OPPORTUNITY_FACTORY_OUTPUT_DIR=/tmp/uberbond-opportunities npm run opportunities:dry-run
npx playwright install --with-deps chromium
npm run test:browser
OMNIA_V9_TEST_DATABASE_URL='postgresql://...' npm run check:v9:postgres
git diff --check
git diff --name-only <PINNED_BASE> -- lite
```

Expected opportunity dry-run state until professional/owner evidence changes:

- 7 opportunities;
- 1 prior-contact block;
- 4 external-requirement holds;
- 2 hard requirement rejections;
- 0 owner-review packets;
- 0 canary drafts;
- 0 external effects.

## Pull-request truth

State explicitly:

- this is a preparation compiler, not an outreach expansion;
- every current seed remains non-actionable;
- no email, form, platform application, payment, deployment, or production mutation occurred;
- environment-backed test results are reported separately from deterministic results;
- production activation remains owner-controlled and out of scope.
