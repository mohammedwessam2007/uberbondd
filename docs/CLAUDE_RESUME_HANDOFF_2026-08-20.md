# Claude Resume Handoff — 2026-08-20

## Read this first

You are resuming work on draft PR #40, branch:

`agent/gpt-autonomous-roundtrip-20260820`

Do not start a new architecture. Do not merge, deploy, send customer messages, purchase anything, change DNS, mutate credentials, enable production effects, or make live provider calls merely because this file exists.

The branch is intended to become a bounded, resumable GPT ↔ UberBond ↔ Claude engineering mesh. Business-world consequence authority remains `NONE`.

## Current truth

The branch now contains more than a message relay. It has the local-preparation engineering spine:

1. durable autonomy session + task relay;
2. bounded AI compute budgets;
3. crash-safe model worker with result replay;
4. OpenAI Responses API worker socket, disabled by default;
5. Anthropic Messages API worker socket, disabled by default;
6. finite scheduler control plane, disabled by default;
7. fail-closed activation gate;
8. Claude Code sandbox executor requiring an explicit OS-isolation receipt;
9. actual Git-state collector so Claude self-reports are not treated as filesystem truth;
10. deterministic network-disabled sandbox verifier;
11. deterministic code change contract/applier;
12. durable code-change artifact store;
13. evidence-first Claude engineering orchestrator;
14. durable wrapper that automatically binds engineering change sets to the UberBond artifact store.

No live OpenAI or Anthropic call has been made by the ChatGPT implementation session that built the newest pieces. No cloud worker has been enabled. No real customer or commercial action was performed.

## First mission when Claude capacity returns

Your first job is **verification and repair**, not feature invention.

Run, from a clean checkout of this exact branch:

```bash
npm run check
```

Record the exact results. Do not summarize a failing suite as green. If `npm run check` fails because of an external browser/CI/environment dependency, separate:

- deterministic code failure;
- syntax failure;
- browser/runtime dependency failure;
- infrastructure/billing failure.

Then repair only defects proven by the failing evidence, preserving the architecture and effect boundaries below.

## New suites that must be exercised through the canonical deterministic path

`tests/agent-relay.test.mjs` imports the mesh suites so `npm run test:deterministic` should execute them. Confirm that it actually reaches at least these areas:

- autonomy architecture / hardening / durable pump / scheduler job;
- crash-safe worker runtime and persistence;
- compute store;
- OpenAI adapter;
- Anthropic adapter;
- finite control plane;
- code change contract + sandbox applier;
- activation gate;
- Git sandbox collector;
- Claude Code sandbox executor;
- sandbox verifier;
- Claude engineering orchestrator;
- durable code artifact store;
- durable Claude engineering wrapper.

If any newly added suite is not actually invoked, wire it into the canonical deterministic test entrypoint without weakening existing checks.

## Architecture invariants you must not weaken

### 1. Provider compute is not business authority

A model call may consume explicitly authorized AI compute. That must never imply authority to:

- message customers;
- purchase anything;
- run ads;
- deploy;
- mutate production;
- change DNS;
- change credentials;
- submit KYC/payment configuration;
- claim revenue.

Keep `businessEffectAuthority: NONE` throughout this branch.

### 2. Provider uncertainty is not retry permission

If transport/process/provider state is ambiguous after possible compute dispatch, quarantine it as uncertain. Do not blindly retry and risk duplicate paid inference.

Persist compute reservation before provider invocation. Persist successful result before relay completion. Replay the saved result after relay failure rather than rerunning the model.

### 3. Claude self-report is not source-code truth

For engineering tasks:

Claude Code edits only an ephemeral sandbox checkout. Afterwards:

`Git state → canonical hashed change set → durable artifact → deterministic verifier → GPT review`

The actual changed files must be derived from Git/filesystem evidence, not `changedArtifacts` claimed by the model.

### 4. Sandbox editing and verification are separate phases

Claude Code edit phase requires an explicit OS isolation receipt asserting at minimum:

- ephemeral sandbox filesystem;
- no business credentials mounted;
- no host HOME mounted;
- production network unreachable;
- Anthropic-only network egress;
- Anthropic-only provider credential scope;
- dedicated ephemeral HOME outside the Git sandbox;
- typed evidence refs.

