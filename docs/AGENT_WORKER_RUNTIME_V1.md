# UberBond Agent Worker Runtime V1

## Purpose

This closes a major gap between a durable GPT ↔ UberBond ↔ Claude task graph and an actually schedulable model worker.

The architecture on this branch is now:

```text
Autonomy session
  → one durable AgentTask
  → cloud relay job + lease
  → scheduler worker tick
  → durable AI-compute reservation
  → injected model executor
  → durable compute commit
  → canonical result validation
  → durable MODEL_RESULT_READY receipt
  → relay result submission
  → autonomy pump ingests coordination action
  → next GPT/Claude task or bounded stop
```

The worker does not grant business-world authority. Customer messages, purchases, deployments, credential changes, DNS changes, production mutations and business spend stay outside this runtime.

## New components

### `src/agent-worker-runtime.mjs`

Turns one already-claimed relay task into one bounded model execution.

Properties:

- task must be `LOCAL_PREPARATION`;
- AI compute has a separate explicit budget and provider allowlist;
- provider execution is injected rather than hard-wired;
- compute reservation is persisted before provider invocation when a persistence hook is configured;
- provider transport uncertainty is quarantined instead of blindly retried;
- only an explicit confirmed provider failure can release the compute reservation automatically;
- compute usage is committed before model output is accepted;
- output must satisfy the canonical relay result contract;
- secret-like output and non-zero external-effect ledgers fail closed;
- `MODEL_RESULT_READY` is persisted before relay completion;
- relay failure after model completion produces `RESULT_SUBMISSION_PENDING`;
- `resumeAgentWorkerSubmission()` resubmits the existing result without invoking the model again.

### `src/agent-compute-store.mjs`

Adds append-only durable persistence on the existing audit log for:

- compute budget snapshots;
- active compute reservations;
- committed/released compute state;
- model execution records;
- ready results awaiting relay submission;
- completed result-submission receipts.

A compute-specific secret check is used for the compute ledger because canonical numeric fields such as `reservedTokens`, `committedTokens`, and `tokenCeiling` are not authentication secrets. The canonical compute-budget validator still enforces budget identity and counters.

### `src/agent-worker-job.mjs`

One scheduler tick advances at most one unit of model work.

Order of operations:

1. load the latest durable compute budget;
2. replay an already-computed result first, if one exists;
3. otherwise claim exactly one relay task for the target agent;
4. persist the pre-execution state;
5. reserve and persist compute;
6. heartbeat the relay lease;
7. call the injected model executor once;
8. commit and persist compute usage;
9. validate and persist the model result;
10. submit that exact result to the relay;
11. persist final worker receipts.

This is deliberately not a forever loop. A cloud scheduler can call it repeatedly while each invocation remains bounded and auditable.

## Crash-window model

### Crash before provider call

The durable reservation exists. A restarted worker sees the reservation and cannot silently reserve the same task again.

### Provider call throws or transport state is unclear

Status becomes `COMPUTE_OUTCOME_UNCERTAIN`. The reservation stays active. Automatic replay is blocked until reconciliation can establish whether compute occurred.

### Model finishes, process dies before relay submission

The worker persists `MODEL_RESULT_READY` before attempting relay completion. The next scheduler tick prioritizes replaying this stored result, so no second model call is needed.

### Relay submission fails

The same persisted result advances to `RESULT_SUBMISSION_PENDING`. A later tick retries only the relay write.

### Provider explicitly rejects before completing work

Only the explicit `CONFIRMED_FAILURE` path releases the compute reservation automatically.

## Verification added on this branch

New hostile suites now cover:

- paid inference denied without explicit authorization;
- compute ceilings and provider allowlists;
- provider uncertainty quarantine;
- heartbeat/lease failure before provider invocation;
- result replay without a second model invocation;
- rejection of non-zero external effects;
- canonical compute snapshots containing token counters;
- latest-snapshot recovery after commit;
- `MODEL_RESULT_READY` replayability;
- superseding pending results with `RESULT_SUBMITTED`;
- rejection of credential-shaped persistence fields;
- reservation persistence ordering before provider invocation;
- fail-closed behavior if reservation persistence fails;
- persistence of model result before relay completion.

A full clean-tree repository suite is still required before this draft PR can be treated as merge-ready.

## What remains before real device-off GPT ↔ Claude work

The missing live pieces are intentionally explicit:

1. a real OpenAI model executor adapter with provider-response reconciliation and pricing/accounting evidence;
2. a real Claude/Anthropic or Claude Code worker adapter with equivalent uncertainty semantics;
3. cloud scheduler wiring for the autonomy pump and each model worker;
4. durable initialization/rotation of authorized AI-compute budgets;
5. clean-tree full-suite verification and migrations/infrastructure checks;
6. live health evidence showing scheduler, relay, workers, stale recovery, kill switch and receipts operating together.

Until those exist, this branch is an executable autonomy foundation, not a claim of live unattended model-to-model operation.

## Effect boundary

Work in this package is code, tests, receipts and local-preparation orchestration only. It does not authorize or perform customer contact, outbound sends, purchases, advertising spend, KYC/payment changes, DNS changes, deployment, production mutation or revenue recognition.
