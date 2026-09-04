# Frontier Fabric current P0 blockers

State: DRAFT/BRANCH on PR #388. This file is temporary branch coordination evidence and must be removed or folded into canonical memory before merge.

## P0-1 Exact revision benchmark binding

The inherited `agent-model-router` benchmark candidate identity is provider + model. Frontier profiles add an exact `revision`, so the frontier compiler must not allow a benchmark for revision A to score revision B of the same provider/model name.

Required repair:
- frontier benchmark evidence must carry an exact revision identity;
- lookup/ranking must key provider + model + revision;
- missing/mismatched revision evidence is not frontier-quality evidence;
- `tests/frontier-cognitive-fabric-revision.test.mjs` must pass for the intended reason.

## P0-2 Canonical router identity boundary

The inherited canonical router accepts model identity up to 120 characters while the frontier profile currently admits a wider model string. The frontier profile must fail closed at the canonical router boundary instead of admitting an identity that later becomes unroutable.

Required repair:
- align frontier canonical model identity with router constraints or intentionally extend the canonical router with tests;
- `tests/frontier-cognitive-fabric-router-contract.test.mjs` must pass for the intended reason.

## P0-3 Planned reasoning is not executed reasoning

`FRONTIER_MAX` currently carries an evidence-backed `reasoningSettingRef`, but the existing executor factory does not consume that binding. Direct OpenAI has a constructor-level reasoning effort; Anthropic has no frontier reasoning bridge here; the current AI Gateway adapter does not send a reasoning setting. A plan must never claim max reasoning unless the exact transport request applies the intended setting and the execution receipt can attest it.

Required repair:
- add a fail-closed transport reasoning translator;
- bind only officially evidenced mappings;
- AI Gateway may use its documented provider-agnostic reasoning level where supported;
- unsupported mappings block rather than silently fall back;
- execution receipt must bind the actually applied setting to the planned setting.

## P0-4 Provider/model/revision runtime identity

Current direct OpenAI/Anthropic executors return a model string but do not fail on a provider-returned model mismatch and do not return exact revision evidence. The frontier runtime must compare observed identity against the planned canonical identity/aliases and cannot synthesize revision truth from config.

Required repair:
- normalize real executor outputs into an identity-bound frontier execution observation;
- provider-returned model mismatch blocks;
- revision is OBSERVED only when the transport/provider exposes authoritative revision evidence; otherwise the profile cannot claim an observed revision unless a separately bound runtime probe proves it;
- never relabel configured identity as observed identity.

## P0-5 Evidence provenance

Compiler inputs are plain objects. `evidenceClass` strings and `sourceRef` strings by themselves are not proof. The runtime integration must consume canonical readiness/probe receipts or another durable trusted evidence object rather than allowing arbitrary caller strings to manufacture `CALLABLE_NOW`.

## Verification law

Do not merge on Vercel packaging-only READY. GitHub Actions jobs currently terminate with `steps:null`, which is infrastructure non-evidence. Exact-head closure needs a real runner: focused frontier tests, syntax, deterministic suite, relevant Avengers/router/context/orchestration tests, Mutation War and reachability where applicable. Temporary preview verifier `api/frontier-cognitive-verify.mjs` must not survive final merge.
