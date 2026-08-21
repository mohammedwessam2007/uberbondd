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
  → provider executor socket
  → durable compute commit
  → canonical result validation
  → durable MODEL_RESULT_READY receipt
  → relay result submission
  → autonomy pump ingests coordination action
  → next GPT/Claude task or bounded stop
```

The worker does not grant business-world authority. Customer messages, purchases, deployments, credential changes, DNS changes, production mutations and business spend stay outside this runtime.

## Components

### `src/agent-worker-runtime.mjs`

Turns one already-claimed relay task into one bounded model execution.

Properties:

- task must be `LOCAL_PREPARATION`;
- AI compute has a separate explicit budget and provider allowlist;
- provider execution is injected rather than silently enabled;
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

### `src/openai-agent-executor.mjs`

Adds a disabled-by-default OpenAI Responses API socket that can be injected into `agent-worker-runtime.mjs`.

Important properties:

- import/constructor performs no request;
- executor must be explicitly enabled;
- API key is request-only and is not returned in receipts;
- endpoint is fixed to the OpenAI Responses API rather than accepting arbitrary destinations;
- only `LOCAL_PREPARATION` tasks are accepted;
- no business-world tools are exposed;
- structured output is requested through a strict JSON schema matching the UberBond worker-result contract;
- pricing evidence is required before invocation rather than assuming model compute is free;
- usage is converted to a conservative configured cost estimate for compute-ledger accounting;
- network/server ambiguity becomes `UNCERTAIN` rather than a blind retry;
- explicit client/auth/rate-limit rejection is distinguished from uncertain server-side failure;
- non-completed provider response states remain uncertain;
- the raw provider request ID is retained for later reconciliation.

The current adapter is a code socket only. No live OpenAI request has been made by this implementation session and no credential has been installed or changed.

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

Hostile suites cover or have been authored for:

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
- persistence of model result before relay completion;
- OpenAI adapter disabled-by-default behavior;
- strict Responses API request construction under a fake transport;
- API-key non-leakage in result receipts;
- client-failure versus server/transport uncertainty classification;
- mandatory pricing evidence;
- rejection of consequenceful tasks before provider invocation;
- an end-to-end fake OpenAI relay-worker roundtrip from claimed task through compute persistence and result submission.

A full clean-tree repository suite is still required before this draft PR can be treated as merge-ready. The newest durability and OpenAI-adapter tests have not yet received that independent clean-tree run in this implementation environment.

## Current canonical execution choice

`agent-provider-worker.mjs` and `agent-provider-execution.mjs` remain useful pure/provider-transaction primitives and fixtures. For scheduler/device-off operation, the crash-safe path should be treated as:

`agent-worker-job.mjs → agent-worker-runtime.mjs → provider executor → durable compute/result store → relay`.

This avoids two competing live execution paths. The older provider transaction layer should not be wired as a second scheduler loop without reconciliation.

## What remains before real device-off GPT ↔ Claude work

The remaining live pieces are explicit:

1. independently verify the OpenAI adapter against the real provider in a bounded canary with authorized compute and provider-response reconciliation;
2. add an equivalent real Claude/Anthropic or Claude Code executor with the same uncertainty and replay semantics;
3. wire a cloud scheduler for the autonomy pump and each model worker;
4. initialize and rotate durable authorized AI-compute budgets without granting business-effect authority;
5. run clean-tree full-suite verification plus migrations/infrastructure checks;
6. obtain live health evidence showing scheduler, relay, workers, stale recovery, kill switch and receipts operating together.

Until those exist, this branch is an executable autonomy foundation with a real OpenAI API socket in code, not a claim of live unattended model-to-model operation.

## Effect boundary

Work in this package is code, tests, receipts and local-preparation orchestration only. It does not authorize or perform customer contact, outbound sends, purchases, advertising spend, KYC/payment changes, DNS changes, deployment, production mutation or revenue recognition.
