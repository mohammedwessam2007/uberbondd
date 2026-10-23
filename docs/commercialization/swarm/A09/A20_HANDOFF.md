# A09 to A20 — payment-rail and legal-truth handoff

**Date:** 2026-10-23 UTC
**Worker branch:** `swarm/A09-payments-eligibility-20261023`
**Starting worker HEAD:** `6297e4a216cdcf3e264eb5218608ef9a9aacb115`
**Observed `origin/main`:** `3a7a0b7a5ece796e617c0c363118d4b1618bf9c1`
**Observed donor branch:** `origin/feat/commercialization-omega-w1-w8-20261022` at `f9b423a0d56e18436a23a53ce75d3a14ae920567`

## Decision for integration

`CONDITIONAL`: the source-backed economic decision is HOLD, the owner/account/tax unknowns are explicit, and the evidence tests are scoped to this lane. No shared payment-rail code was changed. Do not treat the artifacts as account activation or legal clearance.

## Critical shared-source discrepancy

On the A09 starting HEAD, `src/money-entry-rails.mjs` returns `RAIL_PLAUSIBLE`, chooses `PAYPAL_EGYPT`, and tells the founder to confirm a PayPal account; the repository owner-reported account state is permanently deactivated and prohibits replacement. A09 reproduced the result locally and recorded it in the source ledger.

Open draft PR #1538 has head `a9b2c5fa240de949135282769284044a0097986d` and contains overlapping payment-rail changes. A20 should inspect its exact current head and tests, reconcile it with the A09 record and other commercial branches, and preserve the account-specific no-replacement restriction. A09 did not cherry-pick or modify that shared implementation.

## Source-backed status

- Contra: prior support correspondence recorded Egypt invoices/projects/payment links and Egyptian bank SWIFT as supported; the existing account's current auth/KYC/tax/wallet/payout/fees/FX remains unknown.
- PayPal: excluded for this founder's reported deactivated account; generic Egypt public policy does not alter that account state.
- Apify: published threshold/schedule and generic wire-fee policy are recorded; account, usage, payout, bank credit, and Egypt-specific bank costs are not verified. The USD 5.3888 figure is scenario-only and below the published minimums.
- Tax: ETA retrievals did not surface applicable substantive law; no Egypt tax/VAT/e-invoice/export conclusion is asserted.
- Actual bank-cleared contribution profit: USD 0.

## Lane files

- `docs/commercialization/swarm/A09/EGYPT_RAIL_DECISION.md`
- `artifacts/commercialization/swarm/A09/PAYMENT_PROVIDER_SOURCES.json`
- `artifacts/commercialization/swarm/A09/cleared_cash_path.json`
- `docs/commercialization/swarm/A09/OWNER_PAYMENT_CHECKLIST.md`
- `tests/swarm-a09-payment-evidence.test.mjs`
- `docs/commercialization/swarm/A09/PHOENIX_20261023.md`

The PHOENIX file carries the final test outcome, hashes, source limits, and exact A20 handoff status. A09's worker branch has inherited donor history; no new PR against main is opened from this branch to avoid republishing unrelated PR #1537 content.
