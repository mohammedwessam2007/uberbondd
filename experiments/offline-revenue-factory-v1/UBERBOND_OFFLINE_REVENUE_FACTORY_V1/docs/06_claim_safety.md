# Claim safety

`src/urf/claim_safety/rules.py::scan_text` is a deterministic,
pattern-based scanner over report text (executive summary + limitations
at `render` time). It is best-effort and says so in its own docstring —
it does not claim perfect detection.

## Categories (`_PROHIBITED_PATTERNS`)
| Category | What it catches |
|---|---|
| `guaranteed_recovery` | "guarantee(d/s) [you will] recover..." |
| `guaranteed_savings` | "guarantee(d/s) savings / to save" |
| `guaranteed_revenue_claim` | "guarantee(d/s) revenue/income/profit" |
| `compliance_claim` | "is/are [fully] compliant", "certify/certifies/certified compliance" |
| `legal_approval` | "legally approved/cleared/sufficient", "meets all legal requirements" |
| `accessibility_certification` | "WCAG 2.x AA/AAA certified/certification/compliant", "ADA compliant/certified" |
| `microsoft_eligibility_claim` | "you/customer is/are eligible for [a] [Microsoft] [SLA] credit", "Microsoft will/has approved" |
| `hospital_price_accuracy_claim` | "prices are accurate", "file is complete and accurate" |
| `government_acceptance_claim` | "will/is [be] accepted by the agency/government/procurement" |
| `conversion_uplift_claim` | "will increase conversion(s) by N", "guarantee(d/s) a conversion uplift/increase" |
| `security_certification_claim` | "PCI/SOC 2/ISO 27001 certified/compliant" |
| `professional_advice_claim` | "this is legal/tax/accounting/medical advice" |

Two further checks run over all text, not just prohibited-phrase matches:
- **`unsupported_number`** — any `$amount` or `N%` token with no
  evidence marker (`[ev-...]`, `[fnd-...]`, or the literal text
  `evidence_ref`) within 60 characters on either side.
- **`unverified_price`** — any sentence containing the word "price"
  near a dollar/percent figure that lacks a verification marker
  (`verified`, `source-derived`, `as stated in`) nearby.

A separate function, `check_synthetic_disclosure(text, uses_synthetic_data)`,
requires the literal word "synthetic" to appear somewhere in the text
whenever the report is built from synthetic fixture data.

## Enforcement point
`cli.py`'s `render` stage calls `scan_text` (and
`check_synthetic_disclosure`) over the report's executive summary and
limitations before writing any report file. Any violation **blocks the
render** — `render` raises `SystemExit` rather than writing a report
that contains a prohibited claim, an unsupported number, an unverified
price, or an undisclosed synthetic-data report. There is no "warn and
continue" mode; a lane author who writes an unsafe `executive_summary`
in `lane_meta()` will find out the first time they run `render`, not
after a report has already been generated.

## Test coverage
`tests/test_claim_safety.py` — 12 tests, all passing, covering: every
prohibited category triggers on a matching sentence, clean text
produces no violations, unsupported-number detection with and without
an adjacent evidence marker, unverified-price detection with and
without a verification marker, and the synthetic-disclosure check in
both the disclosed and undisclosed case.
