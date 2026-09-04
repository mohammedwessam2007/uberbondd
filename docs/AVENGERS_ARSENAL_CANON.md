# UberBond Avengers Arsenal

Status: **EXECUTABLE MULTI-MODEL / MULTI-CAPABILITY RUNTIME CANON**

North star: **risk-adjusted cleared contribution profit per founder minute**.

The Avengers layer exists to make UberBond's growing arsenal operational without turning a large registry into a large pile of fake callability claims.

## Durable loop

```text
frontier signal / local runtime / approved supplier
  -> discover
  -> normalize provenance
  -> resolve exact model/runtime/revision or capability identity
  -> resolve license/rights/cost/security
  -> prove runtime visibility
  -> prove inference/tool callability
  -> benchmark on held-out task classes
  -> admit to callable roster
  -> canonical evidence router selects role-specific primary + fallbacks
  -> Fable-style bounded DAG exposes dependency-ready work
  -> safe parallel execution
  -> independent review/adjudication
  -> durable execution receipt
  -> outcome updates benchmark/routing evidence
  -> Gamechanger / Capability Genome keeps searching for stronger replacements
```

A newly discovered model is a **candidate**, not an Avenger on active duty.

## Roster evidence classes

Every member must remain in one truthful state:

- `CALLABLE_NOW` — an exact runtime/model profile has passed model listing plus an actual structured inference probe and activation/rights gates.
- `MODEL_LISTED_NOT_INFERENCE_PROVEN` — the runtime advertised the model, but UberBond has not proven a successful identity-bound inference call.
- `CONFIGURED_DISABLED` / `ACTIVATION_NOT_APPROVED` / `RIGHTS_BLOCKED` — configured but intentionally outside the active roster.
- `PROJECT_SURFACE_DECLARED` — a repository-local skill/module exists and needs the compatible host to invoke it.
- `CALLABLE_VIA_UBERBOND_METHOD` — a method/protocol donor has been compiled into UberBond-native behavior and does not require its upstream runtime.
- `RUNTIME_PROOF_REQUIRED` — optional external runtime exists in the capability registry but this host has not proved it active.
- `REFERENCE/METHOD_ONLY` — useful mechanism or research donor, never falsely represented as a live executable supplier.
- `BLOCKED` — a named missing condition prevents use.

These classes may not be collapsed into one `installed=true` flag.

## Model Avengers

The runtime registry supports multiple simultaneous provider-neutral profiles rather than one global `OPEN_MODEL_*` socket. Supported runtime families inherit from Open Model Universe:

- Ollama
- vLLM
- SGLang
- llama.cpp
- MLX-LM
- TGI
- Transformers HTTP
- Diffusers HTTP
- Sentence Transformers HTTP
- custom OpenAI-compatible endpoints

Every active profile binds:

- stable UberBond profile id;
- runtime family;
- exact model id;
- exact revision/content identity evidence;
- endpoint;
- API style;
- task classes and roles;
- pricing or local infrastructure cost evidence;
- license/rights evidence;
- held-out benchmark evidence;
- secret **environment-variable name only**, never the secret value;
- activation and inference-probe approval.

Loopback HTTP is permitted for local runtimes. Remote HTTPS profiles must enter through the resolved-registry path with explicit approval evidence. Task payloads never supply endpoints or credentials.

## Tool Avengers

The external capability registry feeds the same roster, but execution semantics stay honest.

Examples:

- Find Skills — Claude project skill / discovery surface.
- Claude Code Setup — planning/audit method.
- Task Observer — Claude project skill / critic and self-improvement observation.
- Claude-Mem — optional runtime, only active when host proof exists.
- Headroom — optional runtime, only active when host proof exists.
- OmniRoute — optional routing runtime, never a second policy brain.
- Strix — optional security runtime with separate owned-target authority.
- Agent Reach — optional public-research adapter under source/policy gates.
- Fable — UberBond-native orchestration protocol is callable; upstream Fable runtime remains separately evidence-gated.
- Metaswarm — method donor for bounded swarm organization/adversarial review.
- Superpowers — method donor for TDD/debugging/verification discipline.

