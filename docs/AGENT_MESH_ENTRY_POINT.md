# Running the agent mesh

Status: **REACHABLE** as of this commit. Before it, it was not.

## What was wrong

`src/agent-mesh-control-plane.mjs` composes the autonomy pump and the model
workers into one bounded cycle. It is the top of the cognitive bus — twenty-six
modules sit underneath it, all implemented, all tested.

Nothing imported it outside `tests/`. No scheduler job, no worker handler, no
npm script, no workflow. The same was true of `src/chatgpt-relay-client.mjs`,
the only implementation of the relay transport the pump requires.

`runAgentMeshCycle` takes two functions it cannot build itself:

- `adapterFactory` — produces the relay transport (`createTask`, `readTask`)
- `compileRelayTask` — turns a TaskIntent into a canonical AgentTask

The only `adapterFactory` anywhere in the repository was `() => ({})`, a stub
inside a unit test. `compileRelayTaskFromIntent` existed in
`src/agent-autonomy-relay-adapter.mjs` and was never passed to anything.

So the mesh was not merely unscheduled. Had something called it, it would have
returned `BLOCKED` with `["adapter-factory-required",
"relay-task-compiler-required"]` — which is exactly what it did the first time
an entry point existed. A green test suite does not distinguish "works" from
"cannot be reached".

## What now exists

| Module | Supplies |
| --- | --- |
| `scripts/agent-mesh-tick.mjs` | the entry point; resolves both dependencies from the environment |
| `src/agent-relay-adapter-factory.mjs` | `adapterFactory` — a memoized `chatgpt-relay-client` per origin/target pair |
| `src/agent-model-executor-factory.mjs` | each worker's `modelExecutor`, from its declared provider |
| `src/agent-mesh-activation-evidence.mjs` | the input the activation gate needs to reach a verdict |

Two factories, easily confused, deliberately named apart: the **relay adapter**
is the wire a compiled task travels over; the **model executor** is the thing
that calls a model. The control plane needs both.

## Running it

```sh
npm run mesh:plan     # report configuration and readiness; touches nothing
npm run mesh:tick     # one finite cycle
```

`mesh:plan` reports whether the relay and each provider could actually be
driven, and names the blockers if not. It reports *presence* of a credential,
never a value.

One invocation pumps a bounded set of autonomy runs, ticks each configured
worker at most once, optionally pumps again to ingest fresh results, and exits.
There is no resident loop: anything that can run a command on a timer can drive
it, and none of them become load-bearing for the cognitive semantics.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | cycle completed, or the mesh is disabled (the normal resting state) |
| 1 | the script threw |
| 2 | the cycle was `BLOCKED`, or a declared worker could not be configured |
| 3 | the cycle ran and returned `DEGRADED` — something is uncertain |

A scheduler firing against a deliberately disabled mesh exits 0. That is not a
failure and must not look like one.

### Environment

| Variable | Effect |
| --- | --- |
| `AGENT_MESH_ENABLED` | must be exactly `true`; anything else is a no-op |
| `AGENT_MESH_RUN_LIMIT` | autonomy runs pumped per cycle (default 5, cap 25) |
| `AGENT_MESH_WORKERS` | JSON array of worker configs; default none |
| `AGENT_MESH_INGEST_AFTER` | `false` to skip the post-worker ingestion pump |
| `UBERBOND_RELAY_ENDPOINT` | https `.../api/agent-relay` |
| `UBERBOND_RELAY_TOKEN` | bearer credential for that endpoint |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | provider credential |
| `{OPENAI,ANTHROPIC}_INPUT_USD_PER_MILLION` | pricing, input side |
| `{OPENAI,ANTHROPIC}_OUTPUT_USD_PER_MILLION` | pricing, output side |
| `{OPENAI,ANTHROPIC}_PRICING_SOURCE` | where that pricing came from |
| `{OPENAI,ANTHROPIC}_PRICING_VERIFIED_AT` | when it was last checked |
| `{OPENAI,ANTHROPIC}_AGENT_ENABLED` | must be exactly `true` to call the provider |
| `CLAUDE_CODE_SANDBOX_ROOT` | sandbox working directory for the local provider |
| `CLAUDE_CODE_SANDBOX_ENABLED` | must be exactly `true` to run the local CLI |
| `CLAUDE_CODE_SANDBOX_ISOLATION_FILE` | JSON OS isolation receipt for that sandbox |
| `CLAUDE_CODE_EXECUTABLE` | override the `claude` binary name |

A worker in `AGENT_MESH_WORKERS` is JSON, so it cannot carry a function. This
is why the two factories exist: the tick script is where the transport and the
executor are resolved and attached, and it is the only reason a worker can be
configured from outside the process at all.

Example:

```sh
AGENT_MESH_WORKERS='[{"budgetId":"b1","targetAgent":"claude-code","workerId":"w1","provider":"anthropic","model":"..."}]'
```

## The activation gate

