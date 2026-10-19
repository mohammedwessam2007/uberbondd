# PHOENIX mutation sandbox ENOTEMPTY race, October 19, 2026

**Source verification, not production deployment proof.**

## Observed live failure
- Exact PR #1469 head `b550be18ca612ab374ce3a5cf0c5e3ea8be106a2` passed CI, Night Postal Focused Verification and UberOutbound Exact Head.
- `Night Verification War` run `39271817936`, core job `118125795713`, failed on GitHub Actions Node 22.23.3 at 2026-10-19T14:56:49Z after launching `npm run test:mutation-war`: `ENOTEMPTY: directory not empty, rmdir '/tmp/uberbond-mutation-XKne3V/.git/objects'`.
- The existing `rmSync` included ten internal retries but still failed on the nested Git objects tree while test subprocesses/maintenance could be settling. No `KILLED` mutation summary was produced on that hosted run. This failure does not establish a surviving safety guard.
- Earlier exact source had both Vercel preview deployments **QUEUED** at this investigation point; older `10719b00...` previews were READY but do not verify the latest source commit.

## Repair
- `cleanupMutationSandbox`: async `fs.promises.rm` that re-enumerates the *whole temporary tree* if a nested `ENOTEMPTY`, `EBUSY` or `EPERM` persists. At most 20 attempts with bounded spacing; unexpected errors and exhausted retries are rethrown (release fails closed).
- Disposable test Git repos explicitly disable `gc.auto` and `maintenance.auto`. This prevents background object maintenance from racing cleanup. No operator repository setting, policy gate, source truth or mutation verdict classifier is modified.
- Mutants still require actual real test failure. Cleanup retries never substitute a `KILLED` verdict.

## Executed local proof on isolated clean fork of b550be18
- 3 cleanup-specific tests passed: transitory ENOTEMPTY succeeds after retries and real directory is gone; nonretryable EACCES throws; persistent ENOTEMPTY exhausts and throws.
- 12 independently executed hostile mutations passed: BROWSER-02, CANON-04, REACH-02 and EVID-02, each 3 separate runs and each `KILLED`.
- 62 relevant repository tests passed, including canon freshness, reachability, mutation verdict integrity, mutation fixture isolation, journal integrity, and hostile browser/canon tests.
- Complete 603-slot mutation inventory was reread using exact-registry-fingerprint replay from the earlier GitHub-backed PHOENIX mutation journal. Exit 0; 602 historical `KILLED` verdicts replayed, one `SKIPPED_NEEDS_BROWSER` (CRAWL-01), zero not killed. This **is not** a fresh uncached execution of 602 mutants on the new patch. The 12 uncached hostile mutations above are separately verified.
- Published branch/merge SHA, exact-head hosted CI, both Vercel previews and main/runtime result must be recorded after release gates finish.

## Authority and preservation
No customer sends, paid provider use, credential changes, quota evasion, forced cancellation, runtime deployment, or other worker worktree edits. Main merge only after exact-source GitHub tests and two hosted preview builds are independently READY. Prior PHOENIX backup branches, 890 founder ideas and 1,560 research proposals remain preserved; the 367,647,279-byte graph binary stays in the Codespace unless independently backed up.
