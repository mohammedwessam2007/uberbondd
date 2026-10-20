# PHOENIX prevention guard for the October 20 Neon no-entrypoint incident

**Scope:** Source-only, read-only local deployment-bundle inspection. No customer effect, no deployment, credentials, database mutations, or new spending.

A concurrent Neon `uberwarminbound` deployment at 2026-10-20 10:59:52 UTC failed with a bundle without root `index.js`/`index.mjs`; external production returned HTTP502 `function_load_failed`. Another executor restored exact known-good ZIP as deployment #5, with new HTTP200 and fail-closed `outboundAuthority:NONE`, independently documented in issue #1188. Source `services/uberwarm-canonical-neon-function/index.cjs` is a donor file, NOT directly a valid Neon ZIP root entrypoint; repackage it to root `index.js` and verify dependency bundling before deployment. NEVER redeploy the prior failed ZIP.

## Bounded guard and actual local evidence

Implemented pure-first-party `src/phoenix-neon-zip-preflight.mjs`, CLI `scripts/phoenix-neon-bundle-preflight.mjs`, tests and project CoS skill. The guard parses ZIP central and local records, verifies entry names, CRC and decompression size, refuses traversal/symlink/encryption/duplicates/unsafe filenames or missing/ambiguous root entrypoint, and optionally compares an independently supplied SHA256. It has no deploy or send function.

Test inputs checked through the connected CoS Codespace:
- `/tmp/ubw-neon-replystop-20261020.zip`: 38,639-byte restored bundle. SHA256 `30df92fd335a3e5c2befdb5b468ef229a908efce2dc1a76c13ace8b3` and root `index.js` statically PASS with pinned SHA match.
- `/tmp/uberwarm_neon_receiver_candidate_20261020.zip`: static FAIL `NEON_ROOT_ENTRYPOINT_REQUIRED`; this was a separately saved candidate, not proof of byte identity to the deployed failed #4 ZIP.
- Self-contained stored/deflated ZIP adversarial tests cover malformed central directory, data corruption, wrong digest, missing/nested/both roots, duplicate entrypoints, traversal, protected-looking names, symlink, expansion budget and actual CLI fail-closed behavior.

Limitations: Static archive validation cannot establish Node import execution, runtime semantics, real sender delivery, external credentials, database alias consistency, current cloud health, compliance or clearance to send. The authoritative runtime's latest deployment must be independently read before and after any change. Existing known-good #5 remains in place; no redeploy in this work.
