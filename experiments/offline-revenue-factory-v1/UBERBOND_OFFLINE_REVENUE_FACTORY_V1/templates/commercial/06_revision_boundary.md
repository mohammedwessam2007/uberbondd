# Revision boundary — [LANE]

Defines what's included in the original delivery price vs. what
constitutes a new, separately-priced engagement. Set this
expectation with the buyer **before** delivery, not after a dispute.

## Included as a free revision (same run, same input)
- Re-rendering the same run's evidence in a different template (`direct_buyer` / `white_label_partner` / `internal_qa` / `technical_appendix`) — no new `execute` needed, evidence doesn't change.
- Correcting a typo or formatting issue in the rendered report that does not change a finding's substance.
- Re-running `verify-package` if the buyer reports a checksum concern.

## Requires a new engagement (new run, new price)
- Any change to the input fixtures/files (new incident data, new scan results, a new RFP document, an updated funnel, a new MRF file).
- Re-running after the buyer disputes a specific finding and wants it re-derived from corrected input.
- Adding a lane not covered by the original engagement.
- Re-running after the `STALE_THRESHOLD_DAYS` window has passed on time-sensitive input (`hospital_mrf`: 365 days; `accessibility`: 90 days) and the buyer wants a fresh read.

## Explicitly never included, revision or not
- Taking any action the system doesn't take at all — see `02_exclusions.md`. A revision cannot make the system submit, certify, claim, or quantify what it was built never to do.
