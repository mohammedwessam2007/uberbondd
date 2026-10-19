# PHOENIX full Deep Atlas → Ultimate Graph local execution proof

Date: 2026-10-18 (19:56 UTC). Evidence class: **local executed source build, not cloud deployment or revenue**.

## Input identity and runtime
- Candidate integrated source: `fix/phoenix-atlas-unified-20261018`, then ancestry-preserving, conflict-free merge of main `340d4b8ad5a79f48c3880069710a8d9bf58bcc94`. The final head SHA will be recorded separately after exact-main publish.
- Isolation: `/workspaces/uberbondd/.phoenix-atlas-final-20261018`. Root UberWarm working files and other workers' worktrees were not overwritten.
- Node.js runtime with `NODE_OPTIONS=--max-old-space-size=4096`, bounded shell `timeout`, no provider model calls, no external candidate installation.

## Independently run pipeline
1. `node scripts/uberbond-feature-genome.mjs`: exit 0.
2. `node scripts/uberbond-feature-atom-atlas.mjs`: exit 0.
3. `node scripts/uberbond-synaptic-map.mjs`: exit 0.
4. `node scripts/uberbond-repository-deep-atlas.mjs`: exit 0; `ok=true`; source repository artifacts **4,696**; indexed deep features **267,828**; structurally capped files **189**, each with full text-chunk/digest coverage; `truncatedFiles=0`. Complete output size **129,827,081 bytes**. Structural cap is a deliberate resource bound, not every key of every source file indexed as a distinct graph node.
5. Initial `timeout 210 node scripts/uberbond-ultimate-graph.mjs`: exit **124** while persisting a very large pretty-printed JSON graph. No source failure was hidden or marked as pass.
6. After adding opt-in *compact bounded-memory JSON output* to the shared redacting writer, `timeout 480 node scripts/uberbond-ultimate-graph.mjs`: **exit 0**; status `ULTIMATE_GRAPH_COMPLETE`. Graph count: **279,595 nodes, 1,148,729 edges**, **0 orphan nodes, 0 missing artifacts, 0 missing feature atoms and 0 missing deep features**. Source identity digest `2edefaac9051b3ab2318358fa3ad62660dd84624bec028e054d8663f7da49d51`. Complete compact graph file size **367,647,279 bytes**; local artifact SHA-256 `5750a312a4faa44a59ac0b9d5060dc4d39f852e940debd5bbe28f9a338bc87e7`.
7. The focused tests before compact mode: **26/26** pass, canon freshness **6/6** pass after canonical regeneration. With compact mode: shared-writer regression suite **9/9** pass and graph/atlas regression suite **23/23** pass. Compact vs pretty output tested for structural equivalence of source-backed graph rows.

## Truth boundary and release gates
- The output remains the *full structural graph represented by the bounded indexing policy*, without dropping a node or graph edge after selection. This is not proof that all source code behaves as declared, or that external donor suppliers are usable.
- String leaves retain secret redaction, custom `toJSON` and property getters are rejected, and atomic write semantics prevent a failed output from replacing the prior good artifact.
- Large generated artifacts are intentionally **not committed** to GitHub. GitHub stores code, tests, source metadata and this cryptographic receipt, not the bulky local graph blob.
- **Hosted Vercel build is NOT yet verified.** Its last observed `Invalid string length` stage occurred reading the old oversized graph dependency. The local successful run has different filesystem and available memory. Recheck independent Vercel preview on the final source head. No main merge if real source CI or required deployment acceptance fails.
- The previously merged PHOENIX 1,560 source proposals and 240 untrusted public research identities are not 1,560/240 approved installed or production-active capabilities.
