# UberBond Engineering Task Packets for Claude Code

**Prepared by:** ChatGPT Work independent review  
**Prepared at:** 2026-08-21  
**Delivery status:** NOT_DELIVERED — no relay comment or Claude execution is claimed  
**Canonical base:** `mohammedwessam2007/uberbondd@eb46a5c2e50c873a2d5e96a5270a7423fb3b6ed0`  
**Protected paths:** `lite/`, credentials, workflows, DNS, production, customer systems  
**Effect authority:** `NONE`; local preparation and isolated tests only.

These packets are deliberately narrow. They should be executed on a fresh branch based on current `main`, not on stale PR40/PR45 heads. Each packet must return an evidence-linked receipt with actual commands, actual test counts, changed paths, source commit, limitations, and an all-zero external-effect ledger.

---

## Packet 1 — Authenticate every relay result before terminal completion

### OBJECTIVE

Repair the canonical GitHub relay so malformed, foreign, stale, or forged result comments cannot transition a task to `COMPLETED`, suppress recovery, or masquerade as a valid worker receipt.

### WHY IT MATTERS

The GitHub Issues relay is the most externally evidenced bridge. A false terminal result can hide failed work, prevent a legitimate worker from claiming it, and corrupt the GPT ↔ Claude organizational memory. This is the highest-leverage integrity fix because every later cognitive task relies on relay truth.

### EVIDENCE

- Current base: `eb46a5c2e50c873a2d5e96a5270a7423fb3b6ed0`.
- Inspected paths: `src/github-relay.mjs`, `src/cloud-agent-relay.mjs`, `src/agent-relay.mjs`, corresponding relay tests.
- Observed behavior: `resolveLease` treats a parsed result comment with a `workerId` as completed before enforcing the full canonical receipt/result validation boundary; `readGithubRelayTask` and envelope construction similarly accept parsed result material without the same proof gate.
- Current canonical truth: no business-effect authority and no real commercial results.

### REQUIRED CHANGE

1. Define one pure result-proof function, or reuse the strongest existing validator, that requires:
   - matching `taskId` and parent/relay identity;
   - accepted terminal status;
   - valid source commit format and expected source provenance;
   - required receipt fields and typed test evidence;
   - zero external-effect ledger for local-preparation jobs;
   - no secret-shaped content;
   - worker identity bound to the claim/lease where applicable.
2. Make lease resolution return `COMPLETED` only after that validator passes.
3. Make invalid result comments visible as `INVALID_RESULT_QUARANTINED`, not silently ignored and not terminal completion.
4. Ensure duplicate valid results are idempotent and conflicting valid results become a dispute/quarantine state.
5. Do not create a second receipt schema.

### FORBIDDEN ACTIONS

No messages, sends, provider calls, deployments, credential/DNS changes, payments, production mutations, force-pushes, or changes to `lite/`.

### ACCEPTANCE TESTS

- Valid matching receipt → `COMPLETED` exactly once.
- Foreign `taskId` → not completed; quarantine reason recorded.
- Foreign worker without matching claim → not completed.
- Missing `testsActuallyRun`, `truthTable`, or ledger field → not completed.
- Non-zero effect ledger → not completed.
- Stale source commit → not completed or requires explicit review, never silently accepted.
- Secret-shaped result → rejected.
- Replay of the same valid result → idempotent, no duplicate terminal mutation.
- Two different valid terminal results → explicit conflict/dispute, no silent overwrite.
- Lease expiry with only invalid result comment → task remains recoverable.

### HOSTILE TESTS

Use issue-comment fixtures containing HTML entities, Unicode whitespace, fenced JSON with trailing text, nested JSON, result comments from another task, duplicate comments, out-of-order heartbeat/result comments, and a result whose worker ID differs from the lease owner.

### VERIFICATION

Run syntax, focused relay tests, hostile relay tests, then the full deterministic suite in a clean checkout. Report exact totals. A test count copied from a prior PR is not accepted.

### ROLLBACK

Revert only the isolated relay-validator commit. Preserve existing GitHub issue evidence and leave no external effects.

### EXPECTED IMPACT

High architectural leverage; prevents false completion across every future research, review, engineering, and repair task. Economic impact is indirect but foundational: it protects the evidence and learning loop that must eventually control capital allocation.

---

## Packet 2 — Scope worker replay and attenuate every child task

### OBJECTIVE

Make the cognitive bus multi-worker safe: pending model-result replay must be scoped to the owning worker/budget/provider/target, and every child task must inherit and strengthen parent constraints.

### WHY IT MATTERS

PR40 introduces the first serious GPT ↔ Claude control-plane machinery, but two boundaries are currently too weak for unattended operation: global pending replay and non-inherited prohibitions. These are cross-task contamination and authority-attenuation failures.

### EVIDENCE

- PR40 head: `ffa41bad98167aa2bc948e9068c96d11c154aba2`.
- Inspected paths: `src/agent-worker-job.mjs`, `src/agent-compute-store.mjs`, `src/agent-autonomy-loop.mjs`, `src/agent-autonomy-pump.mjs`, `src/agent-autonomy-store.mjs`, `src/agent-autonomy-relay-adapter.mjs`.
- Observed: `listPendingAgentSubmissions` is global and replay is not scoped to `budgetId`, `targetAgent`, provider/model, or worker identity.
- Observed: follow-up compilation adds local-preparation/no-business-effects but does not copy parent constraints, forbidden actions, budget, consequence class, or authority restrictions.

### REQUIRED CHANGE

#### Replay isolation

1. Extend the canonical pending-record query with a required ownership scope.
2. Bind pending records to immutable `workerId`, `budgetId`, `targetAgent`, provider, model, and task/session identity.
3. Require an atomic claim/CAS before replay; a second worker must receive a deterministic `NOT_OWNER`/`ALREADY_CLAIMED` outcome.
4. Keep compute accounting attached to the original budget and execution, never the replayer’s default context.

