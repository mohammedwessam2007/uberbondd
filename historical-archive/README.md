# Historical Archive — NOT part of the canonical codebase

`UBERBOND_LEAD_INTELLIGENCE_OUTREACH_COMPLETE_20260813.zip`
(sha256 `6dee168b8094327e41568909678680975092339f4462c5f2f798044fdcd7f605`)

Supplied directly by the owner on 2026-08-19 after this session's GitHub-side
search for the historical Instantly-parity work found nothing (it was never
pushed to any branch). Verified real: valid zip, syntax-clean, and its own
bundled test suite passes in isolation (495/536, 0 failures, 41 skipped —
Postgres-live tests). Full account, provenance, and the not-yet-executed
recovery/reconciliation plan: `docs/INSTANTLY_RECONCILIATION.md`.

**This directory holds the archive for provenance and durability only.**
None of its contents are merged into `src/`, `tests/`, `docs/`, or any other
canonical location yet. Do not import from here directly — follow the
recovery plan in `docs/INSTANTLY_RECONCILIATION.md`, which requires
comparing each overlapping module against what this branch has built since
(the Prometheus economic spine, the domain/mailbox readiness OS) before
choosing a canonical implementation.

To inspect it: `unzip -l historical-archive/UBERBOND_LEAD_INTELLIGENCE_OUTREACH_COMPLETE_20260813.zip`
