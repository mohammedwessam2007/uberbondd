# N24 independent review-only canon regeneration plan
Date 2026-10-14 UTC.
- Source at branch creation: Claude draft PR #1405 `f5320d7c83a84e8c5c08c93abe79becef782090b`. Claude's working branch NOT modified.
- Exact live hosted CI `38615465807` core deterministic log: `# tests 11059`, `# pass 10994`, `# fail 1`, `# skipped 64`, only failure `tests/canon-freshness.test.mjs` stale docs/CURRENT_SYSTEM_STATE.md and artifacts/system-readiness.json describe `aeba82fc17c6`, while 14 source files changed.
- Night Verification core identical one failure; PG and Browser green, Night Postal and UberOutbound green on this SHA.
- Purpose: use only project's `npm run readiness` canonical generator, never hand-edit, on an isolated branch. Generated artifacts must reference exact source commit, be committed in a separate later commit, preserve ancestry.
- Workflow never accesses provider keys, original database, or sends messages; it grants GitHub token isolated branch write for exactly named generated artifacts, denies other diffs; no main merge/deploy.
- HEAD action outcome not yet known at creation. The workflow's push to the isolated branch must be verified by fresh GitHub read; then exact resulting CI/PR proof. A failed workflow does not mean canon fixed. Do not force merge or overwrite Claude.
