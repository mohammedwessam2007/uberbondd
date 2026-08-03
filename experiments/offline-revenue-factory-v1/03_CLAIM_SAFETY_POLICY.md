# Claim safety policy

Full technical detail: `UBERBOND_OFFLINE_REVENUE_FACTORY_V1/docs/06_claim_safety.md`.
This is the mission-level policy statement.

## Policy
No report this system generates may state or imply: guaranteed
recovery, guaranteed savings, guaranteed revenue, full compliance,
legal approval, accessibility certification, Microsoft SLA-credit
eligibility, hospital-price accuracy, government/agency acceptance, a
quantified conversion uplift, a security certification, or
professional (legal/tax/accounting/medical) advice. No report may
state a bare dollar or percent figure without an adjacent evidence
reference, or mention a price without a verification marker, or omit
disclosure that it is built from synthetic data when it is.

## Enforcement
This is enforced in code, not only in this document.
`src/urf/claim_safety/rules.py::scan_text` runs at the `render` CLI
stage over every report's executive summary and limitations.
**Any violation blocks the render** — `render` raises `SystemExit`
rather than producing a report containing the violation. There is no
path in this codebase to bypass this check and still get a rendered
report through the CLI.

## Categories (verbatim from `_PROHIBITED_PATTERNS` plus the two
## numeric checks)
`guaranteed_recovery`, `guaranteed_savings`, `guaranteed_revenue_claim`,
`compliance_claim`, `legal_approval`, `accessibility_certification`,
`microsoft_eligibility_claim`, `hospital_price_accuracy_claim`,
`government_acceptance_claim`, `conversion_uplift_claim`,
`security_certification_claim`, `professional_advice_claim`,
`unsupported_number`, `unverified_price`, `synthetic_disclosure_missing`.

## Proof this works
`tests/test_claim_safety.py` — 12 tests, all passing — exercises every
category with a deliberately unsafe sentence and confirms it is
caught, plus confirms clean text passes and both the with-marker and
without-marker cases for the two numeric checks.

## Known limitation
This is deterministic pattern matching (regex), not semantic
understanding. It will not catch every possible unsafe phrasing —
see `SECURITY_AND_PRIVACY_BOUNDARIES.md` and
`16_LIMITATION_REGISTER.md`. It is a mandatory structural backstop, not
a substitute for human legal review before any report reaches a real
buyer.
