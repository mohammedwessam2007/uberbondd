# PHOENIX mutation-war hosted-build repair, 2026-10-19

**Classification:** source fix and local real mutation execution. Hosted Vercel deployment and PR merge must be checked separately; neither is implied by this file.

## Observed defect

On exact PR #1469 head `998e88c1ab3e7674f4ff8eaaaa31f8a1c70c371e`, GitHub's four verification workflows passed, while the `uberbondd` Vercel deployment `dpl_CFEhFELwk1aYTCEJK4TcVu7oscLd` failed at `node scripts/mutation-war.mjs` after the now-fixed large Deep Atlas/Graph build. Logs showed `SUITE_DID_NOT_RUN` for FREE-01..07, NORM-01..08, GENOME-04 and REACH-01..02. The other project's preview `dpl_3byGUDPe6weQj6hrStoynH4vAhej` reached READY. Code passing locally did **not** make the primary hosted build ready.

## Cause and remedy

Mutation sandbox historically copied code/config/policy/tests but not the source-pinned, small fixture families imported by those particular tests. On the isolated mutant tree, module load produced ENOENT. The mutation classifier correctly refused to count ENOENT as evidence that a guard was killed. The patch now copies `docs/CURRENT_SYSTEM_STATE.md`, `artifacts/system-readiness.json`, `artifacts/capability-genome/`, `artifacts/outreach/`, and `artifacts/event-horizon/` into each disposable sandbox. **No symlinks** to editable operator fixtures, no skipped test, no changes to classification semantics, no production/provider effects. It also updates the REACH-02 anchor to preserve a real falsification target after the reachability ratchet's hostile-probe test was hardened.

## Local evidence

A true mutation was executed for each of the **18 exact failing IDs** named in Vercel logs. Each reported `KILLED`, not `SUITE_DID_NOT_RUN`, with process exit 0. Framework, fixture, anchor, journal, reachability regressions: **39/39 passed**. The independent `mutation-sandbox-fixtures.test.mjs` confirms paths are bounded and copied to a separate real directory rather than linked to the source. No one substituted a mock killed count for actual tests.

## Remaining release gates

Re-run all exact-head GitHub checks and both Vercel previews. Do not merge failing source or report “complete” while the primary Vercel deployment is ERROR. Full mutation-war census may expose additional missing fixture families. Preserve prior full graph artifact, 1,560 Wave 3–10 proposals, 240 untrusted repository identities, 890 founder ideas and original history. A cold Codespace wake does not guarantee 24/7 uptime. Claude Code and Codex installation is separate from authenticated native worker execution.
