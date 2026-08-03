# Commercial templates (mission Phase 9)

Thirteen operator-facing templates, one per commercial concern, each
written to apply across all five lanes (`msft_csp`, `hospital_mrf`,
`agency_rfp`, `accessibility`, `lead_path`) via a `[LANE]` fill-in
rather than duplicated five times per template. Every template that
references lane scope/exclusions/disclaimers quotes the real
`lane_meta()` output from the corresponding `src/urf/lanes/*.py`
module (see each lane's `qa_checks`/`lane_meta` for the authoritative
source text) — nothing here invents lane behavior the code does not
implement.

These are human-facing commercial paperwork, not system output: they
are filled in by a human operator around a generated evidence package,
never generated or auto-filled by the CLI itself. No template implies
outbound contact, payment collection, or a live transaction — this
system's own `OUTBOUND_ENABLED=false` constraint applies to the whole
repository this experiment lives in.

| # | Template | Purpose |
|---|----------|---------|
| 1 | `01_internal_scope.md` | What this engagement covers, internally, before any buyer-facing document is drafted. |
| 2 | `02_exclusions.md` | What is explicitly out of scope, restated per-lane from `lane_meta()["exclusions"]`. |
| 3 | `03_input_checklist.md` | What the buyer/partner must supply before a run can start. |
| 4 | `04_delivery_checklist.md` | What must be true before a package is handed to the buyer. |
| 5 | `05_qa_checklist.md` | Operator-facing mirror of the automated `qa_checks()` gate, plus manual checks the system cannot run. |
| 6 | `06_revision_boundary.md` | What counts as a revision vs. a new paid engagement. |
| 7 | `07_refund_risk_register.md` | Known reasons a buyer might dispute value, and how each is mitigated by the evidence trail. |
| 8 | `08_dispute_evidence_checklist.md` | What to pull from the package (checksums, manifest, chain of custody) if a dispute occurs. |
| 9 | `09_acceptance_form.md` | Buyer sign-off form referencing the `delivery_acceptance` record. |
| 10 | `10_buyer_partner_qualification.md` | Pre-engagement fit checklist — is this lane the right fit for this buyer/partner. |
| 11 | `11_pricing_hypothesis_worksheet.md` | Human worksheet wrapping `economics/pricing.py`'s modeled scenarios. |
| 12 | `12_recurring_expansion_map.md` | How a one-off delivery could become a recurring or multi-lane engagement, if the buyer wants that. |
| 13 | `13_kill_condition_checklist.md` | Explicit conditions under which the operator should stop and not deliver. |