A Node-local model does not magically gain a Claude skill merely because both are in the roster. Harness-specific tools remain harness-specific until a dedicated safe adapter exists.

## Commands

```bash
# Discover common loopback runtimes and classify the current arsenal.
npm run avengers:doctor

# Also make bounded inference probes for profiles whose config explicitly
# approves inference probing.
npm run avengers:doctor:probe

# Compile the default bounded engineering squad from fresh evidence.
npm run avengers:plan

# Inspect the exact squad without model calls.
npm run avengers:dry-run

# Execute the plan through primary/fallback members.
npm run avengers:tick

# Focused hostile gate.
npm run test:avengers
```

`AVENGERS_MODEL_PROFILES_JSON` is the host-side profile overlay. It may contain endpoints and environment-variable **names**, but never credential values. Remote profiles require explicit approval evidence. Credentials remain in protected host environment variables referenced by `apiKeyEnv`.

## Routing law

Avengers does not invent another model-selection constitution. It uses UberBond's canonical model router:

- only `CALLABLE_NOW` model profiles enter routing;
- fresh held-out benchmark evidence is mandatory for exploitation;
- default benchmark maximum age is 30 days;
- unbenchmarked exploration is disabled in ordinary Avengers planning;
- routing narrows the already-authorized roster and cannot activate a withheld supplier;
- ranked evidence-backed alternatives become bounded fallback order.

If every candidate lacks fresh evidence, the mission blocks rather than exploiting a famous-but-stale model.

## Orchestration law

The squad compiles to the already canonical Fable-style graph:

- each node has role, purpose, dependencies, tools, acceptance tests and stop condition;
- only dependency-ready nodes may run;
- independent ready nodes may run concurrently, currently capped at four;
- provider failure may move to an evidence-backed fallback already present in the plan;
- graph digest mismatch or task tampering blocks before provider calls;
- planner/adjudicator does not implement merely because it planned;
- orchestration never creates authority.

## Local discovery law

`avengers:doctor` probes only a bounded allowlist of common **loopback** runtime sockets. It does not scan arbitrary remote networks.

Visible models are emitted as disabled `DISCOVERED_REQUIRES_EVIDENCE` candidate profiles. Local discovery does **not**:

- download weights;
- execute model repository code;
- infer license/commercial rights;
- infer revision from a friendly name;
- benchmark quality;
- activate the model.

Candidates must be reconciled with Open Model Universe / Capability Genome evidence before promotion.

## Failure and fallback

Fallback is not permission laundering. A fallback may be used only if it was already:

1. present in the same resolved registry;
2. `CALLABLE_NOW`;
3. eligible for the node task class/role;
4. supported by fresh evidence;
5. inside the same authority and cost ceilings.

Provider/model identity remains visible in every attempt receipt.

## Security invariants

- capability never creates authority;
- no secrets in registry, plan, mission or durable receipt;
- no arbitrary task-provided endpoint;
- no arbitrary downloaded model-code execution;
- no remote HTTPS profile without explicit roster approval evidence;
- no `listed model == callable model` shortcut;
- no stale benchmark exploitation;
- no planner-created permissions;
- no graph cycle or unknown dependency;
- no silent provider/model substitution;
- no production/customer/payment/DNS/public side effects from the Avengers layer;
- `lite/` remains protected.

## Continuous evolution

Gamechanger, Open Model Universe, Capability Genome, Fable N+1 and the orchestration frontier remain the upstream scouts. Avengers is the execution roster.

When a new model/tool appears:

```text
discover -> research candidate -> evidence -> callability -> benchmark ->
roster candidate -> bounded canary -> promote/compose/reject -> keep searching
```

The target is not to accumulate the most Avengers. It is to maintain the **minimum sufficient, best-measured, replaceable squad** for each mission while founder minutes trend toward zero.
