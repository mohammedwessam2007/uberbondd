# Apify Store release package: prepared, not published

**State: DRAFT / HOLD; no external account, database, price, actor publication or payment activation authorized.** Branch `feat/commercialization-omega-w1-w8-20261022`, layered on PR #1536. Supplier: Apify; SDK dependency locked to `apify@3.7.2`.

## Listing (unpublished)

**Title:** Verified Website Inquiry Audit: reproducible public-page inquiry checks

**Description:** Inspect approved public home-service business websites for certain observable inquiry-path consistency issues. Produces a dated, reproducible evidence record and a second same-engine re-probe before an item is eligible for charging. The limited supported observations include parse errors in structured data and possible display-versus-dial inconsistencies, but call-tracking and legitimate routing must be treated as questions until independently understood. No calls, forms, authentication or invasive tests. Results may be clean, unobservable or uncertain; no revenue estimates or completeness promises. A separate independent accuracy audit and actual user willingness-to-pay are still pending.

**Audience:** Website operators and agencies with authority over nominated sites. **Price:** not yet selected; proposed event name `verified-finding` must be configured for a nonzero whole-cent price only after independent quality and compute-cost evidence. Do not publish now.

## Example input (local delivery-only, not a real customer)

```json
{"websites":["https://example.com/"],"runtimeWitness":false,"maxPagesPerSite":1,"maxSites":1}
```

**Actual local example output:** the above input produced `SALE_RECEIPT` with `chargingMode: DELIVERY_ONLY`, `requested: 0`, `delivered: 0`, `charged: 0`. The Actor also wrote `AUDIT_REPORT_MARKDOWN` and `AUDIT_REPORT_HTML` (the empty/clean/no-evidence case must be valid). A separate historical public-site rehearsal sample is at `docs/commercialization/samples/HISTORICAL_INQUIRY_AUDIT_SAMPLE.{md,html}`; it is **not live verified or a successful payment**.

## Prerequisites, installation and release

1. From repository root, run `node scripts/verified-inquiry-actor-package.mjs --check`. Dependency graph admits only necessary `src/` modules. `actors/verified-inquiry-defects/package-lock.json` pins its own runtime dependencies.
2. Run `NPM_CONFIG_CACHE=/tmp/npm-cache npm ci --prefix actors/verified-inquiry-defects --omit=dev --ignore-scripts`; compare two clean dependency trees, validate `.actor/actor.json` and input schema. Confirm Node 22 with Playwright/Chromium in Apify base image; validate in actual Docker/Apify environment before publication.
3. Do not attempt Store pay-per-event without a functioning **shared transactional PostgreSQL charge-reservation database**. Direct one-site pilot may run delivery-only without it. Setup proposal, not an execution: founder approves a genuinely free PostgreSQL provider/plan after reviewing suspension/usage policy; create DB under authorized account; supply `CHARGE_RESERVATION_DATABASE_URL` only as a protected Actor secret. `createSqlChargeReservations.ensureSchema()` initializes the table. Store reserves buyer/finding/day digest plus run identifiers; it must not publish personal customer details in the reservation key. Test two concurrent actual runs, reconciliation of unresolved reservations weekly, secret revocation and backups before go-live.
4. Configure Apify monetization as PAY_PER_EVENT with a positive whole-cent `verified-finding` event price, only after price authorization. The synthetic `apify-default-dataset-item` must be **absent or priced $0**, or the Actor refuses to probe. Review the synthetic `apify-actor-start` $0.00005 default; decide explicitly whether it is chargeable in final Store configuration. A 'pay-per-event plus usage' variant may require a 14-day enablement period and changes who bears compute cost. It is not assumed active.
5. Require user spending cap check **before** item delivery. An unpriced event is never accepted as a successful charge. Ambiguous provider outcomes are UNKNOWN and must not be retried. `CONFIRMED` is only a charge-event status, not captured, settled, withdrawn or cleared revenue. Any gap in shared reservations fails closed to delivery-only or stops pay-per-event execution.
6. Validate Apify account terms, seller identity and Egyptian payout eligibility with the founder, plus statutory tax/invoicing obligations. Published support channel must be an authorized business route (no private address in Git); final refund terms require founder signoff.
7. Manually review the exact listing, price, sample, end-user permissions, test reports and rollback procedure. Ask founder authorization separately to deploy/publish; **no production action is taken here**.

## Operational limits and security boundaries

GET-only probing, robots and rate-limit abstention, request and body caps, maximum five redirect hops, pinned-public-IP transport to prevent DNS rebinding, 90-second site limit, 600-second Actor run limit, default ten sites/max 40, page max 8, 750 MB process-RSS guard. A public site may intentionally use tracking numbers; a mismatch is not a confirmed loss. Playwright witness is restricted to HTTP(S), GET and routed, pinned-IP responses; do not click or submit. Any browser crash must produce an UNOBSERVABLE result, not a charge. Logs exclude secrets and personally identifying data.

## Troubleshooting, support and correction

If Actor fails before probe, inspect Docker/build/lockfile and reservation availability before retrying. If robots blocks or pages fail, return unobservable, never bill. If charge outcome is UNKNOWN, preserve reservation and reconcile against provider before any new attempt. A customer may disprove a finding with the report's explicit reproduction steps. Remove disproven items and handle refund/credit under documented, approved direct or Apify platform terms; do not promise automatic Apify refunds that the adapter cannot guarantee. Provide one correction pass for an agreed direct pilot and a seven-day recheck after buyer-reported repairs, consistent with PR #1535.

## Monitoring and rollback

Track per-run websites, pages, wall time, RSS, witness attempts/failures, abstentions, measured CU, charge-event confirmations/unknowns, reservations, complaints, refunds, support minutes and real cleared contribution profit by currency. Stop Store charges for unknown provider responses, unexpected dataset-item pricing, missing shared database, malicious redirects, negative median actual contribution, false positives or provider warnings. Rollback by pausing or unpublishing the Actor under founder authorization, revoking secret, preserving reservation ledger and rerunning reconciliation. Never delete ledger records needed to resolve disputed charges. Review not-yet-published setup against actual platform terms, not assumptions.

**Environment evidence:** local delivery-only Actor succeeded; two npm installations had identical dependency resolution; Docker build failed daemon ENOSPC; browser smoke failed Chromium SIGTRAP; Apify cloud deployment, pricing config, payout and Store listing remain NOT VERIFIED.
