# Delivery checklist — [LANE]

Complete every item before sending a package to the buyer. This
mirrors the real CLI stage order; do not skip a stage to save time.

- [ ] `init-run` completed; `run_manifest.json` exists with a real `started_at`.
- [ ] `validate-input` completed; any critical issues reviewed by a human — a critical input issue does not by itself block delivery, but the buyer must be told about it in the report's limitations section.
- [ ] `execute` completed; findings/evidence/unknowns/human_review_requests all written to disk.
- [ ] `qa` completed with `overall_status == "pass"`. If it failed, delivery does not proceed until fixed — do not hand-edit qa_result.json to force a pass.
- [ ] `render` completed for the agreed template (`direct_buyer` / `white_label_partner` / `internal_qa` / `technical_appendix`); claim-safety scan (`claim_safety.rules.scan_text`) passed with no blocked render.
- [ ] `package` completed; `CHECKSUMS.sha256` present and covers every file in the package directory.
- [ ] `verify-package` run against the produced zip and returned OK with zero mismatches.
- [ ] `cleanup` run; only `tmp/` removed, evidence/reports/logs retained.
- [ ] Every mandatory disclaimer for this lane appears in the rendered report (cross-check against the lane's `MANDATORY_DISCLAIMERS`/`mandatory_disclaimers`).
- [ ] At least one blocking human_review_request (for `msft_csp`/`agency_rfp`/`accessibility`/`lead_path`) or an explicit human-review flag on every flagged finding (for `hospital_mrf`) is present and legible in the delivered package — the buyer must see what still needs a human.
- [ ] Buyer-facing report contains no unsupported dollar/percentage claim without an `[ev-...]`/`[fnd-...]` marker.
- [ ] `09_acceptance_form.md` attached, unsigned, ready for buyer countersignature.
- [ ] Package handed over via the agreed channel — this system has no outbound delivery mechanism of its own (`OUTBOUND_ENABLED=false`); a human sends the file.
