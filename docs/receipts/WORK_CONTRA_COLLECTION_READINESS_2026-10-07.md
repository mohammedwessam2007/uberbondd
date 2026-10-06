# Contra collection-readiness closure packet — 2026-10-07

Status: **INTERNAL_READINESS_COMPILER_IMPLEMENTED__AUTHENTICATED_ACCOUNT_OBSERVATION_STILL_OWNER_ONLY**

Parent main at start: `187dec272f802df66af49cbcf626f6650427a3a8`

## What this closes

UberBond already selected Contra as the zero-new-recurring-cost first-cash route, but the live Revenue surface could only say `ACCOUNT_SETUP_PENDING`. This packet adds a deterministic, fail-closed account-readiness compiler so authenticated UI evidence can be translated into an exact state without treating provider documentation, settings, or hopeful configuration as proof.

The compiler independently gates:

- existing-account confirmation and authentication;
- Contra Wallet readiness;
- identity verification;
- tax profile completion or an explicit provider statement that it is not required;
- an owner-matched Egyptian payout destination using a provider-exposed SWIFT or local-bank route;
- absence of unresolved provider blocking requirements;
- ability to reach a One-Time Fixed (Escrow) project path.

Even when all gates pass, the result carries `paymentRequestAuthority: NONE`, `businessEffectAuthority: NONE`, and zero external-effect counters. `COLLECTION_READY` therefore means only that the observed existing account appears able to contract and collect. It does **not** mean a client exists, a proposal was sent, money cleared, funds are withdrawable, or any payout occurred.

## Current provider evidence

Current Contra documentation supports:

- projects, invoices and payment links for receiving money;
- One-Time Fixed (Escrow) as the project type intended for new fixed-scope relationships;
- standard Contra contracts, locally compliant contracts where available, or a custom PDF contract;
- Wallet identity verification through Persona before receiving payments;
- Egyptian local-bank payout in EGP and SWIFT payout, with fees shown at withdrawal;
- W-8BEN information collection for non-US Independents.

Provider support correspondence already preserved in the Oct 6 handoff confirms Egypt receiving through invoices/projects/payment links and Egyptian-bank payout through SWIFT, with extra proof-of-address only when the payment processor requests additional KYC.

Public sources revalidated 2026-10-07:
- https://help.contra.com/en/articles/9322763-paid-projects
- https://help.contra.com/en/articles/9322955-how-to-verify-your-identity-on-contra
- https://help.contra.com/en/articles/9322934-fees-overview
- https://help.contra.com/en/articles/11475790-taxes-and-compliance
- https://help.contra.com/en/articles/13655628-payment-links

## Default first-cash contract/payment flow

Internal default only, not a client-accepted price or external effect:

1. **One-Time Fixed (Escrow)** project.
2. Contra contract template with the existing UberBond scope/acceptance schedule.
3. Total fixed fee funded before kickoff.
4. Deliverable release only against the defined acceptance criteria.
5. Payment link is a speed fallback only after scope/agreement is already bound.
6. Current `$2,500` is preserved only as the existing canonical price hypothesis. It is not represented as buyer acceptance.

For a free-plan transaction above $500, current Contra documentation caps the platform fee at $29; processing and withdrawal fees remain method-dependent and must be read from the actual checkout/withdrawal surface before a real transaction.

## New deterministic artifacts

- `src/contra-collection-readiness.mjs`
- `tests/contra-collection-readiness.test.mjs`
- `scripts/contra-collection-doctor.mjs`
- `config/contra-account-observation.example.json`

Focused local verification performed before repository write:

- source syntax: PASS
- test syntax: PASS
- `node --test tests/contra-collection-readiness.test.mjs`: **8 pass / 0 fail**

Hosted mega-suite truth is unchanged: GitHub runners/Vercel verification capacity remain externally blocked and this packet does not counterfeit a full-suite pass.

## Remaining external/owner fact

The exact existing Contra account must still be authenticated and observed. The owner handles password, biometric/identity certification, W-8BEN/tax attestations and bank-account assent. No duplicate Contra account should be created.

After that observation, run:

`node scripts/contra-collection-doctor.mjs <observation.json>`

A result of `COLLECTION_READY` is the mechanical collection gate. Sending a proposal/payment request remains a separate explicit effect boundary.
