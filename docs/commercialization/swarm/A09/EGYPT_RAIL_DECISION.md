# A09 — Egypt payment rail and legal-truth decision

**As of:** 2026-10-23 UTC
**Decision:** `HOLD_NO_COLLECTION_READY_RAIL`
**Profit:** USD 0 bank-cleared contribution profit independently evidenced
**Authority used:** public read-only HTTP GETs and repository inspection only; no account access, provider API, payment, spend, filing, message, deployment, or account mutation.

## Decision

Do not describe any route as ready to collect or any tax treatment as cleared. Contra is the only near-term direct-customer candidate in the inspected evidence, but only at the country/provider-support level: the existing account's authentication, wallet, identity, tax profile, Egyptian payout setup, fees/FX, and payment-path capability remain unobserved. The code's existing readiness compiler correctly fails closed without a fresh owner-attested account observation.

Exclude PayPal for this founder. Repository owner-reported evidence records the existing account as permanently deactivated and explicitly prohibits a replacement account. This is an account-specific exclusion, not a claim about all Egyptian PayPal users. A live code discrepancy remains: the A09 worker HEAD still returns `RAIL_PLAUSIBLE` and recommends confirming that deactivated account. A09 leaves shared code untouched and hands this conflict to A20 alongside open draft PR #1538.

Keep the Apify Store unpublished and do not count its local delivery-only smoke as sales or cash. The USD 5.3888 optimistic contribution is a scenario, below Apify's published USD 20 PayPal/Wise and USD 100 wire payout minima. PayPal is unusable for this founder; Wise eligibility is unknown. Apify's generic USD 10–50 intermediary-fee range is not an Egypt quote. Actual CU, charges, payout, FX, fees, customer acceptance, and bank credit are unobserved.

Egyptian tax, VAT, export-of-services, registration, invoicing/e-invoicing, and filing status remain `UNKNOWN`. The ETA endpoints retrieved either a support/access response or a portal shell, not a substantive rule applicable to the founder's facts. The IRS W-8BEN page is relevant only if an applicable U.S. payer/withholding agent requests that form; it is not Egyptian tax advice. No legal-clearance claim is made.

## One falsifiable hypothesis

The existing Contra account can support a direct-customer pilot only if a fresh, owner-attested authenticated account observation proves the required wallet, identity/KYC, tax profile, Egypt SWIFT payout, and intended payment path are ready. Until that evidence exists, Contra is not `COLLECTION_READY`.

**Falsifier:** a fresh official Contra account-specific response or secure account observation showing the existing account cannot use the stated Egypt route, or cannot satisfy one of those prerequisites. Conversely, a current observation satisfying the existing `compileContraCollectionReadiness` contract may lift only the collection-readiness gate; it does not prove customer acceptance, bank-cleared cash, legal/tax clearance, or authority to send a payment request.

## Founder 890 crossover

The bounded corpus scan retrieved the original bodies, not just their index entries:

- `founder-moonshot-0054`, **THE IDEA IMMUNE SYSTEM** (literal source lines 214–217): "Every major idea faces adversarial falsification, alternative explanations, independent replication, economic reality, and physical constraints before receiving resources." Applied here by separating public policy, owner-reported account state, and tax conclusion; keeping falsifiers visible; and withholding any rail decision that depends on unknown account/legal facts.
- `founder-moonshot-0305`, **THE OUTCOME ECONOMY** (literal source lines 1226–1229): "Shift economic organization away from paying mainly for activity or access toward verified beneficial outcomes where measurement permits." Applied here by not promoting an invoice, event, modeled contribution, or payout release to cleared profit; require bank-credit evidence, net reconciliation, and customer acceptance.

The canonical manifest records all 890 literal entries as recovered (SHA-256 `23bb3c1813e3b5997d8ec76c801db2d5c59baf780573fb496da867d90d7017f0`). This bounded crossover scan does not claim implementation or realization of the corpus.

## Eight required research phases

