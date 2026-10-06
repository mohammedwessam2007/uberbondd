# Contra first-cash continuation

Status: `CONTRA_EGYPT_ROUTE_PROVIDER_CONFIRMED__ACCOUNT_SETUP_PENDING`

Recovered main: `647d1cf794b2b22e0be3275600da4b4a157152db`, refreshed October 6 Cairo. Preserve unmerged XPay PR #1242, all solved Revenue Singularity layers and the current launch law in `docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md`.

Contra is the preferred zero-new-recurring-cost first-cash path, but its unfinished account setup is no longer a blocker to buying Winnr. It remains a blocker to claiming the collection rail is account-ready.

## Exact current provider truth

An existing Contra account is evidenced by prior account emails. Do not create a duplicate account.

Contra support directly confirmed to Mohamed on October 6 that:

1. payments can be received through invoices, projects and payment links;
2. Egyptian bank accounts are supported for payout through SWIFT;
3. proof of address or other additional documents are requested only if the payment processor asks for them during KYC;
4. Contra did not identify a separate merchant-review gate before these payment mechanisms, although standard payout review may occur when withdrawing.

This moves the country/rail state beyond generic documentation to `EGYPT_ROUTE_PROVIDER_CONFIRMED`.

It does NOT prove the exact existing account's authenticated state, KYC/tax completion, Wallet state, payout destination, available currencies, exact fees, payout timing or ability to create a payment request at this moment. Those remain account-specific observations.

## Current access truth

The authenticated account was not recovered in the previous browser continuation. The visible Contra page returned to Log in after the secure sign-in flow was interrupted. No account field, KYC certification, tax declaration, payout method, proposal, invoice or payment request has been changed or sent.

Next account-level boundary remains: recover the EXISTING Contra account using the provider's secure sign-in flow. Passwords/OTPs are never requested in chat or retrieved from Gmail for the user.

## Prepared contract/project package

Prepared internal documents:

- `docs/contracts/UBERBOND_CONTRA_MASTER_DRAFT.md`
- `docs/contracts/POWERHOUSE_CONTRA_PROJECT_DRAFT.md`

They remain unsigned, unsent internal drafts and are not yet provider projects.

Powerhouse remains a ranked prospect, not a won client. The recovered USD 2,500 one-client figure remains a commercial hypothesis, not an approved quote or buyer acceptance. Delivery duration remains unresolved until actual systems/data/access are known. Do not hide those unknowns with invented defaults.

## Capability/evidence matrix

| Capability | Current truth |
|---|---|
| invoices / projects / payment links for Egyptian user | `PROVIDER_CONFIRMED` |
| Egyptian bank payout through SWIFT | `PROVIDER_CONFIRMED` |
| exact existing account authenticated | `NOT_YET_OBSERVED` |
| exact account KYC/tax state | `NOT_YET_OBSERVED` |
| exact Wallet/payment-request availability | `NOT_YET_OBSERVED` |
| exact payout destination / QNB compatibility on this account | `NOT_YET_OBSERVED` |
| exact current fees/timing/FX on this account | `NOT_YET_OBSERVED` |
| fixed/milestone escrow semantics | `DOCUMENTED_SUPPORTED` |
| official Contra MCP | `DOCUMENTED_SUPPORTED__AUTHENTICATED_SCHEMA_NOT_INSPECTED` |
| cleared bank cash | `NONE_CLAIMED` |

Official help already reviewed covers paid projects, fees, Wallet, Persona identity verification, taxes/compliance and payout delays. Contra also documents an official MCP integration with authenticated transaction/project/proposal/invoice/payment-link operations and prepare→confirm writes. Do not manufacture settlement/webhook semantics that have not been inspected.

## Canonical money-truth boundary

Reuse existing receivables/reconciliation/payment-verification architecture. Required truth path remains:

provider-origin evidence -> durable billing evidence -> canonical reconciliation -> witness -> payment truth -> delivery authorization.

Keep lifecycle observations distinct:

`CONTRACT_DRAFTED -> CONTRACT_SENT -> CONTRACT_SIGNED -> PAYMENT_REQUESTED -> PAYMENT_PENDING -> FUNDED_OR_ESCROWED -> PROVIDER_PAID -> PAYOUT_PENDING -> PAYOUT_CLEARED`

This is vocabulary, not a guaranteed linear progression. Refunds, reversals, disputes and failed payouts can downgrade prior economic truth. Signature, invoice creation, escrow funding and Wallet balance never mint cleared cash by themselves.

## Continue after account access

1. Inspect actual Independent-account country/plan/profile state without leaking secrets.
2. Complete only the KYC/tax/address steps Contra actually requires. Owner performs biometric/certification steps.
3. Configure the supported Egyptian SWIFT payout destination if exposed; verify the actual bank-destination acceptance, timing and fees from the account/provider.
4. Confirm the authenticated account can create the intended invoice/project/payment-link path. Do not send a client payment request merely as a test.
5. Inspect the actual Contra agreement/project baseline before turning the internal draft into a provider draft.
6. Inspect authenticated MCP schemas/payment-state evidence before implementing a live adapter; otherwise keep a fail-closed manual evidence/import boundary.
7. Preserve XPay and recovered Payoneer as backups. PayPal is not a recovery target.

## Relation to Winnr

Contra account completion is a `COLLECTION_READY` gate, not a `PURCHASE_READY` gate for Winnr.

Winnr may be purchased once its own exact $69 terms/capacity/economics are acceptable and Mohamed explicitly authorizes the spend. Contra should then finish in parallel before UberBond relies on it to collect client money.

No client message, proposal, payment request, charge, transfer, paid Contra plan or cash-received claim is authorized by this handoff.