`src/agent-mesh-activation-gate.mjs` decides whether the mesh may call a model
provider at all. It was in the same state as everything else here: complete,
tested, and called by nothing — because nothing built the evidence input it
takes. An entry point with credentials configured would have called a provider
with no gate between it and the money.

`src/agent-mesh-activation-evidence.mjs` builds that input from two sources
that are deliberately kept apart:

- **First-hand** — facts this process checks itself: whether a credential is
  present, whether pricing evidence is present. Always computed, never read
  from a file, never overridable.
- **Attested** — claims it cannot verify: that a kill switch exists, that a
  capability was externally verified, that a canary receipt was produced.
  These come from the JSON file named by `AGENT_MESH_EVIDENCE_FILE`.

A file cannot upgrade a first-hand fact. If the file claims a credential is
present and none is, the process wins — otherwise the evidence file becomes a
way to talk the gate into opening.

Anything in neither source stays UNKNOWN, and UNKNOWN fails the gate.

| Situation | Result |
| --- | --- |
| no `AGENT_MESH_EVIDENCE_FILE` | `ARCHITECTURE_ONLY` / `NO_PROVIDER_CALLS` — the resting state |
| file named but missing | refused, exit 2 |
| file malformed or too large | refused, exit 2 |

A named-but-missing file is a refusal rather than a fallback to "no evidence":
a broken attestation must not produce the same outcome as never having written
one.

The gate's four modes map onto worker execution, because a worker tick is the
only thing in a cycle that can call a provider:

| `permittedMode` | Workers run |
| --- | --- |
| `NO_PROVIDER_CALLS` | none |
| `SYNTHETIC_ONLY` | none |
| `ONE_PROVIDER_CANARY` | one, and only on a canary-ready provider |
| `BOUNDED_CLOUD_REHEARSAL` | all configured |

Autonomy pumping is unaffected — it compiles and relays `LOCAL_PREPARATION`
tasks and calls no provider.

Withheld workers exit 3, not 0. A scheduler running happily forever while the
workers it was configured to drive never run once is the silent-failure shape
this entry point exists to remove. Remove the workers from the configuration
to get a clean 0 back.

## Providers

| Provider | Reaches a model by |
| --- | --- |
| `openai` | the OpenAI API, with a key and pricing evidence |
| `anthropic` | the Anthropic API, with a key and pricing evidence |
| `claude-code-sandbox` | a local Claude Code CLI inside an isolated sandbox |

The sandbox provider needs no pricing evidence, because the CLI reports its own
token usage and total cost: the number comes from the tool that spent it, which
is better evidence than a hand-entered price. When the CLI reports no cost the
executor returns `UNCERTAIN` rather than zero, so a call whose spend is unknown
never looks like a free one.

It is a local process, not free compute. It consumes whatever Claude Code
account it is configured against, exactly like any other use of the CLI.

It requires an OS isolation receipt from `CLAUDE_CODE_SANDBOX_ISOLATION_FILE`,
attesting an ephemeral filesystem, no mounted business credentials, no
reachable production network, Anthropic-only egress, and a typed evidence
reference. `claude-code-sandbox-executor` validates every field itself and
rejects a receipt whose `sandboxRoot` does not match the configured one, so a
stale or copied receipt cannot open a different sandbox.

The activation gate scores only the two API providers, so a sandbox worker has
no canary readiness to look up and is never eligible under
`ONE_PROVIDER_CANARY`. It runs only under `BOUNDED_CLOUD_REHEARSAL`. That is
the fail-closed reading of an unknown, and it is asserted by a test.

## Refusals are deliberate

**A provider without pricing evidence is refused.** Both a `_PRICING_SOURCE`
and a `_PRICING_VERIFIED_AT` are required alongside the numbers. Cost reported
from unsourced pricing is a number the system invented, and the compute ledger
would be quietly fictional.

**A worker whose provider cannot be configured fails the whole tick**, by name,
rather than being skipped. A worker the operator asked for and did not get is a
configuration error; a worker that silently does nothing is indistinguishable
from one that has no work.

**Everything is off by default.** `AGENT_MESH_ENABLED` gates the script,
`runAgentMeshCycle` defaults `enabled` to false independently, and each
provider executor requires its own explicit enable. Importing any of these
modules cannot start work.

**The cycle carries no business-world authority.** Every task it compiles is
`consequenceClass: LOCAL_PREPARATION`, and `businessEffectAuthority` is `NONE`.
That is a property of the modules underneath, not of this entry point.

## Proof

`tests/agent-mesh-entry-point.test.mjs` seeds a real autonomy run into a store,
runs a real cycle with the real `compileRelayTaskFromIntent` and the real relay
adapter factory over a stub `fetch`, and asserts the compiled task reached the
transport and the `relayRef` was persisted. It also asserts the cycle still
fails closed when a dependency is missing, so the wiring cannot be removed
without a test noticing.

Writing it found a second thing worth recording: the first version of that test
invented its own `externalEffectLedger` shape and the relay client rejected it.
The test now imports the real `ZERO_EFFECTS` constant. A stub that imitates a
contract instead of importing it will eventually disagree with it.
