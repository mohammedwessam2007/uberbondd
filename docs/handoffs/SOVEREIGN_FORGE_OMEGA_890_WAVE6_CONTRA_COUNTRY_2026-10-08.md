# Sovereign Forge Ω∞ Wave 6 — Contra Payout Country Evidence Must Be Observed

Date: 2026-10-08. Parent main: `132c01f35bb144109f7c995941bf507f435f38d6`, previous Render `dep-db3okat9fdbs73elbu8g` LIVE, 121/121 scoped native suite; all 890 founder literals plus 10 shards unchanged.

## Source-backed defect

Protected owner endpoint `POST /api/owner/contra-collection-observation` in `server-core.mjs` normalized `payout.country` as `compact(input.payout?.country || 'EG', 8)`. For otherwise fully owner-attested ready Wallet/KYC/tax/Swift payout observations, omitting the actual payout country yielded `EG` and could satisfy `src/contra-collection-readiness.mjs`'s explicit `country==='EG'` gate. The software was creating an account-specific country observation that the signed-in provider UI had not furnished.

The fix does NOT assert that the account has a valid Egyptian payout, and does NOT call the provider. It removes the fallback: `compact(input.payout?.country, 8)`. Missing/blank/US values now remain a provider-country prerequisite hold (`PAYOUT_METHOD_REQUIRED`); an explicitly observed `EG` can satisfy this particular field but remains owner-attested, never provider-authenticated and never grants `paymentRequestAuthority` or cleared cash.

## Executable hostile acceptance

Extended existing `tests/server-request-handler.test.mjs` with protected HTTP handler test that exercises missing, blank, US and explicitly EG country while asserting `paymentRequestsSent=0`, `paymentRequestAuthority=NONE`. No port/socket or customer effect. Reused existing `tests/contra-collection-readiness.test.mjs` (9 test cases) and added BOTH suites to the existing credential-isolated production native test runner, rather than inventing another payment router. This is on exact user-facing protected API, not detached helper.

Adversarial donors from original 890: #0057 Proof Economy (bank-country witness), #0059 Prediction Accounting (country no longer inferred), #0060 Civilizational Memory (historical mistaken assumption preserved), #0067 Trust Compiler (absence means unknown), #0653 Self-Falsifying System (missing-country fixture), #0877 Recursion Proof System (no authority widening). Remaining source ideas retained as addressable, not implemented by claim.

Alternatives: (a) chosen one-line removal + actual endpoint regression, (b) reusable strict owner-observation compiler/normalizer, deferred until evidence of additional similar issues, (c) delegated provider-authenticated Contra MCP, currently unavailable without existing account authentication; cannot be substituted with fabricated receipts.

## Legal external requirement recovered

The official Egypt Personal Data Protection Center website https://www.pdpc.gov.eg/ presents electronic direct marketing obligations under Law 151/2020 and executive regulations 816/2025 including prior explicit consent and sender licensing/permits. Primary-source legal text Law 151 Articles 17–18 similarly requires consent, sender identity/contact, purpose and opt-out, and consent records. This is a **regulatory source**, NOT case-specific legal clearance for UberBond's Egyptian sender or for any destination jurisdiction; no marketing is activated. Obtain qualified local guidance and exact recipient/channel evidence before grants.

## Reality boundary

The existing Contra owner observation remains account-unverified: provider-general confirmation of invoices/projects/payment links and Egyptian SWIFT does not prove this actual account's login, Wallet, KYC/tax, payout or payment request readiness. Existing legal send clearance, actual buyer acceptance, cleared bank cash and independent frontier quality/accounting are external. Zero purchase of Winnr, zero customer outreach, zero change in account/identity, zero real charges.

## PHOENIX

Event `UBERBOND-FORGE-OMEGA-20261008-W6-CONTRA-PAYOUT-COUNTRY-NONINFERENCE`. Once merged, append exact PR/main SHA and Render native regression/boot receipt to #1188. Don't describe code as provider approval, or all 50 atlas organs / 210 hostile cases as completed; this wave addresses one real revenue-critical false-eligibility mechanism only. Next action: use current authenticated existing Contra account and qualified legal channel review, no credentials in GitHub.
