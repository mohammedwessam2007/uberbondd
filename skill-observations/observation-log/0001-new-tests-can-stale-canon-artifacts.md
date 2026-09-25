---
id: 1
title: Adding a test file can make committed canon artifacts stale
status: open
type: methodology-gap
skill: [uberbond-orchestrator]
proposes_skill: []
siblings_checked: [task-observer, wallbreaker, uberbond-capability-assimilator]
area: verification
date: 2026-09-25
session_context: Night War outreach session on claude/uberbond-night-war-launch-glgsqc
parked_until: null
resolved: null
resolution: null
reference: commits 41f57ce, ee6f769, ae65af9, 9eb57ce on claude/uberbond-night-war-launch-glgsqc
---

**Issue**: Twice in one session a correct change turned the canon-freshness and constitution-freshness gates red. `docs/CURRENT_SYSTEM_STATE.md` and `artifacts/system-readiness.json` go stale whenever any source file changes after the last `npm run readiness`. `artifacts/constitution/directives.json` also cites the first matching enforcing test file, so adding a test that sorts earlier (here `tests/consent-bridge.test.mjs`) changes the compiled document even when no directive changed. Both were only discovered by the full deterministic suite, after the source commits.

**Suggested improvement**: In the engineering closure checklist, after the last source commit of a batch run `npm run readiness` and `npm run constitution:doctor`, verify the 33 readiness capability entries are unchanged, commit the regenerated files in their own commit, and only then run the full suite. Do not regenerate the constitution when the only diff is provenance SHAs; the freshness test ignores provenance.

**Principle**: Generated canon that describes the tree has to be regenerated as the final step of any source change, including test-only changes, and committed separately so reviewers can see it is mechanical.
