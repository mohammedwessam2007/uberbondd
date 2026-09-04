# UberBond Avengers Arsenal Runtime

Status: executable integration candidate

## Purpose

Turn UberBond's model, skill, tool and orchestration inventory into a bounded executable squad rather than a passive catalogue.

The runtime loop is:

`discover -> normalize -> prove callable -> bind identity/revision/rights/pricing -> benchmark -> route -> compile bounded DAG -> execute dependency-ready nodes -> fail over within the already-authorized roster -> adjudicate -> persist receipts -> learn -> search for a stronger replacement`

## Evidence classes

Do not collapse these classes:

- `RUNTIME_AVENGER`: a model/runtime profile that has passed listing plus an approved inference callability probe and exact identity binding.
- `PROJECT_SURFACE`: a repository-local skill or deterministic module callable through UberBond's current harness.
- `METHOD_AVENGER`: a method donor already composed into UberBond, such as Superpowers or Metaswarm. It does not imply a separately installed runtime.
- `OPTIONAL_RUNTIME_UNPROVEN`: software whose integration contract exists but whose host runtime has not been proven callable.
- `DISCOVERED_ONLY`: a newly observed model/tool/repository. Discovery creates neither approval nor execution authority.

ChatGPT, Claude Code and Codex are harness-level workers. Fable-style orchestration is a planner/adjudicator protocol. Local/open models are runtime workers. Optional external tools become runtime workers only after an explicit adapter and callability receipt exist.

## Commands

- `npm run avengers:doctor`
  - validates the bounded roster;
  - merges approved profile overrides without storing secrets;
  - classifies project/method/runtime capability truth;
  - optionally scans common loopback model sockets;
  - optionally performs approved zero-business-effect inference probes;
  - writes the resolved secret-free roster and readiness receipt.

- `npm run avengers:plan`
  - consumes the exact doctor roster;
  - compiles a bounded Fable-style DAG;
  - reuses UberBond's canonical model router for evidence-backed model selection;
  - records exact primary and fallback identities by node;
  - refuses stale benchmark evidence and non-callable required tools.

- `npm run avengers:tick`
  - consumes the exact plan and resolved roster;
  - executes only `NONE` / `LOCAL_PREPARATION` work;
  - runs dependency-ready nodes in bounded parallel batches;
  - falls back only across already-approved profiles;
  - records every attempted profile and provider call;
  - stops when a node exhausts allowed fallbacks.

## Multi-profile law

UberBond must not collapse every open model into one global `OPEN_MODEL_*` socket. Each profile binds:

- stable profile ID;
- runtime family;
- exact model identity;
- revision/digest evidence;
- trusted endpoint;
- API style;
- pricing evidence;
- rights/license evidence;
- task classes and squad roles;
- benchmark evidence;
- explicit activation and inference-probe approval.

Secrets are referenced only by environment-variable name.

Loopback HTTP is allowed for local runtimes. Remote HTTPS profiles additionally require explicit approval evidence (`remoteApproved`, `remoteApprovalRef`, `remoteApprovalVerifiedAt`) before they can enter the resolved roster.

A task packet never supplies an endpoint or credential.

## Local discovery

The discovery scanner may inspect bounded loopback endpoints for Ollama, vLLM, llama.cpp, SGLang, MLX-LM and TGI-compatible model-list surfaces. Discovery is observation only.

`visible model != configured profile != rights-cleared != benchmarked != callable != active`

No model is auto-downloaded and arbitrary downloaded model code is never executed by discovery.

## Routing

Avengers does not create a second permanent model-ranking constitution. The squad planner reuses UberBond's canonical model router and its fresh-evidence requirements. Routing only narrows the activation-permitted roster.

Stale or low-confidence evidence cannot become exploitation merely because a model has a famous name. New models may enter separate bounded research/benchmark flows, but discovery alone cannot make them production workers.

## Failover

Failure may move to the next member only when that fallback was already present in the plan and already passed the same activation, rights, callability and evidence gates. A provider outage does not widen authority.

## Authority

The Avengers runtime currently has no business-effect authority. It is an internal reasoning, research, coding, review and artifact-preparation execution layer.

It may not by itself:

- message customers or prospects;
- publish publicly;
- deploy production changes;
- change DNS or credentials;
- spend money;
- move money;
- perform KYC/legal attestations;
- manufacture customer/payment/acceptance/retention truth.

Capability never creates authority.

## Continuous evolution

Gamechanger, Open Model Universe, Capability Genome and the orchestration N+1 frontier continue to discover challengers. A challenger enters as evidence to evaluate, not as a new permanent dependency.

The desired future loop is:

`new release -> observe primitive -> prove rights/runtime -> task benchmark -> compare against current Avenger -> bounded canary -> promote/replace/degrade/revoke -> preserve donor mechanisms -> continue searching`

The Avengers are therefore a replaceable measured team, not a frozen 2026 model list.
