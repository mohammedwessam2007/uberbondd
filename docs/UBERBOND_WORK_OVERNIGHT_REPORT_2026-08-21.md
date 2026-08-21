# UberBond Work Overnight Report

**Mission:** Project Prometheus + Cognitive Bus + Commercial Intelligence + Independent Red Team  
**Review date:** 2026-08-21  
**Reviewer:** ChatGPT Work, independent of Claude Code  
**Truth rule:** repository evidence beats prose; preparation is not execution; synthetic evidence is never commercial proof.

## GOOD MORNING

UberBond’s architecture moved forward while the owner was unavailable, but it did not create commercial revenue or prove unattended cloud operation. This review independently inspected the current repository, the three relevant historical PR lineages, the current Prometheus implementation, the cognitive-bus code, canonical Library artifacts, and current official provider/cloud documentation.

The most important conclusion is not “more code is needed.” It is:

> UberBond now has several strong preparation primitives, but the cognitive bus and Prometheus spine still require a narrow integrity pass before they should be trusted to run unattended. The first external economic proof remains absent.

## Starting and ending repository truth

- Repository: `mohammedwessam2007/uberbondd`
- Starting main SHA observed: `eb46a5c2e50c873a2d5e96a5270a7423fb3b6ed0`
- Ending main SHA observed during this review: `eb46a5c2e50c873a2d5e96a5270a7423fb3b6ed0`
- Latest main commit observed: `Fix the HTTP ingress: poll was broken, and receipts lost their provenance (#67)`.
- No code was written to `main` during this review.
- The local checkout available to Work was a separate dirty branch (`agent/cloud-agent-relay`) and was not used as canonical repository truth.
- `lite/` was not modified.

### Commercial scoreboard

| Measure | Verified value | Classification |
|---|---:|---|
| Paying customers | 0 | VERIFIED_FACT from current canonical evidence |
| Cleared customer revenue | $0 | VERIFIED_FACT from current canonical evidence |
| Accepted live customer deliveries | 0 | VERIFIED_FACT from current canonical evidence |
| Repeat payments / renewals | 0 | VERIFIED_FACT from current canonical evidence |
| Live authorized commercial experiments | 0 | VERIFIED_FACT from current canonical evidence |
| Live outbound messages | 0 | VERIFIED_FACT from current canonical evidence |
| Production deployments of the relay | 0 observed in the reviewed handoff | VERIFIED_FACT / current proof required before any new claim |
| Provider calls made by this review | 0 | VERIFIED_FACT |
| Spend, purchases, DNS, credential, KYC, or production mutations | 0 | VERIFIED_FACT |

No architecture count upgrades this scoreboard.

## Claude Code / PR state observed

### PR #40 — cognitive bus

