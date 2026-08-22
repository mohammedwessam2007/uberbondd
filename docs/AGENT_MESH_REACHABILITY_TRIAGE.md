# Reachability triage: every `src/` module with no non-test importer

Method: for each `src/*.mjs`, search `src/`, `scripts/`, `api/`, `server.mjs`
and `worker.mjs` — everything except `tests/` — for an import of it. A module
reachable only from a test file is not reachable: the suite proves it behaves,
and proves nothing about whether anything can call it.

`agent-mesh-control-plane.mjs` and `chatgpt-relay-client.mjs` were found first
and wired before this sweep ran. The sweep then returned nineteen more modules
with no non-test importer. Two of those are now wired
(`agent-mesh-activation-gate.mjs`, `claude-code-sandbox-executor.mjs`), leaving
seventeen — every one of which is accounted for below, including
`agent-provider-execution.mjs`, which is unreferenced on purpose.

`node scripts/kilimanjaro-manifest.mjs` recomputes the list rather than trusting
this document.

## Resolved this pass

| Module | Was | Now |
| --- | --- | --- |
| `agent-mesh-control-plane.mjs` | UNREACHABLE | REACHABLE via `scripts/agent-mesh-tick.mjs` |
| `chatgpt-relay-client.mjs` | UNREACHABLE | REACHABLE via `agent-relay-adapter-factory.mjs` |
| `agent-autonomy-relay-adapter.mjs` | never passed to anything | passed as `compileRelayTask` |
| `agent-mesh-activation-gate.mjs` | UNREACHABLE | REACHABLE and **enforced** by the tick |
| `claude-code-sandbox-executor.mjs` | UNREACHABLE | REACHABLE as the `claude-code-sandbox` provider |
| `agent-provider-execution.mjs` | UNREACHABLE duplicate | marked SUPERSEDED, guarded by a test |

## Blocked, and precisely why

### `durable-claude-engineering-executor.mjs` → `claude-engineering-orchestrator.mjs`

Cannot be wired without building new infrastructure, which is out of scope.
`createClaudeEngineeringExecutor` requires five injected functions. Two have
real defaults in the module (`collectAgentGitSandboxChanges`,
`runSandboxVerification`). Three have **no implementation anywhere in the
repository**:

- `createSandbox`
- `destroySandbox`
- `enterVerificationMode`

Every test supplies its own stubs for these. Wiring the executor would mean
first writing real git-sandbox provisioning and teardown — new architecture,
not the connection of existing parts. Recorded as a known gap rather than
faked.

`agent-code-change-applier.mjs` is downstream of the same missing
provisioning: it applies a validated change set into a sandbox root that
nothing currently creates.

### `agent-evolution-wave.mjs`

Requires an injected, already-configured relay client and enqueues a task. The
relay client now has a factory, so this is wirable — but it is a self-upgrade
composition, and wiring the mesh's self-modification path in the same pass that
first made the mesh runnable at all is not a safe ordering. Left for a pass
where the newly-reachable mesh has been observed working first.

## Out of tonight's scope by the external-effect ledger

These are reachable-in-principle business modules whose only meaningful
execution path produces an external effect — a customer message, an outbound
send, a provider event. Tonight's external effect ledger is zero on every axis,
so they stay unwired and unrun. Not stale, not broken: out of scope.

- `outreach-automation.mjs`
- `outreach-provider-events.mjs`
- `outreach-upgrades.mjs`
- `lead-generation-benchmark.mjs`
- `lead-intelligence-v3.mjs`
- `ai-access-opportunity-registry.mjs`

## Operator and deployment tooling

Exercised by `npm run test:relay-safety` (150 tests) and invoked by operators
rather than by application code. "No importer" is the expected shape for these,
not a defect.

- `pending-relay-reconciliation.mjs`
- `relay-preview-proof.mjs`
- `relay-preview-runbook.mjs`
- `relay-shadow-binding.mjs`
- `relay-vercel-api-executor.mjs`
- `relay-vercel-api-request.mjs`
- `shadow-canary-contract.mjs`

## Re-running the triage

```sh
for f in src/*.mjs; do
  base=$(basename "$f")
  n=$(grep -rl "from '.*/$base'\|from './$base'" --include=*.mjs . \
        --exclude-dir=node_modules --exclude-dir=tests | grep -v "^./$f" | wc -l)
  [ "$n" -eq 0 ] && echo "$base"
done
```
