# Buyer/partner qualification — [LANE]

Answer before quoting an engagement. A "no" on any hard-stop item
means do not proceed with this lane for this buyer.

## Fit questions
- [ ] Does the buyer's actual need match this lane's real scope (see `lane_meta()["scope"]`), not an inflated expectation of what it does?
- [ ] Can the buyer supply the required input files (`03_input_checklist.md`) themselves, or does fulfilling this engagement require the operator to fabricate or infer data the buyer can't supply? (Hard stop if fabrication would be required — this system never fabricates evidence.)
- [ ] Does the buyer understand and accept that no live/production system is touched, and no submission/claim/certification is issued?
- [ ] Is the input the buyer will supply free of credentials, PHI, or live payment data? (If unsure, tell them the system will quarantine such content as `PROHIBITED` rather than deliver it.)

## Hard stops (do not proceed)
- [ ] Buyer wants the system to submit a bid, file a claim, certify compliance, or make any external-facing commitment — explicitly out of scope for every lane.
- [ ] Buyer wants a guaranteed dollar outcome (guaranteed SLA credit, guaranteed win, guaranteed conversion lift) — see `claim_safety.rules` categories this system is built to refuse to assert.
- [ ] Buyer cannot or will not commit a human reviewer to act on `human_review_required` items — delivering a package nobody will review defeats the point of the evidence trail.

## White-label partner specific
- [ ] Does the partner understand the `white_label_partner` template strips UberBond branding but the underlying evidence and disclaimers are unchanged?
- [ ] Has the partner agreed who signs `09_acceptance_form.md` on the end-buyer's behalf?
