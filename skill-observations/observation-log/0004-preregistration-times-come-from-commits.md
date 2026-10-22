---
id: 4
title: Pre-registration timestamps must be the push commit's time, never typed
status: open
type: methodology-gap
skill: [uberbond-orchestrator, wallbreaker]
proposes_skill: []
siblings_checked: [task-observer]
area: verification
date: 2026-10-22
session_context: Machiavelli money hunt on claude/machiavelli-money-hunt-20261022
parked_until: null
resolved: null
resolution: null
reference: commit 020b457 (timestampCorrection in artifacts/machiavelli/absolute-money-hunt/preregistration-2026-10-22.json)
---

**Issue**: Four `registeredAt` / `recordedAt` fields in a pre-registration file were typed as estimates (22:35Z, 23:20Z, 23:55Z, 00:40Z). The real push times were 22:21–22:42Z; two typed values were later than the runs they claimed to precede. The ordering evidence was intact only because each registration had been pushed as its own commit before its run.

**Suggested improvement**: Leave the timestamp out of the file, or fill it after committing with `git log -1 --format=%cd --date=format-local:%Y-%m-%dT%H:%M:%SZ` (TZ=UTC). Cite the commit hash beside it. Push each registration or amendment before the run it governs.

**Principle**: In a pre-registration the commit is the timestamp; a hand-typed time is a claim, not evidence.
