# Kill-condition checklist — [LANE]

Explicit conditions under which the operator must stop and not
deliver. Any single "yes" below is a stop, not a judgment call.

- [ ] `qa` stage returned `overall_status != "pass"` and the failure has not been fixed and re-verified.
- [ ] `verify-package` reports any mismatch, missing file, or uncovered file.
- [ ] `render` was blocked by a claim-safety violation (`claim_safety.rules.scan_text` non-empty) and the underlying report text has not been corrected and re-rendered.
- [ ] Any input file was classified `PROHIBITED` by `data_safety.classify.classify_and_maybe_quarantine` (credential, PHI, or live-payment pattern detected) and the buyer has not supplied a clean replacement.
- [ ] The buyer is asking for an output this lane structurally does not produce — a claim, a certification, a submission, a guaranteed dollar figure — and continuing would require fabricating one.
- [ ] The engagement would require live network access, credential use, or contact with a third party — this system operates fully offline; if the buyer's need requires going live, this product is the wrong tool, not a reason to bypass the offline constraint.
- [ ] A protected repository path (`lite/`, `src/`, `server.mjs`, `worker.mjs`, `migrations/`, `package.json`, production/deployment configuration, database state, outbound systems) would need to change to fulfill the request — stop and get explicit approval before touching any of those; this experiment's own boundary is `experiments/offline-revenue-factory-v1/` only.
- [ ] Input hashes recorded at `init-run` no longer match the files on disk at `package` time (someone edited input mid-run) — restart the run from `init-run` with a fresh hash capture rather than packaging against stale hashes.

If any box is checked: stop, document why in `01_internal_scope.md`'s
notes, and do not run `package`/deliver until resolved.
