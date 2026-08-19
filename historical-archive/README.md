# Historical Archive — NOT part of the canonical codebase

Two archives, both supplied directly by the owner on 2026-08-19 after this
session's GitHub-side search for the historical Instantly-parity work found
nothing (neither was ever pushed to any branch):

| File | sha256 | Files | Role |
|---|---|---|---|
| `UBERBOND_LEAD_INTELLIGENCE_OUTREACH_COMPLETE_20260813.zip` | `6dee168b8094327e41568909678680975092339f4462c5f2f798044fdcd7f605` | 380 | **Canonical historical source** — the fuller, later snapshot |
| `UBERBOND_OUTREACH_INSTANTLY_PARITY_COMPLETE_20260813_FINAL.zip` | `7ef3c7f0eb73d6134e42789e236d4c7acf8f61e7e35ea50e84db6041215d91d2` | 357 | Direct ancestor snapshot — verified (file-by-file diff) to be a strict, non-regressive subset of the first. Kept for provenance; the recovery plan targets the first archive only. |

Both verified real: valid zips, syntax-clean, and the fuller archive's own
bundled test suite passes in isolation (495/536, 0 failures, 41 skipped —
Postgres-live tests). Full account, provenance, the diff proving the
ancestor relationship, and the not-yet-executed recovery/reconciliation
plan: `docs/INSTANTLY_RECONCILIATION.md`.

**This directory holds both archives for provenance and durability only.**
None of their contents are merged into `src/`, `tests/`, `docs/`, or any
other canonical location yet. Do not import from here directly — follow the
recovery plan in `docs/INSTANTLY_RECONCILIATION.md`, which requires
comparing each overlapping module against what this branch has built since
(the Prometheus economic spine, the domain/mailbox readiness OS) before
choosing a canonical implementation.

To inspect either: `unzip -l historical-archive/<filename>`
