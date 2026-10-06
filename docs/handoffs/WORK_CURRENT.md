# WORK CURRENT — crash-safe recovery pointer

Date: 2026-10-07 (Africa/Cairo)

Status: `WINNR_69_PURCHASE_READY__AWAITING_EXPLICIT_OWNER_SPEND_AUTHORIZATION`

Purpose: this is the shortest authoritative recovery pointer for the current UberBond launch and repair frontier. It supersedes the Oct 5 all-or-nothing purchase-gate interpretation and the Oct 6 precheck wording without deleting either lineage.

## Recovery order

Refresh `main`, then read in this order:

1. `AGENTS.md`
2. root `CLAUDE.md`
3. `.claude/CLAUDE.md`
4. newest comment on GitHub issue #1188
5. this file
6. `docs/handoffs/WORK_LAUNCH_READINESS_REPAIR_CURRENT_2026-10-07.md`
7. `docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md`
8. `docs/handoffs/WORK_CONTRA_CURRENT_2026-10-06.md`
9. historical repair/Winnr receipts only when needed for lineage

Newest verified source/provider evidence outranks stale status text. Always refresh `main`; never infer authority from a filename such as CURRENT/READY/FINAL.

## Gate model

Keep four consequence domains separate:

- `PURCHASE_READY` — Winnr price/terms/capacity/economics plus explicit founder spend authorization.
- `SEND_READY` — exact prospect, lawful route, current evidence, recipient, sender, footer/unsubscribe, fresh transport and exact effect authorization.
- `COLLECTION_READY` — authenticated collection provider account, account-specific KYC/tax/Wallet/payout/payment-request capability.
- `DELIVERY_READY` — signed scope/dependencies plus canonical payment/delivery authorization.

A blocker in one domain does not automatically block another.

## Current purchase truth

Current provider-origin Winnr evidence has closed the purchase precheck: intended Startup base plan is $69/month, monthly-only/cancelable, 50 mailboxes and 10 domain slots; optional warming is a separate add-on; the existing pilot remains separate. The purchase state is therefore `WINNR_69_PURCHASE_READY__AWAITING_EXPLICIT_OWNER_SPEND_AUTHORIZATION`.

Do not charge the $69 or any optional add-on until Mohamed explicitly authorizes that financial effect.

Pending counsel, Contra KYC/payout setup, XPay approval, Payoneer recovery, physical-iPad proof, buyer behavior and a fresh pre-send G-SPOT/SMTP run are not purchase blockers. They remain relevant to their own send/collection/evidence gates.

## Current collection/legal truth

- Contra is the selected first-cash route, with Egypt receiving capability and Egyptian-bank SWIFT payout provider-confirmed. Exact existing-account authentication/KYC/tax/Wallet/payout state remains unverified, so collection is not yet account-ready.
- XPay remains review/test-only backup.
- Payoneer remains existing-account recovery backup.
- PayPal is permanently deactivated and must not appear as an owner recovery action.
- bespoke Egypt outbound counsel remains pending. It blocks only routes that still require that legal resolution before sending.

## Repair frontier

PR #1251, `fix/launch-readiness-repair-20261007`, is the canonical repair lane. It subsumes the internally useful repair work from PR #1250 while retaining unique receipts/tests as lineage.

Verified exact-head predecessor `0d21e54a47943eea19f5dd193a25a88912492159` proved on Vercel that the scale-safe repository atlas completes with full text coverage and zero truncation. The lite preview reached READY and built a 163,581-node / 650,318-edge Ultimate Graph with zero orphan nodes. This crash-safe consolidation commit changes only documentation/tests copied from preserved lineage and therefore still requires exact-head verification before merge.

## Hard boundaries

- no fabricated legal/provider/payment/customer facts;
- no Intelo replay;
- no release of quarantined/protective sender holds just for throughput;
- no claim that escrow/wallet/pending payout is cleared cash;
- no duplicate/evasive provider accounts;
- no new recurring spend without explicit founder authorization;
- no real prospect send without the applicable exact effect authorization;
- no delivery without applicable canonical authorization.

## Immediate execution

Finish exact-head verification of PR #1251, merge only verified source into `main`, verify the exact merged SHA in production, retire PR #1250 only after its unique evidence is preserved, then stop at genuine owner/provider boundaries.

No solved Revenue Singularity layer should be rebuilt.
