# KILIMANJARO zero-gap overnight report — 2026-08-22

Mission: reduce the gap between this repository and a trustworthy device-off
autonomous economic organism. Not by building more architecture — by converting
what exists from UNPROVEN to PROVEN, UNREACHABLE to REACHABLE, DUPLICATED to
CANONICAL.

## The finding the night turned on

`agent-mesh-control-plane.mjs` — the top of the cognitive bus, with twenty-six
modules underneath it — had **no importer outside `tests/`**.

No scheduler job. No worker handler. No npm script. No workflow. Nothing in the
repository could reach it.

And it was worse than unscheduled. `runAgentMeshCycle` requires two functions
it cannot build itself, and neither existed outside a test file:

- `adapterFactory` — the only implementation anywhere was `() => ({})`, a stub
  inside `tests/agent-mesh-control-plane.test.mjs`
- `compileRelayTask` — `compileRelayTaskFromIntent` was written, tested, and
  never passed to anything

The first time an entry point existed, the cycle returned exactly that:

```json
{ "status": "BLOCKED", "ok": false,
  "reasonCodes": ["adapter-factory-required", "relay-task-compiler-required"] }
```

`chatgpt-relay-client.mjs`, the only implementation of the transport shape the
pump requires, had no non-test importer either. Three complete, tested,
unreachable modules — and 1535 passing tests said nothing about any of it.

**A green suite does not distinguish "works" from "cannot be reached."** That is
the single most useful thing found tonight, and it generalises past this
repository.

## What changed

| Module | Was | Now |
| --- | --- | --- |
| `agent-mesh-control-plane.mjs` | UNREACHABLE | REACHABLE via `scripts/agent-mesh-tick.mjs` |
| `chatgpt-relay-client.mjs` | UNREACHABLE | REACHABLE via `agent-relay-adapter-factory.mjs` |
| `agent-autonomy-relay-adapter.mjs` | never passed to anything | wired as `compileRelayTask` |
| `agent-mesh-activation-gate.mjs` | UNREACHABLE | REACHABLE **and enforced** |
| `claude-code-sandbox-executor.mjs` | UNREACHABLE | REACHABLE as a third provider |
| `agent-provider-execution.mjs` | UNREACHABLE duplicate | SUPERSEDED, guarded by a test |

Three new modules, all connective tissue rather than new architecture:

- `scripts/agent-mesh-tick.mjs` — one finite invocation. Bounded, non-resident,
  cloud-neutral, disabled unless `AGENT_MESH_ENABLED` is exactly `true`.
- `src/agent-relay-adapter-factory.mjs` — the `adapterFactory` the control plane
  actually means: a memoized relay client per origin/target pair.
- `src/agent-model-executor-factory.mjs` — each worker's `modelExecutor` from
  its declared provider.
- `src/agent-mesh-activation-evidence.mjs` — the input the activation gate needs.

### Why two factories

`adapterFactory` reads like the thing that talks to a model. It is not — it is
the wire a compiled task travels over. I conflated the two on the first attempt
and built the wrong shape. They are now named apart, and the header of each
module says which is which, because the next person will make the same mistake.

## The gate that was not guarding anything

`agent-mesh-activation-gate.mjs` decides whether the mesh may call a model
provider at all. It was in the same state as everything else: complete, tested,
and called by nothing — because nothing ever built its evidence input.

An entry point with credentials configured would have called a provider with
nothing standing between it and the money.

It is now evaluated on every tick and enforced. Its four modes map onto worker
execution, because a worker tick is the only thing in a cycle that can call a
provider:

| `permittedMode` | Workers run |
| --- | --- |
| `NO_PROVIDER_CALLS` | none |
| `SYNTHETIC_ONLY` | none |
| `ONE_PROVIDER_CANARY` | one, on a canary-ready provider |
| `BOUNDED_CLOUD_REHEARSAL` | all configured |

Evidence comes from two sources kept deliberately apart. **First-hand** facts
the process checks itself (is a credential present, is pricing evidence
present) are always computed and never overridable. **Attested** claims it
cannot verify come from an operator JSON file. A file cannot upgrade a
first-hand fact — otherwise the evidence file becomes a way to talk the gate
into opening. There is a test for exactly that attack.

With no evidence file the verdict is `ARCHITECTURE_ONLY` / `NO_PROVIDER_CALLS`.
That is the intended resting state, not a failure.

## Device-off cognition without an API key

`claude-code-sandbox-executor.mjs` drives a local Claude Code CLI inside an
isolated sandbox and was, like the rest, unreachable. It is now the
`claude-code-sandbox` provider.

It needs no pricing evidence, because the CLI reports its own token usage and
total cost — the number comes from the tool that spent it, which is better
evidence than a hand-entered price. When the CLI reports no cost the executor
returns `UNCERTAIN` rather than zero, so a call whose spend is unknown never
looks like a free one.

**It is a local process, not free compute.** It consumes whatever Claude Code
account it is configured against, exactly like any other use of the CLI. No
part of this makes any subscription unlimited or bypassable.

It requires an OS isolation receipt attesting an ephemeral filesystem, no
mounted business credentials, no reachable production network, and
Anthropic-only egress. The executor validates every field and rejects a receipt
whose root does not match the configured one.

The activation gate scores only the two API providers, so a sandbox worker has
no canary readiness to look up and is never eligible under
`ONE_PROVIDER_CANARY`. Unknown reads as not-permitted. A test asserts it.

## One reachable way to spend money

