# PHOENIX H | N08 N24 | hosted exact-SHA proof and full-CI falsification
**Observed:** 2026-10-14 15:49 UTC. **Main:** `298bd585d3ba0cf1fe5cdc2f81a525eb67819608`. **Independent PR:** #1408 (DRAFT). **Claude PR:** #1405 (DRAFT).

## WE HAVE DONE
N08 source repaired on an isolated branch; original global type-first oldest 1000/5000 truncated audit histories are no longer used in either sender or domain registry, single or list. Complete typed history is checked against pre/post counts and refused if malformed, raced, >100000 rows or truncated. No send was attempted.
**HOSTED FOCUSED EXACT SHA:** `d13974241fccc82fdfbde8bfe0e7f69a2ebad438`, run [38592467699](https://github.com/mohammedwessam2007/uberbondd/actions/runs/38592467699), job `115950615565`, SUCCESS. 4/4 pass, 0 fail, 0 skip, with 6100 events per type in JsonStore and real disposable PostgreSQL 16. Both registry list/single methods retained late PAUSED. Negative cases include incomplete/racing/invalid counts, malformed rows and same-timestamp conservative ordering. Workflow uses no secrets, providers or SMTP.
Preceding 3/3 JsonStore/no-PG focused SUCCESS on `f2ac0dd8967125dfd110de6b572ba70fa63e433e`, run 38592136193; this is superseded by the 4/4 exact-SHA proof above.

## N24 independent failure attribution
Full PR #1408 CI run [38591555943](https://github.com/mohammedwessam2007/uberbondd/actions/runs/38591555943) on prior head `644347327feeb9606182d4e979392f67f6713d33` FAILED. Night Verification `38591555876`, Postal `38591555942`, outbound `38591555727` also failed. The CI syntax log identifies `tests/infinite-opus-haiku55-live-canary.test.mjs:37` malformed setter on **base main** blob `c395db4e5540c67498695fb61030262153d33807`. Independently inspected Claude #1405 blob `ba64cbb449dddadbfbe5f646101ea6c011c135a1` containing corrected setter. This **is not** a regression caused by N08; do not claim full green or merge. Browser job timed out on public form checkbox; real PG job failed initializing an embedded database user; neither means N08 focused DB test failed.

## WHAT IS LEFT
N08: final code ownership coordination, performance/100k threshold improvement through indexed identity query, assess cross-agent merge, full hosted CI and final release; no production assertion. N24: reconcile corrected Claude file and others against latest main, rerun full CI and true merged commit. N10/N22 send-time hold and TOCTOU remain separate from history reader. Other N-gates not closed by this receipt.

**SAFETY:** No sender activation, send, DNS, billing, deployment, production DB, main merge or live provider effect. Sender HOLD.
