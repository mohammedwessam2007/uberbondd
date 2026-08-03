# Dispute-evidence checklist — [LANE]

If a buyer disputes a delivery, pull these in order. Everything here
is real, on-disk output from the run — nothing needs to be
reconstructed from memory.

1. **The delivered zip itself.** Run `python -m urf.cli verify-package --package <zip>`. If it fails, that is dispositive: the file was altered after delivery, and the dispute is about a different artifact than what was shipped.
2. **`run_manifest.json`** — `run_id`, `started_at`/`finished_at`, `software_version`, `git_commit`, `input_hashes` (sha256 of every input file at `init-run` time). Compare `input_hashes` against a fresh hash of the buyer's claimed input to check whether the input actually matches what was analyzed.
3. **`CHECKSUMS.sha256`** inside the package — recompute independently (`sha256sum` on each file) and diff against the recorded values.
4. **`qa_result.json`** — confirm `overall_status: "pass"` and inspect every `check_id`/`status`/`detail` pair relevant to the dispute.
5. **`evidence_index.json`** — for the specific finding under dispute, follow its `evidence_refs` back to the underlying evidence item(s); check `source_path`, `source_hash`, `observed_value`, `limitation`, `prohibited_interpretation`.
6. **`findings.json`** — confirm the disputed finding's `label` (one of the 9 allowed labels) matches how strongly it should have been asserted; a `deterministic calculation` finding is reproducible by re-running the same math, an `assumption` finding is not a fact claim at all.
7. **`human_review_register.json`** — confirm whether the disputed item was already flagged for human review before delivery (if so, the dispute may be about the buyer skipping their own review step, not a system error).
8. **`unknown_register.json`** — confirm whether the disputed gap was already disclosed as an `unknown` rather than silently omitted.

## What NOT to do during a dispute
- Do not hand-edit any file inside a delivered package to "fix" the dispute — that breaks the chain of custody and would fail `verify-package` for the buyer's copy.
- Do not issue a new claim or certification to resolve the dispute; if the resolution requires a claim, that claim must come from a qualified human, off-system, per the lane's `mandatory_disclaimers`.
