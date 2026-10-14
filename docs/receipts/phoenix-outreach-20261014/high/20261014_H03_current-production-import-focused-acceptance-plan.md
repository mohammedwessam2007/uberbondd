# PHOENIX High H03 | exact source import acceptance, no-send test execution

Observed 2026-10-14 ~20:52 UTC. Source parent Claude PR #1405 `f5320d7c83a84e8c5c08c93abe79becef782090b`. This is an independent High branch, no modification to Claude, Work, N08 or production services.

## Current source recovered
- **Canonical production importer**, `src/winnr-production-import.mjs`, is distinct from historical single-domain `src/winnr-runtime-bootstrap.mjs`. The production importer explicitly checks 50 unique exported identities on 10 domains, matching provider inventory, original encryption-key receipt, transaction-bound held-account/lease/rollback, three pilot identities when `expectedPilotMailboxCount:3` is supplied, and pilot unchanged snapshots. It makes no cold-send authority.
- Existing synthetic suites in `tests/winnr-production-import.test.mjs`, `tests/winnr-production-import-hardening.test.mjs`, `tests/uberwinnr-credential-import.test.mjs`, `tests/uberwinnr-fleet-plan.test.mjs` exercise these source contracts. This is **existing functionality**, not a claimed new feature or verified production import.
- Legacy one-domain bootstrap's per-account writes do not substitute for current transaction-backed 50+3 production gate; do not route real import through the legacy bootstrap.

## Actual test action
Added branch-specific GitHub read-only, no-secrets, no-provider Actions workflow `.github/workflows/phoenix-master-h03-import-acceptance.yml` to run the four original suites on EXACT Claude-source ancestry. At this initial receipt checkpoint the run has not executed; later immutable success/failure is to be appended. Do NOT assume tests passed from their existence.

## External blockers
Production current Render PG source Free expires 2026-10-16T23:22:29.055606Z; original production key and source-current backup/restore/app/writer continuity still unproved. Real Winnr 50+3 protected import has NOT occurred, nor can generic source tests grant sender readiness/permission. N13 exact new source, provider approval and protected production state remain independent. SEND_SET=[]; no money/send/deploy/DNS/credentials changes.
