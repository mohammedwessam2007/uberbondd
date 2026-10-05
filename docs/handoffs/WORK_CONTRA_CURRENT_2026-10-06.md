# Contra first-cash continuation

Status: CONTRA_BLOCKED_OWNER_PROVIDER — partial internal preparation, NOT mission terminal completion.
Recovered main: 647d1cf794b2b22e0be3275600da4b4a157152db, refreshed October 6 Cairo. Isolated branch: work/contra-first-cash-20261006. Preserve unmerged XPay PR #1242 and all solved Revenue Singularity layers. No Winnr purchase in this mission.

## Exact current access truth

Latest issue #1188 comment 6001861115 confirms an existing Contra account from account emails and a sent support inquiry about Egypt-individual eligibility, QNB compatibility, address-proof alternatives and merchant/card-link review. Inquiry sent is not approval. The authenticated account has not been recovered in this browser: homepage shows Log in; the prior secure sign-in request was interrupted, and a fresh October 6 page again shows Log in. Do not create a duplicate account. No account fields, KYC, tax, payout method or provider proposal has been changed or verified.

Prepared internal documents: docs/contracts/UBERBOND_CONTRA_MASTER_DRAFT.md and docs/contracts/POWERHOUSE_CONTRA_PROJECT_DRAFT.md. They are unsigned, unsent and not yet provider drafts. Canonical scope/acceptance recovered; price remains a hypothesis and delivery duration is not established. Do not conceal those missing facts with defaults.

## Provider evidence matrix

All following capabilities are DOCUMENTED_SUPPORTED only, not ACCOUNT_AVAILABLE or LIVE_READY:

| Capability | Evidence / boundary |
|---|---|
| Fixed and milestone escrow | Official paid-project guide: fee funded before work; releases subject to approval; optional upfront release. Preserve actual agreement. |
| One-off invoices / payment links | Official help/MCP describes them; do not create/send a payment request as a test. |
| Card | Official fees guide lists valid credit/debit cards; actual account merchant eligibility unverified. |
| ACH / SEPA | Client request/review needed under documented fees; account/client eligibility unverified. |
| Wallet / wire / bank details | Country/account-dependent. No bank-transfer receiving details observed. |
| Egypt EGP payout | Listed in official fees with local payout processor 1% and non-major currency FX 1%; eligibility, destination and total fees still require account/provider evidence. |
| USD balance | Official guide describes Contra funds in USD; platform balance is not cleared bank cash. |
| Identity / tax | Persona identity verification documented; W-8BEN collection by payment processors documented. Actual requirements/status not inspected. Owner performs biometric and personal certification. |
| Payout timing | Standard/faster routes and review exist; no account-specific timing observed. Pending ACH/SEPA collection is not withdrawal timing or settlement proof. |
| Fees | Free transaction fee documented as $15 for $1–499 and $29 for $500+; card base 2.9%+$0.30 plus applicable manual/international/FX charges. Recheck exact current checkout. No paid Contra subscription accepted. |

Primary sources reviewed: https://help.contra.com/en/articles/9322763-paid-projects ; https://help.contra.com/en/articles/9322934-fees-overview ; https://help.contra.com/en/articles/9322950-your-contra-wallet ; https://help.contra.com/en/articles/9322955-how-to-verify-your-identity-on-contra ; https://help.contra.com/en/articles/11475790-taxes-and-compliance ; https://help.contra.com/en/articles/9322944-what-to-do-if-your-payout-on-contra-is-delayed ; https://contra.com/features/mcp . Guest payment checkout is documented; do not assert guest project signature requires no lightweight onboarding.

## Supported integration frontier

Contra officially exposes MCP with authenticated transaction history, project/proposal/invoice/payment-link operations, hosted OAuth and prepare→confirm write operations whose preparation expires after 15 minutes. This is a real supported integration candidate. Do NOT claim there is no API. No authenticated MCP tool schema, settlement semantics, reversal coverage or webhook contract has been inspected; therefore no live payment adapter is implemented. Do not manufacture endpoint/event names or use private GraphQL/scraping.

Reuse existing src/receivables-contract.mjs, src/billing-webhook-boundary.mjs, src/billing-webhook-repository.mjs, src/payment-reconciliation-worker.mjs, src/payment-verify-cleared.mjs and delivery gates. Required path: provider-origin evidence → durable billing inbox → canonical reconciliation → witness → cleared-payment truth → delivery authorization. A manual provider evidence/import boundary is required wherever supported APIs cannot provide the exact evidence; manual entry is not self-authenticating provider proof.

Keep distinct lifecycle observations:
CONTRACT_DRAFTED → CONTRACT_SENT → CONTRACT_SIGNED → PAYMENT_REQUESTED → PAYMENT_PENDING → FUNDED_OR_ESCROWED → PROVIDER_PAID → PAYOUT_PENDING → PAYOUT_CLEARED.
This is a vocabulary, not a mandatory linear progression or executable adapter. REFUNDED, REVERSED, DISPUTED and failed payouts can occur later and must downgrade/invalidate economic truth. Signature, invoice creation, initiated payment, escrow and wallet balance never mint cleared cash. Escrow-funded delivery is a separate policy question; do not relax current cleared-payment delivery gate to make escrow usable.

## Continue internally after access

Inspect actual Independent account, Egypt identity/country and free plan; capture current KYC/tax/payout screens and evidence without secrets. Populate routine truthful fields from protected records, stop at owner certification/biometrics/financial account assent. Verify account payment rails, currencies, withdrawal destination, timing and fee allocation. Inspect actual standard agreement and save a reversible unsent provider draft only if creation cannot notify a client. Bind the contract compiler to canonical records without copying PII into Git. Inspect official MCP tool schemas and payment-state evidence before implementing supported adapter/owner UI; otherwise leave manual boundary fail closed. Run focused adversarial tests for any executable changes, then update receipt/handoff and review/merge verified changes.

Next exact owner gate: Contra login dialog → use secure sign-in for the EXISTING account → completion evidenced by an authenticated Contra account/profile/workspace. No password/OTP in chat or Gmail retrieval. KYC/tax/bank gates cannot be specified honestly before that screen is inspected. Price/timing can be decided after qualification; do not send Powerhouse anything now.

No external messages, proposals, payment requests, charges, transfers, purchases, paid plans or production changes performed by this continuation. No cash received claimed. This checkpoint is not CONTRA_FIRST_CASH_READY and does not certify every internal mission item finished.
