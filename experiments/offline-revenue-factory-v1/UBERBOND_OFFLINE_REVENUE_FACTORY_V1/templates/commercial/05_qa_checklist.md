# QA checklist — [LANE]

## Automated checks (run by `urf.cli qa`, base + lane-specific)
These already ran and must show `status: pass` in `qa_result.json`
before delivery. This section is a human-readable mirror, not a
replacement — always check the real file.

**Base checks (every lane):**
- `qa-evidence-refs-resolve` — every finding's `evidence_refs` points to a real evidence item.
- `qa-finding-labels-valid` — every finding uses one of the 9 allowed labels.
- `qa-human-review-consistency` — findings flagged `human_review_required` are internally consistent with the run's human_review register.

**Lane-specific checks:**
| Lane | check_id | What it blocks |
|---|---|---|
| msft_csp | `qa-no-positive-eligibility` | Any finding claiming eligibility instead of remaining blocked. |
| msft_csp | `qa-eligibility-conclusion-blocked` | The overall conclusion finding must be `blocked conclusion`. |
| hospital_mrf | `qa-no-compliance-certification` | Any finding using "is compliant" / "certified compliant" / "price accuracy confirmed" / "legally sufficient". |
| agency_rfp | `qa-no-submission-recommendation` | Any finding recommending submission or asserting legal sufficiency. |
| agency_rfp | `qa-conflicts-flagged-as-issues` | Every source-declared conflict has a matching issue record. |
| accessibility | `qa-no-conformance-certification` | Any finding asserting WCAG/ADA/508 conformance. |
| accessibility | `qa-violation-dedup-sane` | Deduplicated violation count never exceeds the raw scanned count. |
| lead_path | `qa-no-revenue-quantification-claim` | Any finding quantifying a dollar revenue loss or certifying leak-free status. |

## Manual checks (the system cannot run these itself)
- [ ] A second human (not the run operator) has read the rendered report end to end.
- [ ] Every number in the buyer-facing report traces back to a finding/evidence item you can point to by ID.
- [ ] No sentence in the report could be read as a guarantee, certification, or eligibility claim, even out of context.
- [ ] The synthetic-data disclosure is present and accurate for this input (real buyer data vs. synthetic fixture — do not ship a synthetic-fixture disclaimer against real buyer data or vice versa).
- [ ] The correct template was used for the correct audience (white-label partner package has branding stripped; direct buyer package does not).
