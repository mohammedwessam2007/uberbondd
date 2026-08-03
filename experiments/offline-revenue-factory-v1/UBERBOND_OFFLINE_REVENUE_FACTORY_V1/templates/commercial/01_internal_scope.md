# Internal scope — [LANE] engagement

Engagement ref: __________  Date: __________  Operator: __________

## Lane and buyer
- Lane: `msft_csp` / `hospital_mrf` / `agency_rfp` / `accessibility` / `lead_path` (circle one)
- Buyer/partner name: __________
- Buyer role (per lane_meta): __________

## What this engagement produces
- One run of the `urf.cli` pipeline (`init-run → validate-input → execute → qa → render → package → cleanup → verify-package`) against buyer-supplied input, packaged as a checksummed evidence delivery.
- One rendered report using template: `direct_buyer` / `white_label_partner` / `internal_qa` / `technical_appendix` (circle one).

## What this engagement does NOT produce
- No live outreach, submission, filing, or transaction on the buyer's behalf.
- No legal, compliance, or eligibility determination — see `02_exclusions.md` and the lane's own `mandatory_disclaimers`.
- No guarantee of buyer-side outcome (credit issued, bid won, WCAG conformance achieved, leak revenue recovered).

## Internal ownership
- Who runs the CLI: __________
- Who reviews findings/QA before delivery: __________ (must not be the same person per the "author cannot approve its own work" review rule)
- Who signs the delivery acceptance form (`09_acceptance_form.md`) on the buyer side: __________

## Boundaries
This document is internal. It is never delivered to the buyer. Do not
copy buyer-facing claims out of this document without re-checking them
against `claim_safety.rules.scan_text` — this file is not scanned by
the render-stage safety gate the way report text is.