The Claude Code profile itself must remain bounded:

- noninteractive print mode;
- stream-json output;
- bounded turns/time/tokens/cost;
- allowed tools only `Read`, `Write`, `Edit`;
- Bash/web/search/notebook tools disabled;
- host config roots removed;
- custom `ANTHROPIC_BASE_URL` not inherited.

After editing, switch to verification mode with network egress `NONE` and no provider or business credentials. The deterministic verifier may execute only the allowlisted test/syntax commands defined in `src/agent-sandbox-verifier.mjs`.

### 5. Protected paths stay protected

Do not permit autonomous changes to:

- `.env*`;
- `credentials/`;
- `lite/`;
- `.git/`;
- `node_modules/`;
- `.github/workflows/`.

Path traversal, symlinks, stale before-hashes, rename/copy ambiguity, Git conflicts, credential material and oversized patch sets must remain fail-closed.

### 6. No autonomous promotion

A passing sandbox change set may become `REVIEW_REQUIRED`. It may not automatically merge/deploy from this branch.

A failing deterministic verification becomes `REPAIR_REQUIRED`.

No material Git change is not implementation success.

Sandbox teardown failure is a stop/quarantine condition.

## High-priority hostile review

After getting the full suite green, attack the implementation rather than polishing docs. In particular test:

1. crashes at every boundary between compute reservation, provider invocation, compute commit, result persistence, relay completion and autonomy ingestion;
2. provider returns success but malformed canonical result;
3. Claude edits a protected path through a symlink or case/path trick;
4. repo changes after Claude generated the patch but before apply/review;
5. artifact store tampering and duplicate/collision behavior;
6. patch content with large escaping overhead near relay/artifact limits;
7. verifier script tampering in `package.json` while network/credentials remain absent;
8. Claude Code attempts an unallowlisted tool despite CLI restrictions;
9. Claude Code reads inherited host config or redirects Anthropic traffic through custom base URL;
10. teardown fails after successful verification;
11. result submission fails after a fully paid Claude engineering run;
12. autonomy repair/review ping-pong reaches round/token/task ceilings.

For each discovered defect: add the smallest hostile regression test, repair it, rerun the relevant suite, then rerun the full check.

## Activation sequence after repository verification

Do not jump straight to unattended live operation.

Use the activation gate states in order:

1. `ARCHITECTURE_ONLY`
2. `OFFLINE_REHEARSAL_READY`
3. `BOUNDED_COMPUTE_CANARY_READY`
4. `DEVICE_OFF_MESH_REHEARSAL_READY`

A real provider canary requires explicit compute authorization, pricing evidence, credentials, bounded budget and durable receipts. Business effects remain zero.

Cloud scheduling should be enabled only after real provider canaries and scheduler/worker health are externally verified. Keep the cycle finite and scheduler-driven, not a hidden forever loop.

## Do not claim these until proven

Do not write any of the following without evidence from this resumed session or externally verified receipts:

- “all tests pass”;
- “OpenAI is live”;
- “Claude is live”;
- “GPT and Claude are autonomously communicating in the cloud”;
- “device-off operation works”;
- “revenue is live”;
- “production is deployed”.

## Desired completion receipt

When you finish the verification/repair wave, update the PR with:

- exact branch head SHA;
- exact `npm run check` counts/result;
- exact deterministic suite counts/result;
- syntax result;
- browser result and runtime path/version if relevant;
- every file changed in the repair wave;
- each real defect found and regression test added;
- effect ledger;
- whether any provider call occurred;
- whether any spend occurred;
- whether any deployment/business action occurred;
- remaining live gates.

Keep PR #40 draft unless the complete repository verification is green and the PR description truthfully reflects the final branch. Even then, do not merge without the normal repository/governance decision.

## The target loop

The intended long-term loop is:

`GPT research/review → UberBond durable task → Claude sandbox engineering → actual Git evidence → deterministic verification → UberBond durable artifact/result → GPT adversarial review → bounded repair if needed → verified local candidate`

Then and only then may separate governance consider promotion/canary/economic tests.

That is the machine we are building. Do not replace it with a looser chatbot ping-pong loop.
