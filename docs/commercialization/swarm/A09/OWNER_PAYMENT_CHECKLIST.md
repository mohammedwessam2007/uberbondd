# A09 — owner-safe payment verification

**As of:** 2026-10-23 UTC
**Status:** Optional owner-only checks; no action is authorized by this checklist. Safe default: do nothing until the owner chooses to continue.

Passwords, OTPs, card details, bank credentials, and full account numbers stay out of chat and Git. Do not create replacement accounts, submit a payment request as a test, pay a provider, move money, or file a tax form based on this checklist.

| # | Check | Time / cost | Evidence to retain (redacted) | Stop condition |
|---|---|---|---|---|
| 1 | If desired, sign in through the official secure flow to the **existing Contra account**. Inspect wallet, identity/KYC, tax profile, Egypt payout options, and whether the intended invoice/project/payment-link draft can be opened without sending it. | 10–20 minutes; USD 0 for inspection. Any fee or paid feature is outside authority. | Owner-attested date, visible status labels, and a redacted reference. Never export credentials or sensitive account documents. | Stop on an unexpected restriction, identity/legal certification, fee, or account conflict; do not create a duplicate or request money. |
| 2 | Ask the existing receiving bank, through an official channel, whether the account can receive this type of USD SWIFT service/business proceeds. Ask about purpose codes, required documents, incoming/intermediary fees, FX, timing, and reversal handling. | 15–30 minutes; assumed USD 0 only for ordinary inquiry; verify before proceeding. | Redacted written bank answer or owner-attested response. Do not store account numbers or bank secrets in repository artifacts. | Stop if the bank requires a paid service, account change, non-owner assent, or any unapproved financial action. |
| 3 | Ask an Egyptian tax professional and/or ETA through official channels to classify the actual individual/entity, activity, foreign payer, VAT, registration, invoice/e-invoice, reporting, and withholding facts. | 30–60 minutes; fee unknown. No paid engagement is authorized. | Written, fact-specific advice or official guidance with date and scope; retain privately unless a safe, redacted receipt is appropriate. | Stop before any nonzero spend, filing, tax-profile declaration, or legal representation. Do not infer clearance from a generic answer. |

## Required distinction

An owner may verify their own account securely. This does not grant UberBond access, authorize a provider call, KYC submission, customer message, charge, payment request, transfer, or deployment. An account marked ready is not a customer acceptance, payout, or cleared bank credit.

## Evidence needed to lift the HOLD

1. A fresh owner-attested Contra account observation meeting `compileContraCollectionReadiness` requirements.
2. Current bank confirmation of receiving route and material fees/FX/document requirements.
3. Fact-specific Egyptian tax/legal guidance sufficient for the proposed transaction.
4. Separately, before any collection, customer acceptance and explicit authority for the exact external effect.
