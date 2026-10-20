---
name: phoenix-neon-bundle-preflight
description: Through Chat On Steroids Core, inspect a local Neon Node.js 24 function ZIP before any deployment for a root entrypoint, archive integrity and pinned bytes; refuse known bad/no-entrypoint bundles without cloud effects.
---

# PHOENIX Neon ZIP deployment preflight

Use the existing approved Codespace, not a new subscription. Before submitting any ZIP to `uberwarminbound` or a future Neon Node 24 function, require a local, exact-byte structural preflight:

```sh
node scripts/phoenix-neon-bundle-preflight.mjs /path/to/candidate.zip <independently-sourced-64-character-sha256>
```

Never derive the **expected** digest solely from the candidate being inspected and call that independent provenance. Without a supplied digest, the tool checks structure but returns `pinnedSha256Matched:false`. It refuses absent/nested/ambiguous entrypoints, invalid ZIP records or CRCs, path traversal, unsafe filenames, encrypted/unsupported entries, symlinks, duplicate paths, decompression bombs and hash mismatch.

Known October 20 smoke fixtures, kept outside Git:
- Good rollback artifact (active deployment #5) `/tmp/ubw-neon-replystop-20261020.zip` SHA256 `30df92fd335a3e5c2befdb5b468ef229a908efce2dc1a76c13ace8b3` passes static preflight.
- Prior candidate `/tmp/uberwarm_neon_receiver_candidate_20261020.zip` fails `NEON_ROOT_ENTRYPOINT_REQUIRED` and must not be deployed unchanged. Actual failed provider deploy #4 had the same missing-root-entrypoint failure; this is not a claim that the local candidate and deploy #4 have identical bytes.

Run `node --test tests/phoenix-neon-zip-preflight.test.mjs` for adversarial fixture tests. Source pass is **not** executable/runtime verification, cloud production, secret absence, provider sender health, authority to change a deployed function, or email authorization. After an independently approved deployment, separately verify exact function deployment ID, provider webhook destination, live HTTP, db/readback, failure/HOLD path and all mail gates. Never redeploy over another active swarm owner's function without coordinated authority.