`agent-provider-execution.mjs` implements the same reserve → invoke → commit
transaction as `agent-worker-runtime.mjs`, with the same uncertainty rule, and
had no importers. The runtime is canonical: it does everything the duplicate
does plus durable persistence, relay lease heartbeating, and execution records.

The duplicate is marked SUPERSEDED rather than deleted — it is the clearest
small statement of the compute-safety rule, and its tests pin that rule
independently. A test now fails if anything outside `tests/` imports it. Two
reachable implementations of "spend money" is the shape that produces a double
charge.

## The defect the new reachability exposed

Making the mesh reachable made a real bug reachable too, and finding it was
only possible because the path now exists.

`agent-autonomy-pump` dispatches a task to the relay, and only afterwards does
`agent-autonomy-job` persist the run carrying the `relayRef`. Everything between
those two lines is a window in which the relay task exists and the run does not
know it — a crash, an OOM, a container reclaim, or a failed snapshot write all
land in it.

`createGithubRelayTask` created a GitHub issue unconditionally. So the next tick
re-dispatched the same deterministic taskId and **a second issue appeared for
one task**. Two workers claim two issues, do the work twice, and with
provider-backed workers that is two charges.

Reproduced directly before fixing: same input twice, two issues, same `taskId`.

The transport is now idempotent on taskId against open, not-done relay issues,
and returns `ALREADY_QUEUED` — a distinct status, not a silent `QUEUED`, because
nothing was created and a receipt claiming otherwise is a lie an audit trail
carries forever. A taskId reused with different content is refused rather than
resolved to either version. A task that already completed and closed may be
dispatched again: deduplication must not become a permanent ban. A client that
cannot list issues is refused outright, because it cannot tell a first dispatch
from a retry.

One more refusal, for the case that is neither "duplicate" nor "no duplicate":
if the first page of open relay tasks comes back full, an unscanned page may
hold the duplicate, and that is *cannot tell*, not *none found*. It refuses with
`relay-duplicate-check-inconclusive-too-many-open-tasks`. Fifty concurrent open
relay tasks is far past any expected load, so in practice this never fires — but
reporting "cannot tell" as "none found" is precisely how a duplicate charge
would slip through.

The regression test drops the post-dispatch run on the floor exactly as a killed
process would and asserts one issue exists after two ticks. It fails against the
previous code — verified by reverting the fix and re-running.

## Gaps left open, and precisely why

**`durable-claude-engineering-executor.mjs` cannot be wired without new
infrastructure.** `createClaudeEngineeringExecutor` needs five injected
functions. Three have no implementation anywhere in the repository:
`createSandbox`, `destroySandbox`, `enterVerificationMode`. Every test supplies
its own stubs. Wiring it would mean first writing real git-sandbox provisioning
— new architecture, which this mission explicitly excludes. Recorded, not
faked. `agent-code-change-applier.mjs` is blocked behind the same missing
provisioning.

**`agent-evolution-wave.mjs` is now wirable but deliberately left.** It is the
mesh's self-upgrade path. Wiring self-modification in the same pass that first
made the mesh runnable is not a safe ordering.

**The 42 skipped tests are still skipped.** All 42 are gated on
`OMNIA_V9_TEST_DATABASE_URL` and are concurrency proofs — `FOR UPDATE SKIP
LOCKED`, lease contention, double-claim prevention. PGlite is available and is
real PostgreSQL, but serves one connection at a time; running these against it
would report guarantees that were never exercised. Classification:
EXTERNAL_DEPENDENCY, not stale. Declined deliberately.

**Nothing has been run against a live provider.** The mesh is reachable and
gated. It has not been observed doing real work, because doing so requires
credentials and an activation evidence file that do not exist tonight. Reachable
is not the same as proven-in-production, and this report does not claim it is.

## External effect ledger

| Axis | Count |
| --- | --- |
| Customer messages sent | 0 |
| Outbound sends | 0 |
| Purchases | 0 |
| Advertising spend | 0 |
| DNS changes | 0 |
| Credential changes | 0 |
| Payment / KYC changes | 0 |
| Customer mutations | 0 |
| Production consequences | 0 |
| Deployments | 0 |

`lite/` untouched. No provider was called. No money was spent.

## Completion manifest

`npm run manifest:kilimanjaro` emits a JSON manifest whose every count is
measured from the repository at the moment it runs — files syntax-checked, test
files in the deterministic set, `src` modules, and which of them still have no
non-test importer. Pass it a TAP output file to include the suite totals;
without one it reports `NOT_RUN` rather than guessing.

It is a script rather than a checked-in JSON file on purpose. A manifest typed
by hand drifts from the thing it describes, and a drifted manifest is worse than
none — it looks like evidence.

## Full reachability triage

`docs/AGENT_MESH_REACHABILITY_TRIAGE.md` accounts for every `src/` module with
no non-test importer — seventeen after tonight's wiring. Seven are operator
tooling, where "no importer" is the correct shape. Six are business modules
whose only meaningful execution path would produce an external effect, which
tonight's ledger forbids. The rest are named individually with the specific
thing blocking them.

## Verification

| Check | Result |
| --- | --- |
| `npm run check:syntax` | 359 files parse |
| `npm run test:deterministic` | 1597 tests, 1555 pass, 0 fail, 42 skipped |
| `npm run test:relay-safety` | 150 pass, 0 fail |
| `npm audit` | 0 vulnerabilities |
| `lite/` | unchanged |

One failure did occur during this pass, and it is worth recording: adding the
third provider broke a test I had written an hour earlier that asserted the
provider list exactly. That is the guard working. A provider can only be added
deliberately.
