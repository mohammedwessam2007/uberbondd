# PHOENIX Atlas / Ultimate Graph unified persistence receipt

Date: 2026-10-18. Truth class: LOCAL SOURCE TEST; no hosted deployment, supplier promotion or customer effect.

The earlier Atlas repair used two different JSON persistence writers: Deep Atlas called `writeRedactedAtlasJSON`, while Ultimate Graph called `persistRedactedAtlasJson`. This created a security/maintenance discrepancy: the latter accessed object getters during serialization, whereas the former rejected them. Both paths now use the same atomic bounded-memory redacting writer. The legacy export remains for compatibility but rejects getters and custom `toJSON` accessors without running them.

The shared writer additionally redacts cookie/session header keys, uses a unique per-write temporary file, and reads descriptor values rather than invoking accessors. Neither code path executes third-party source or makes provider calls.

Local acceptance at the source edit: `node --test tests/uberbond-atlas-stream-writer.test.mjs tests/uberbond-repository-deep-atlas-persistence.test.mjs tests/uberbond-repository-deep-atlas-streaming-digest.test.mjs tests/uberbond-repository-deep-atlas.test.mjs tests/uberbond-ultimate-graph.test.mjs` returned **22 tests passed, zero failed**. The new tests explicitly assert cookie/session redaction and zero execution of `toJSON` and ordinary getters. The original full Atlas-to-Graph scale proof remains in `PHOENIX_ATLAS_SOURCE_REPAIR_20261018.md` and must not be confused with a hosted exact-head run of this edit.

The research inventory remains 1,304 original Waves 3/5/6/7/8/9/10 proposals plus 256 recovered Wave 4 proposals = 1,560 **research designs**, not installed capabilities. The 243 public GitHub URLs normalize to 240 **untrusted candidate identities**, not licensed or promoted suppliers.

Merge gate: require a committed exact head, canonical readiness, GitHub CI, independently inspected Vercel status, and an actual runtime build. A Vercel rate-limit failure is infrastructure, not a source-test pass. No outreach, spending, donor code execution, credential changes or deployments authorized by this receipt.
