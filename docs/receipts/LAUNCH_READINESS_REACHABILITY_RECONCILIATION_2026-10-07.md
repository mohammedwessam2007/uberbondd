# Launch-readiness reachability reconciliation — 2026-10-07

Status: `CLASSIFICATION_REPAIRED__ACTIVATION_UNCHANGED`

## Why this exists

The exact-head Vercel preview for PR #1251 reached current-truth regeneration and refused because 14 preserved source modules were absent from `config/reachability-classification.json`.

The refusal was correct. The repair does not make those modules reachable. It records why they are currently dormant and what evidence would be required before any future activation.

## Reused lineage

The classification semantics were recovered from unmerged PR #1209 and reconciled into the current classifier rather than replacing the current file with its older branch version.

The 14 modules are:

- `src/crown-capitalization-audit.mjs`
- `src/crown-output-surgery.mjs`
- `src/crown-succession.mjs`
- `src/frontier-counterfactual-compiler.mjs`
- `src/ghost-agent.mjs`
- `src/infinite-opus-model-understanding.mjs`
- `src/interpretation-closure.mjs`
- `src/living-evidence-graph.mjs`
- `src/proof-carrying-renderer.mjs`
- `src/recurrence-map.mjs`
- `src/semantic-isa-v2.mjs`
- `src/semantic-reuse-foundry.mjs`
- `src/unified-cognition-ledger.mjs`
- `src/verifier-trust.mjs`

## Current dispositions

Twelve semantic-closure modules are `AWAITING_ACTIVATION` behind `NO_INFINITE_OPUS_SEMANTIC_CLOSURE_HOST`.

`src/ghost-agent.mjs` is `AWAITING_ACTIVATION` behind `NO_GHOST_AGENT_EVENT_HOST`.

`src/unified-cognition-ledger.mjs` is `AWAITING_ACTIVATION` behind `NO_UNIFIED_COGNITION_LEDGER_BRIDGE`.

The authoritative live provider-spend lifecycle remains `src/cognition-ledger.mjs`; the unified ledger is not allowed to become a second money truth.

## Safety boundary

This reconciliation:

- performs no provider call;
- grants no Crown or semantic authority;
- grants no message/send authority;
- grants no payment or spend authority;
- grants no deployment authority;
- performs no customer effect;
- changes no credentials or DNS;
- does not assert that any dormant module is production-reachable.

A green reachability ratchet means only that every currently unreachable source module has an explicit truth classification. It does not prove runtime activation, market demand, a customer, cleared payment, or accepted delivery.

## Exact preview evidence

The PR #1251 lite preview cloned exact head `b4ac4202b69e5dbfecdbdec7b7057683c8f5908a` and refused current-truth regeneration with:

- `reachability-must-be-fully-classified`
- `reachability-unclassified-list-must-be-empty`

The unclassified list was exactly the 14 modules above. At that preview, stale classifications and founder violations were both empty, finite open requirements were zero, and business-effect authority remained `NONE`.

The classifier repair landed on the same PR branch in commit `621b9c9285f87f572c46603694c79bf0baa2cf22`.