| Phase | Evidence and concrete result | Counterexample / limit |
|---|---|---|
| Official providers | PayPal Egypt help and fees pages; Apify developer payout, pay-per-event, and transfer-fee pages; repository-recorded Contra support confirmation. | Public policy and an internal summary are not authenticated account eligibility. |
| Egypt receiving eligibility | Contra support was recorded as confirming Egyptian invoices/projects/payment links and Egyptian SWIFT payout. | The current Contra account is unobserved. PayPal's Egyptian owner account is reported permanently deactivated. Wise, Payoneer, XPay, and direct-bank account eligibility are unknown or unverified. |
| Timing and threshold | Apify calculates days 1–10, invoices day 11, review days 11–14, scheduled releases days 21–25, then bank-processing time; minimum USD 20 PayPal/Wise, USD 100 wire; below-minimum balances carry forward. | This is Apify's public schedule, not this creator's eligibility or payout date. |
| Fees, FX, refunds | Apify says wire intermediary/recipient-bank fees are typically USD 10–50, with payer/beneficiary allocation options; actual deductions vary. PayPal's localized fee page exists. | The Apify range is not Egypt-specific; no account-level Contra/PayPal/Wise/bank fee, FX spread, refund outcome, or net amount is verified. |
| Tax and invoicing | ETA English, Arabic, and e-invoicing portal retrievals are preserved in `PAYMENT_PROVIDER_SOURCES.json`; IRS W-8BEN scope is recorded separately. | No applicable Egyptian rule or owner-specific classification was recovered. No tax, VAT, export, invoice, or legal conclusion. |
| Owner-safe verification | Three optional owner actions are listed in `OWNER_PAYMENT_CHECKLIST.md`; existing-account and bank checks avoid sending a payment request. | No passwords, OTPs, bank secrets, or private account documents belong in chat or Git; any fee or KYC assent remains owner-only. |
| Sandbox only | Apify's local smoke was `DELIVERY_ONLY`, charged USD 0, with no provider payout. | Local software evidence is not a buyer, charge, provider settlement, payout, or bank credit. |
| Fallback rails | Payoneer is existing-account recovery only; XPay remains review/test-only; Wise and direct Egyptian SWIFT terms are unknown. | No duplicate provider accounts, activation, KYC, or payout operation is authorized or evidenced. |

## Exact source and evidence boundaries

The machine-readable ledger `artifacts/commercialization/swarm/A09/PAYMENT_PROVIDER_SOURCES.json` records dated source URLs, response status, content hashes, claims, limitations, and falsifiers. Relevant repository evidence:

- `docs/handoffs/WORK_CONTRA_CURRENT_2026-10-06.md` records Contra support's country-route confirmation and explicitly leaves account/KYC/tax/wallet/fees unresolved.
- `docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md` records the PayPal deactivation and prohibition on a replacement account.
- `src/contra-collection-readiness.mjs` requires fresh owner-attested account evidence and keeps `paymentRequestAuthority: NONE`; generic provider support alone yields `ACCOUNT_OBSERVATION_REQUIRED`.
- `docs/commercialization/APIFY_STORE_READINESS.md` says the Store is unpublished and labels the local Actor result `DELIVERY_ONLY`, `charged: 0`.
- `artifacts/commercialization/unit-economics-2026-10.json` labels USD 5.3888 as an unvalidated optimistic scenario, not demand or cash.

The Apify payout article's current public text is described in the source ledger; its USD 10–50 wire fee statement must not be copied into an Egypt-specific quote. PayPal's Egypt receiving and generic withdrawal descriptions are both preserved because their route details do not prove the exact account's available route.

## Net-cash evidence rule

Count money only after an accepted customer scope, provider-origin payment and payout receipts, an owner-observed matching bank credit, and reconciliation of gross amount, FX, provider/intermediary/receiving fees, reversals, refund/dispute exposure, and attributable delivery costs. A draft, invoice, escrow/wallet balance, pending payout, sandbox result, or provider release alone is not bank-cleared contribution profit. The current verified baseline remains **USD 0**.

## Stop / re-open conditions

Keep the HOLD if any account, KYC, tax, bank, payout, fee, FX, refund, or permission fact remains unknown. Stop before nonzero spend, KYC/legal assent, public publishing, any provider/customer action, or money movement. Re-open only with current account-specific receipts and appropriately authoritative tax guidance; retain contradictions and source history. A future readiness result cannot itself authorize a customer payment request or promote a provider event to cleared cash.
