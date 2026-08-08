# OMNIA V9 Complexity Audit

Purpose: classify every V9 component by whether *this* integration slice (outbound shadow/compare) actually needs it, so the frozen core doesn't quietly become sacred architecture nobody is allowed to question. Classification is not a value judgment on code quality — a `REQUIRED_LATER` module was adversarially tested and verified in the two closure missions and stays exactly as-is until its "later" arrives.

## Classification legend

- **REQUIRED_NOW** — this integration slice directly calls it.
- **REQUIRED_LATER** — not called by this slice, but needed for a concretely identifiable next step (real Cedar-backed policy, durable authority, canary enforcement), not "might be useful someday."
- **SPECULATIVE** — exists for a capability nobody has committed to building.
- **UNUSED** — not called by anything, including future-identified needs.
- **DELETE_CANDIDATE** — unused and not required by any concrete future step.

## P0–P9 core (frozen; see `OMNIA_V9_FROZEN_BASELINE.md`)

| Module | Classification | Why |
|---|---|---|
| `canonical.mjs` | REQUIRED_NOW | `sha256`/`digestObject` used directly by `outbound-admission.mjs` |
| `schema.mjs` | REQUIRED_NOW | Used transitively by `kernel.mjs`'s `verifyIntent`/`verifyEvidence` |
| `kernel.mjs` | REQUIRED_NOW | `admitAction`, `createActionIntent`, `createEvidenceRecord` are the entire decision engine this integration calls |
| `proof-store.mjs` | REQUIRED_LATER | Durable authority reservation is needed once real owner-issued approvals exist and need persistent, race-safe usage tracking — not needed while every shadow/compare decision is a fresh in-memory `admitAction` call with no persisted authority to reserve |
| `persistent-admission.mjs` | REQUIRED_LATER | Same gate as `proof-store.mjs` — combines intent persistence + reservation into one call; needed for the same later step |
| `constitution.mjs` | REQUIRED_LATER | Needed once a real constitution source-binding is loaded for live outbound decisions, not for a stub `policyAuthorizer` |
| `policy-bundle.mjs` | REQUIRED_LATER | Same gate — needed once a real Cedar policy bundle is wired into the outbound `policyAuthorizer` |
| `cedar-adapter.mjs` | REQUIRED_LATER | Same gate — this integration's default `policyAuthorizer` never calls Cedar; wiring it in is a concrete, identified next step (see `V9_REAL_INTEGRATION_ARCHITECTURE.md`), not speculative |
| `execution-receipt-shadow.mjs` | REQUIRED_LATER | Needed once V9 needs to durably bind a consequence receipt with uniqueness guarantees — not needed for a pure pre-effect observation |
| `execution-receipt-store.mjs` | REQUIRED_LATER | Same gate |
| `authorization-bound-receipt.mjs` | REQUIRED_LATER | Needed once receipts must be bound to the exact authorization that permitted them — a canary/enforcement-stage requirement |
| `authorization-bound-receipt-store.mjs` | REQUIRED_LATER | Same gate |
| `pre-effect-authority-reconciler.mjs` | REQUIRED_LATER | Needed once durable authority exists to reconcile against — retroactive-authority prevention has nothing to check against yet |
| `authority-transition-ledger.mjs` | REQUIRED_LATER | Same gate — append-only provenance for a durable reservation that doesn't exist yet in this integration |
| Migrations 005–008 | REQUIRED_LATER | Schema for the above; not applied to any database this integration writes to (shadow/compare use the existing generic `audit_log` table only) |

**No DELETE_CANDIDATE or UNUSED findings in the frozen core.** Every module not required now maps to a specific, named later step (real Cedar policy, real durable authority) rather than open-ended architectural ambition. This audit found nothing to recommend deleting — stated plainly rather than manufacturing a finding to look thorough.

## Pre-existing integration glue (not frozen, extensible by design)

| Module | Classification | Why |
|---|---|---|
| `outbound-shadow.mjs` | SPECULATIVE (currently) | Pre-existing P0-level shadow evaluator (`evaluateOutboundShadow`) that builds its own intent/evidence directly from prospect/campaign objects. Not called by this integration (which instead derives from the P4 shadow context — a cleaner boundary, see architecture doc). Kept because it's small, already tested, and a plausible alternate entry point; not deleted because "currently unused by this slice" is not the same as "no one might use it," but flagged here rather than pretended-necessary. |
| `final-admission-shadow.mjs` | REQUIRED_NOW | The exact seam this integration extends |

## New integration modules (this mission)

| Module | Classification | Why |
|---|---|---|
| `integrations/config.mjs` | REQUIRED_NOW | Mode resolution |
| `integrations/outbound-admission.mjs` | REQUIRED_NOW | The adapter itself |
| `integrations/compare.mjs` | REQUIRED_NOW | Six-category classification |
| `integrations/metrics.mjs` | REQUIRED_NOW | Confusion matrix / founder-burden aggregation, used by the integration report |
| `integrations/replay-scenarios.mjs`, `integrations/replay.mjs` | REQUIRED_NOW | Offline value-proof, used to generate `V9_REPLAY_REPORT.md` |

## Verdict

Nothing in the frozen core is dead weight relative to the honest trajectory this integration is on (shadow → compare → a real Cedar/durable-authority step → canary). Nothing new was built that isn't directly used by this slice or by producing its required evidence (replay). No V10, no new governance layer, no speculative framework — the one thing flagged as currently-speculative (`outbound-shadow.mjs`) was already small and already tested before this mission, so leaving it as-is costs nothing and forecloses nothing.