#### Constraint attenuation

1. Add a pure `attenuateChildTask(parent, child)` function.
2. Child forbidden actions = union(parent forbidden actions, child forbidden actions).
3. Child consequence class may only become more restrictive, never less restrictive.
4. Child budget cannot exceed parent remaining budget; deadlines cannot extend past the parent deadline.
5. Evidence/context/acceptance requirements must be retained or strengthened.
6. Store a digest of the inherited policy in the child task and verify it at relay/admission.

### FORBIDDEN ACTIONS

No provider calls, live Claude Code execution, external messages, spending, deployments, secrets, credentials, DNS, customer mutation, or protected-path changes.

### ACCEPTANCE TESTS

- Two workers with distinct budgets/providers/targets cannot replay one another’s pending records.
- Same worker replay is idempotent after process death.
- Replay after a budget is closed is rejected, not rerouted.
- Parent `forbiddenActions` survive every follow-up kind: RESEARCH, ENGINEERING, REVIEW, REPAIR.
- Child cannot promote `LOCAL_PREPARATION` to external consequence class.
- Child budget/deadline cannot exceed parent.
- Missing parent policy digest causes fail-closed rejection.
- Duplicate tick/transition does not create two active child tasks.
- Parent terminal state prevents child creation.

### HOSTILE TESTS

Use two simultaneous workers, identical task IDs with different providers, stale snapshots, replay after partial persistence, manipulated child payloads with empty constraints, and a child that requests deployment/spend despite a parent prohibition.

### VERIFICATION

Run isolated PR40 tests ported to current main, deterministic suite, and a process-death simulation. Do not claim multi-day autonomy from a single tick.

### ROLLBACK

Disable the cognitive-bus activation flag and revert the isolated port. Existing GitHub relay remains available as bounded local-preparation transport.

### EXPECTED IMPACT

High leverage for the bridge and founder-burden goal. It prevents one worker/model from consuming another’s work or silently widening authority. It is an architectural prerequisite before any unattended provider canary.

---

## Packet 3 — Establish a device-off shadow rehearsal with real operational receipts

### OBJECTIVE

Create the smallest deployed, non-consequential cloud rehearsal that proves scheduler → durable queue → worker lease → heartbeat → result receipt → recovery → owner escalation while keeping provider calls and business effects disabled.

### WHY IT MATTERS

UberBond currently has interfaces and local tests but no independently verified device-off worker. Vercel Queues and OpenAI Background/Webhooks make a cloud architecture feasible, but feasibility is not proof. This packet converts “cloud-ready” into a bounded operational experiment without spending money or contacting anyone.

### EVIDENCE

- Current main has `src/cloud-agent-relay.mjs`, `src/chatgpt-relay-client.mjs`, `src/github-relay.mjs`, queue/scheduler contracts, and founder-absence readiness evaluation.
- Current main handoff says the HTTP ingress was not reliably verified and the GitHub Issues fallback is the actual bridge.
- PR45 contains a one-shot exact-project preview gate and endpoint proof, but its branch is stale and must not be merged wholesale.
- Official Vercel documentation supports durable Queues with visibility leases, retries, and poll-mode consumers outside Vercel; official OpenAI documentation supports asynchronous Background Responses and signed webhooks. These are external capabilities, not UberBond proof.

### REQUIRED CHANGE

1. Rebase the minimal relay preview/worker adapter onto current main.
2. Verify exact project/team identity and bundle digest before any preview attempt.
3. Deploy preview only under existing explicit authorization; never promote production.
4. Verify health and fail-closed task behavior with a real deployment receipt.
5. Bind only a read-only shadow observer to the canonical queue; worker execution remains blocked.
6. Generate a synthetic/local-preparation job with zero external effects.
7. Exercise: normal completion, worker crash before receipt, lease expiry, heartbeat loss, duplicate delivery, malformed result, and owner escalation.
8. Persist a durable receipt containing deployment ID, URL, source commit, bundle digest, endpoint proofs, queue state, attempt count, recovery outcome, and external-effect ledger.

### FORBIDDEN ACTIONS

No production promotion, DNS change, credential change, provider call, outbound message, payment, customer mutation, purchase, or live Claude Code execution. Do not call an interface “full cloud worker” until the receipt proves it.

### ACCEPTANCE TESTS

- Exact project/team identity passes; near-match project is rejected.
- Byte-for-byte manifest/digest mismatch blocks deployment.
- Deployment proof is `INTERFACE_ONLY`, never economic proof.
- Health endpoint is verified from the deployed URL.
- Task endpoint fails closed when durable queue is not bound.
- Shadow observer can read but cannot create/claim/heartbeat/submit.
- Crash/restart test recovers or quarantines deterministically.
- Duplicate delivery does not duplicate a result.
- Owner escalation is observable and bounded.
- All external-effect counters remain zero.

### HOSTILE TESTS

Wrong project ID, wrong team, wrong URL, wrong branch, stale manifest, duplicate deployment attempt, ambiguous provider response, queue timeout, stale lease, forged receipt, foreign job type, and non-zero effect ledger.

### VERIFICATION

Use a clean repository checkout, real deployment/API receipts if authorized, and a bounded test window. If the deployment/queue gate is unavailable, stop at the local adapter contract and record `EXTERNAL_PROOF_REQUIRED`.

### ROLLBACK

Leave preview isolated, disable the shadow binding, and revert the isolated adapter/observer change. Do not touch production or delete historical receipts.

### EXPECTED IMPACT

Medium-to-high architectural leverage. It is the shortest credible path to testing the founder’s “device off” requirement while preserving sovereignty and zero business effects.


