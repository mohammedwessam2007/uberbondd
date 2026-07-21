# P2.2 ARCHITECTURE MAP (as found on rejected PR #4 head `41bd12e...`)

This is the real file map, superseding the "likely paths" guesses in the reference docs.
P2.2 does not exist on current HEAD or on the accepted base — it must be reconstructed.

| Symbol / concern | File (rejected branch) | Status |
|---|---|---|
| `runAutonomyCycle()`, `withStageTimeout()` | `src/autonomy-cycle.mjs` | new, not yet reviewed line-by-line |
| `createGmailInboundReader()`, `inboundGet()` | `src/gmail-inbound.mjs` | new, not yet reviewed |
| reply classification / suppression | `src/inbound-classify.mjs` | new, not yet reviewed |
| `autonomyCycleRuns` store routing | `src/store.mjs` (modified) | new, not yet reviewed — this is where the P0-06 generic-mutation-bypass check must happen |
| inbound gates / config | `src/config.mjs` (modified) | not yet reviewed |
| migration | `migrations/005_autonomy_cycle.sql` | not yet reviewed |
| manual entry point | `scripts/run-autonomy-cycle.mjs` | not yet reviewed |
| crash-test harness | `scripts/p2-2-crash-worker.mjs` | not yet reviewed |
| tests | `tests/autonomy-cycle.test.mjs`, `tests/autonomy-cycle-store.test.mjs`, `tests/inbound-classify.test.mjs`, `tests/p2-2-capabilities.test.mjs`, `tests/p2-2-postgres-race.test.mjs`, `tests/postgres-schema.test.mjs` (modified) | not yet reviewed |

Next step: `git show 41bd12e:<file>` each of these read-only, and diff each against the
patch-guide's expected shape, before writing any code on the new repair branch.

Existing (pre-P2.2, on accepted base) utilities to reuse rather than duplicate — to confirm
by reading `src/security.mjs`, `src/send-safety.mjs`, `src/payments.mjs`, `src/revenue.mjs`
on the accepted base in the next session/phase (not yet done).