[PR #40](https://github.com/mohammedwessam2007/uberbondd/pull/40) is open, draft, and not mergeable as-is.

- Head: `ffa41bad98167aa2bc948e9068c96d11c154aba2`
- Base at PR metadata: `d447d07bcb604cf25978abf03b716eed8ffe48d6`
- Against current main: **85 commits ahead, 41 commits behind**, diverged at `d447d07…`.
- Changed surface: 54 files, approximately 11K additions.
- Unique value: autonomous session/pump, agent-worker runtime, compute reservation/commit, OpenAI and Anthropic adapters, Claude Code sandbox executor, model router, control-plane state, founder-absence gate.
- Status: **historical donor / semantic slices only**. Do not merge the branch wholesale.

### PR #45 — relay deployment gate

[PR #45](https://github.com/mohammedwessam2007/uberbondd/pull/45) is open, draft, and stale relative to current main.

- Head: `07744312a38b57acfc380a09e425841f617d4ed7`
- Against current main: **16 commits ahead, 34 commits behind**, diverged at `5dc6e8a…`.
- Unique value: exact project/team identity, seven-blob manifest and digest validation, one-shot preview state machine, endpoint proof, read-only shadow planner.
- Status: **deployment-control donor**. It may be rebased and ported only after current-main HTTP/receipt semantics are reconciled. It must not become a second relay authority.

### PR #7 — Canon/V3 acquisition archaeology

[PR #7](https://github.com/mohammedwessam2007/uberbondd/pull/7) is open, draft, and very stale.

- Head: `221cbb8478663b08283376247d3b40b30797fe0c`
- Against current main: **5 commits ahead, 139 commits behind**, diverged at `ba2b100…`.
- Unique value: durable staged acquisition cycle, fresh pre-send recheck, cohort reservation, attribution-chain persistence, campaign gates, and portfolio allocation primitives.
- Status: **salvage map only**. Do not merge its live acquisition machinery wholesale. Any future effect remains V9-governed and owner-authorized.

## Current cognitive bus assessment

### What is real on current main

The GitHub Issues relay is the strongest externally evidenced bridge. The current handoff records real issue-based task/claim/heartbeat/result round trips, including issue #43, with worker receipts and source-commit provenance. The worker has bounded allowlisted deterministic suites, lease recovery, heartbeat support, timeout classification, attempt caps, and fail-closed external-effect ledgers.

This proves a **message channel and bounded local worker path**. It does not prove that a Claude Code process is continuously available, that ChatGPT Work is a programmable unattended worker, that the HTTP relay is deployed, or that the full economic loop can run for seven days.

The HTTP/cloud relay is interface-shaped but externally unproven. The current cloud relay has a Postgres-shaped durable queue contract; the current main handoff explicitly says HTTP ingress was not reliably proven. Vercel’s current Queues documentation describes durable topics, consumer groups, retries, visibility leases, idempotent consumers, and poll-mode consumers outside Vercel. Those are suitable building blocks, but no project deployment/endpoint proof was established by this review. [Vercel Queues](https://vercel.com/docs/queues) and [Vercel Queues concepts](https://vercel.com/docs/queues/concepts).

### Independent red-team findings

#### P1 — GitHub result comments can prematurely complete a task

Current `src/github-relay.mjs` resolves a task as `COMPLETED` when it sees a parsed result comment with a `workerId`. The result path, as inspected, does not first require a valid canonical receipt, matching task identity, accepted status, source commit, or zero-effect ledger before the lease resolver treats the task as completed. `readGithubRelayTask` and the envelope path likewise return parsed result material without the same validation boundary.

Impact: a malformed, foreign, stale, or forged fenced result comment could make a task appear complete and block legitimate recovery or hide missing work. This is an integrity and availability issue, not merely a formatting issue.

Required test: inject a foreign task ID, missing receipt fields, non-zero effect ledger, mismatched worker, stale source commit, and malformed JSON in result comments; all must remain claimable or quarantine explicitly and never become `COMPLETED`.

#### P1 — PR #40 pending replay is globally scoped

`src/agent-worker-job.mjs` calls the pending-submission list before claiming new work. The PR #40 store API lists pending records globally, and the tick does not scope replay by `budgetId`, `targetAgent`, provider, model, or worker identity.

Impact: in a multi-worker deployment, one configured worker can replay another worker’s pending model result using its own callbacks and budget context. This risks cross-provider contamination, wrong-budget accounting, and wrong-agent submission.

Required test: create two workers with different budgets/providers/targets, leave pending records for both, and assert each worker can replay only its own records.

#### P1 — Child task constraints do not attenuate from the parent

`src/agent-autonomy-loop.mjs` adds local-preparation/no-business-effects to generated tasks but does not copy and strengthen the parent `constraints`, `forbiddenActions`, consequence class, budget, or authority restrictions into follow-up tasks.

Impact: a later repair/research/engineering child can lose an inherited prohibition unless every adapter independently restores it. This violates the constitutional rule that a child task cannot remove a parent restriction.

Required test: parent forbids deployment, spending, credentials, and external messages; generate every follow-up kind and assert the child contains the parent prohibitions plus any stricter child rules.

#### P1 — Sandbox safety relies too heavily on prompt compliance

The PR #40 Claude Code sandbox executor uses a restricted tool list and an instruction not to touch `.env`, `lite/`, `.git`, or workflows, but the inspected path does not independently enforce a changed-path allowlist after execution. The isolation receipt is a claimed/configured receipt, not an attestation that a hostile worker could not write outside the intended subtree.

Impact: a model/tool bug or prompt injection could alter protected paths, workflows, or repository state while the post-hoc result still reports a benign artifact list.

Required test: simulate attempts to write `.env`, `lite/`, `.git`, workflows, parent paths, symlinks, and files outside the declared sandbox; the runner must block and the collector must fail closed.

#### P1 — Canonical truth drift in documentation and safety constants

The current Prometheus architecture documentation describes parts of V9/Guard as unresolved or split, while the final implementation report describes V9 composition and parallel-spine reconciliation as resolved. `api/agent-relay.mjs` also contains a local `ZERO_EFFECTS` definition while other relay modules import a canonical constant.

Impact: operators and future agents can choose contradictory authority paths or update one safety ledger while another drifts. The documentation contradiction is itself a governance defect; the duplicated safety constant is a code-drift risk.

Required test/repair: one machine-readable canonical capability/status registry, one imported zero-effects object, and a documentation check that fails if current status claims disagree.

### P2 findings

- PR #40 provider executors lack an explicit request abort/deadline tied to the queue lease and do not use an idempotency header. Current main `src/ai.mjs` also uses direct `fetch` without an explicit timeout or response-size cap.
- OpenAI/Anthropic executor code reads the complete response body before enforcing the intended size bound. Move size enforcement into streaming or a bounded reader.
- The PR #40 default model string `gpt-5.6-sol` was not treated as verified. Model names must come from a current provider catalog/configuration, not a prompt or branch constant.
- `agent-autonomy-store.mjs` appends snapshots and reads the latest record but does not itself prove compare-and-swap ownership for competing ticks. A scheduler can execute one transition twice unless the underlying store supplies an atomic lease/CAS contract.
- A passing unit suite does not prove the actual GitHub/Vercel provider path, webhook signature handling, queue redelivery, or seven-day absence behavior.

### P0 findings

None established in this review. V9/business-effect authority remains disabled/none in the inspected preparation paths, and no live customer or spend effect was evidenced. The P1s still block unattended trust.

## Provider and cloud reality review

### OpenAI

The official docs support Structured Outputs with JSON Schema and explicitly expose refusals/incomplete responses; UberBond should validate both the structured result and refusal/incomplete state before creating a worker receipt. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

OpenAI Background mode runs Responses asynchronously and supports polling; official webhooks can emit `response.completed`, require raw-body signature verification, should return quickly, can be retried for up to 72 hours, and may duplicate events, so `webhook-id` should be treated as an idempotency key. [OpenAI Background mode](https://developers.openai.com/api/docs/guides/background) and [OpenAI Webhooks](https://developers.openai.com/api/docs/guides/webhooks).

OpenAI’s current rate-limit documentation exposes `Retry-After` and rate-limit headers and warns that retryable temporary rate limits differ from billing/quota failures. Router/worker code must preserve request IDs, classify errors, and bound retries. [OpenAI rate limits](https://developers.openai.com/api/docs/guides/rate-limits).

The official catalog currently lists distinct model capabilities and pricing; for example, GPT-5.5 Pro is a Responses API model with long-running reasoning and background-mode guidance, while GPT-5.4 mini supports structured outputs and several tools. Model routing must use a verified model manifest rather than hard-coded prestige or unverified names. [GPT-5.5 Pro](https://developers.openai.com/api/docs/models/gpt-5.5-pro) and [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

### Anthropic

Anthropic’s current API documentation exposes request IDs for every response, distinguishes temporary rate-limit 429s from spend-cap failures, and recommends streaming or Message Batches for long requests. The adapter should persist request ID, status class, retry-after when present, and usage, while refusing automatic retries for spend-cap/quota errors. [Anthropic API errors](https://docs.anthropic.com/en/api/errors) and [Anthropic rate limits](https://docs.anthropic.com/en/api/rate-limits).

The Anthropic API worker and Claude Code repository worker must remain distinct contracts. An API call produces a provider result; Claude Code changes a sandbox/repository. The latter needs independent path-diff verification, not only a model-produced receipt.

### Vercel / device-off

Vercel Cron is not a universal unattended guarantee: official pricing docs say Hobby scheduling is daily and imprecise, while Pro supports more frequent schedules. The current Vercel project therefore cannot be called an hourly cloud nervous system without a verified plan, deployment, cron receipt, and worker health evidence. [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Vercel Queues can support a device-off architecture in principle, including poll-mode consumers outside Vercel, but the system still needs a deployed worker, durable store, lease/heartbeat behavior, secrets, monitoring, and a bounded absence test. [Vercel Queues poll mode](https://vercel.com/docs/queues/poll-mode).

## Prometheus assessment

### Real preparation layer on main

The current main branch contains a broad preparation-only spine:

`MarketSignal` / signal registry → genome extraction → opportunity registry/tournament → experiment packet → distribution ranking → payment-truth-gated commercial outcome → learning/memory → self-upgrade proposal → engineering packet → shadow/canary contracts.

The code is unusually honest about missing inputs. `src/opportunity-registry.mjs` keeps claim classifications and missing fields explicit. It states that a registry score cannot create market truth by itself. `src/job-handlers.mjs` wires many Prometheus handlers, but the handlers are local/audit preparation paths and explicitly do not fetch, promote, send, spend, deploy, or create payment proof.

The reported opportunity universe count (approximately 438 in prior context) is not upgraded here to `438 verified opportunities`. Count, deduplication, field completeness, source quality, and buyer/payment proof need a fresh deterministic registry audit. The correct present classification is **large research catalog / commercial evidence unresolved**.

### What remains structurally missing

1. A compliant live market-signal ingestion path with source-specific authorization, provenance, freshness, rate limits, and poisoning resistance.
2. A single canonical machine-readable capability registry whose status drives docs, activation gates, and morning briefs.
3. A vertical connector from current signal registry to genome extraction to opportunity tournament with real stored lineage, not only independent handlers.
4. A general fulfillment substrate: requirements, authorized inputs, execution, QA, delivery evidence, acceptance, revision, support, renewal.
5. A payment/revenue proof path with configured checkout/webhook evidence; current price fields remain hypotheses/config defaults.
6. A deployed worker and absence test proving process death, lease recovery, retries, queue redelivery, provider uncertainty, and owner escalation.
7. A hard boundary preventing synthetic fixtures, model confidence, or estimated margins from funding live distribution or capital allocation.

## Reconciliation decisions

### PR #40 safest sequence

1. Rebase the semantic work onto current `main`; do not merge the 85-commit branch.
2. Port the task schema/loop tests first, then repair constraint attenuation and terminal-state semantics.
3. Port the store/job layer only after adding scoped pending replay and atomic run ownership/CAS.
4. Port provider adapters behind a verified model manifest, deadline/AbortController, bounded response reader, request-ID capture, and idempotency semantics.
5. Port Claude Code execution only after changed-path enforcement and independent diff collection exist.
6. Bind the surviving worker to the existing canonical relay; no new queue, relay, or truth registry.
7. Run current-main deterministic and audit suites in a clean checkout; then run a synthetic crash/replay rehearsal. No live provider canary is implied.

### PR #45 safest sequence

Port only the deployment gate/manifest and one-shot runbook after current-main rebase. Preserve the current HTTP ingress receipt/provenance fixes. Never create a second deployment authority or treat preview interface proof as durable worker proof.

### PR #7 safest sequence

Salvage the pre-send recheck, cohort reservation, attribution chain, and portfolio-ranking algorithms as isolated donor concepts. Compare each against current outbound/V9 modules. Keep `outbound.enabled=false`, `dryRun=true`, and business-effect authority disabled until owner authorization plus real provider/recipient evidence exist.

## Tasks delivered through UberBond

**None.** The current externally proven relay is a GitHub Issues message channel, but this review did not post task comments or claim Claude execution. The task packets below are prepared but **NOT_DELIVERED**. They are ready for a future bounded relay dispatch or manual Claude Code run.

## Highest-leverage next work

The best shared-capability sequence is:

1. **Canonical receipt/lease integrity hardening** — closes false completion, foreign result, replay, and provenance gaps in the only currently proven relay.
2. **Cognitive-bus authority attenuation and scoped persistence** — makes PR #40 safe to port without cross-worker contamination or lost prohibitions.
3. **Device-off rehearsal substrate** — deploy/verify one non-consequential worker path, then run a bounded crash/restart/lease/owner-escalation rehearsal before any provider or commercial action.

These unlock more value than adding further opportunity rows, models, dashboards, or agent types.

## External proof still required

- Current main clean-checkout verification after any PR40/45/7 salvage.
- Actual Vercel project identity, deployment receipt, endpoint health, and queue/worker proof.
- Provider credentials, approved compute budget, model manifest, request-ID/usage receipts, and one bounded canary.
- Payment checkout configuration, webhook verification, cleared-payment receipt, accepted delivery, and a second payment.
- Real customer/partner evidence for any opportunity promotion.
- Seven-day or 14-day owner-absence rehearsal with no device dependency.

## Founder actions

Maximum three, and none are routine engineering decisions:

1. When ready, authorize the minimum provider/compute budget for one bounded non-consequential canary.
2. Configure the actual checkout URL/payment webhook if commercial activation is desired.
3. Choose the legal/identity authority for any future live outbound or customer-facing deployment.

No founder action is needed to reconcile the code paths described in the task packets.


