# Commercialization status and PHOENIX checkpoint: Verified Website Inquiry Audit

Date: 2026-10-22. Base `main`: `3a7a0b7a5ece796e617c0c363118d4b1618bf9c1`.
Branch: `feat/commercialization-verified-inquiry-audit-20261022`.
Work packet: `docs/commercialization/VERIFIED_INQUIRY_AUDIT_WORK_PACKET_2026-10-22.md` (CP-01).

## Stage ledger

| Stage | State | Evidence |
|---|---|---|
| ENGINEERING READY | **PARTIAL.** Billing repaired and tested. The Actor package is not yet reproducible or built (CP-01 W1–W2). | `artifacts/commercialization/billing-repair-test-receipt-2026-10-22.txt` (22/22, PostgreSQL test ran) |
| STORE READY | **NO.** Listing, pricing spec and reservation-database setup are not prepared (W7). The price is not selected (W5). | none |
| DEPLOYED | **NO.** Nothing was published or deployed. A local test is not an Apify deployment. | none |
| BUYER VALIDATED | **NO.** No buyer has accepted an offer. PR #1535's three outreach drafts are unsent. | none |
| DELIVERY ACCEPTED | **NO.** | none |
| CLEARED PROFIT | **$0.00.** The highest revenue-ledger tier reached by any mechanism is SIMULATED. | `src/revenue-reality-ledger.mjs` |

## What changed on this branch

1. Two regression tests reproduce the reported defects on unchanged `main` (commit `ebf7f4f`):
   - A: concurrent runs billed 2×;
   - B: a refused charge still published a charge id.
   
   Receipt: `artifacts/commercialization/billing-defects-reproduced-before-fix-2026-10-22.txt`.
2. Repair (commit `c9f4708`):
   - atomic cross-run reservations (`src/charge-reservations.mjs`);
   - the billing state at delivery kept separate from the final billing state;
   - unknown outcomes kept reserved and never retried;
   - an Apify adapter (`src/apify-ppe-billing.mjs`) that handles three apify 3.7.2 behaviours read from its source:
     - unpriced events report `chargedCount = 1` without billing;
     - the SDK bills one event over the limit once the budget is exhausted;
     - a priced dataset-item event would bill free rows.
   - a pay-per-event Actor run without the reservation database stops before probing;
   - apify pinned to 3.7.2.
3. The CP-01 work packet for Chat on Steroids (W1–W8).

## Reconciliation of prior PRs

- **#1533 (merged):** the engine reused here. Its tournament result (generic defect claims: pessimistic −40 / −20 / 250 USD per month) is preserved, and W5 must report next to it.
- **#1531 (merged into #1533):** the Inquiry Path Coherence Engine. Reused unchanged.
- **#1532 (open, stale):** not merged.
  - It is reconciled by running its own integrity test file against `main`'s modules: 3 of its 8 tests pass and 5 money-integrity repairs are still missing. CP-01 W4 ports them.
  - Its two prototypes (`cash-now-api-contract-diff`, `cash-now-procurement-amendments`) stay on that branch as donor work.
- **#1535 (open, GPT Work):**
  - It owns payout, invoicing and W-8BEN preparation, the $99 one-site pilot terms, the Reliant sample, and the three unsent outreach drafts.
  - CP-01 adopts its experiment `UB-FIRST-CASH-20261022-01` instead of creating a second one.

## Economic position (honest)

Per-site compute is plausibly cents or less. The decisive unknowns are:

- finding prevalence on an unselected site list;
- whether any buyer pays;
- founder minutes per sale.

None of these is measured yet. Measuring them is CP-01 W5 and W6. The direct $99 pilot needs no reservation database and no Store listing: it runs delivery-only. That makes it the shortest lawful path to a first buyer, subject to PR #1535's payout, invoicing and authorisation gates.

## Founder actions (maximum three)

1. **Authorise or decline a zero-spend managed PostgreSQL** for the charge-reservation ledger. Needed only for the Apify Store pay-per-event channel; the direct pilot does not need it. Default if unanswered: the Store channel stays closed.
2. **The PR #1535 gates, unchanged:** PayPal account inspection, ETA invoicing status, and approving the exact three outreach messages. Nothing is sent by default.
3. **Approve the final price** after CP-01 W5 reports measured costs. Until then every price is a hypothesis.

## Delegation status

Direct delegation to Chat on Steroids is **not available** from this Claude Code session; it is a ChatGPT-side connector. No handoff was delivered. The founder pastes this into Chat on Steroids (`@Chat On Steroids Core`):

```text
Repository mohammedwessam2007/uberbondd. Check out branch feat/commercialization-verified-inquiry-audit-20261022 (based on main 3a7a0b7). Read AGENTS.md, then execute docs/commercialization/VERIFIED_INQUIRY_AUDIT_WORK_PACKET_2026-10-22.md items W1–W8 in order, within its §6 external-effect limits. Push to that branch or a child branch, open or update a DRAFT PR only, never merge. Return the §7 evidence list. Send billing-design disputes back to Claude instead of changing them.
```

## PHOENIX checkpoint

- **Checkpoint ID:** `PHX-COMM-CP01-20261022`.
- **Recover:** this file, the CP-01 packet, the two receipts, and PRs #1532 and #1535.
- **Next frontier:**
  1. Chat on Steroids executes W1–W8.
  2. Claude reviews the actual diff (payment correctness, cross-run concurrency, SSRF and budgets, economic assumptions, customer experience, recovery, deployment compatibility, evidence integrity).
  3. Founder decisions above.
  4. The first buyer through PR #1535's pilot.
- **Do not:** reopen the billing design without a dispute; mark any stage above NO as done without its evidence; merge PR #1532 wholesale; send outreach.
- **Unresolved:**
  - which Apify CU rate applies to pay-per-event developer costs;
  - Apify's refund handling for pay-per-event events;
  - whether Apify request-queue `uniqueKey` adds are atomic (unverified, not relied on).
- **890 crossover:** ancestry kept (`founder-moonshot-0058`, `0146`, `0306`, `0513`, `0013`). The reservation mechanism is NO_MATERIAL_890_CROSSOVER_OBSERVED. The corpus is unchanged.
