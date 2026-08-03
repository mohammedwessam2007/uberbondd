# Delivery acceptance form — [LANE]

This form mirrors the system's own `delivery_acceptance` record
(`run_id`, `lane`, `buyer_role`, `acceptance_criteria`, `signed`,
`signed_at`, `notes`) produced by `lanes.base.build_delivery_acceptance`.
Fill in and countersign; keep alongside the delivered package.

- Run ID: __________
- Lane: __________
- Buyer role: __________ (per `lane_meta()["buyer_role"]`)
- Package checksum (`CHECKSUMS.sha256` top-level or zip sha256 from `package` stage output): __________
- Delivery date: __________

## Acceptance criteria (check each the buyer confirms)
- [ ] I received the package and independently ran/requested `verify-package` (or was shown its result) with no mismatches.
- [ ] I have read the mandatory disclaimers in the report and understand this delivery does not certify, guarantee, submit, or claim anything on my behalf.
- [ ] I understand any item flagged `human_review_required` requires my own (or my qualified reviewer's) follow-up before I act on it.
- [ ] I understand the input classification (synthetic / customer-provided) that was used for this run.
- [ ] I have no unresolved dispute about the delivery's completeness relative to the agreed scope (`01_internal_scope.md`).

## Sign-off
- Buyer signature: __________ Date: __________
- Operator signature: __________ Date: __________
- Notes (any exceptions, partial acceptance, or follow-up commitments): __________
