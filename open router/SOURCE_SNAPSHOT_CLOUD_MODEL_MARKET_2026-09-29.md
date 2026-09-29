> Recovery snapshot copied from `docs/UBERMIND_CLOUD_MODEL_MARKET_COMPRESSION_2026-09-29.md` at main `34abf0b651b07be43fc0898b9afa8419076d6c08`. Current main/source/runtime/live evidence outrank this snapshot.

# UberMind Cloud Model Market Compression — 2026-09-29

Status: **IMPLEMENTED PRE-ACTIVATION / CLOUD-ONLY / ZERO-LOSS QUALITY LAW PRESERVED**

## Objective

UberMind does not optimize for a favorite model.

It continuously treats the strongest verified model or task-specific frontier model as the moving Crown/Pantheon baseline and searches for the cheapest cloud computation graph whose finished work is not worse.

The law remains:

```
QUALITY FIRST
maxQualityDelta = 0
budget pressure may increase latency / queue depth / batching delay
budget pressure may NOT lower semantic quality
```

The current target operating budget is approximately **USD 20/month**, but this is a budget ceiling, not evidence that arbitrary volumes of novel frontier cognition can be delivered for USD 20. If the budget cannot buy the required frontier cognition, work queues.

## Cloud-only law

No local model is required.
No local GPU is required.
The founder's iPad is a cockpit, not an inference host.

Default transport:

```
iPad
  -> UberBond control plane
  -> UberMind quality market
  -> OpenRouter
  -> cloud model/provider market
```

Direct Anthropic/OpenAI/etc. transports remain optional donors when measured native Batch/Flex/cache economics or exact controls beat the market transport.

## Donor capabilities absorbed

### RouteMoA-style pre-inference pruning

`compilePreInferenceRoleAuction()` scores only evidence-backed worker candidates before inference and starts with a minimum diverse set.

This affects exploration cost only.
It grants zero semantic authority.

### CascadeDebate-style selective escalation

`decideAdaptiveExpansion()` grows N only when disagreement, uncertainty or evidence conflict remains.

Low-disagreement cheap workers may stop searching, but they still do not self-certify the final answer.

At the configured ceiling, the plan escalates to the Frontier Crown.

### Error-diversity preservation

Initial workers are preferentially drawn from different error-correlation groups / model lineages before redundant workers are added.

Consensus is not treated as truth.

### Adversarial Synthesis

`compileAdversarialSynthesis()` makes these first-class roles:

- FALSIFIER
- FRAMEBREAKER
- COUNTERFACTUAL
- MINORITY_PRESERVER
- EVIDENCE_HUNTER

The output is an unresolved proposition set plus disconfirming evidence and minority hypotheses.

Majority-vote authority: NONE.
Cheap synthesis authority: NONE.

### Frontier Delta Adjudication

`compileLosslessFrontierDeltaPacket()` sends only exact unresolved claims plus evidence/artifact references upward.

It does not authorize lossy summarization.
If the packet is too large, the planner refuses and requires artifact references instead of silently dropping context.

### Exact caching

`compileExactCacheDecision()` permits authoritative reuse only when the request digest AND source-state digest match exactly.

Semantic similarity is shadow-only.

### OpenRouter response caching

The canonical OpenRouter executor can opt an already exact/idempotent request into OpenRouter response caching with `X-OpenRouter-Cache: true`.

Eligibility is decided upstream, never inferred from semantic similarity.

### Prompt-cache locality

OpenRouter requests accept a stable `session_id` so provider stickiness can preserve warm provider caches.

The executor records whether a sticky session was requested.

### Provider price routing

OpenRouter transport supports:

- provider sort by price / throughput / latency;
- `max_price` ceilings;
- same-model provider fallback;
- ZDR requirement;
- data collection denied;
- exact parameter support required.

Model fallback is deliberately not sent by the executor.
A different model is a cognition change and must be selected by UberMind, not hidden inside provider failover.

### Dynamic market catalog

`observeOpenRouterCatalog()` ingests the live public model catalog and normalizes list pricing to USD per million tokens.

Catalog evidence is discovery/pricing evidence only.
It does not establish callability, exact reasoning mode, quality rank or production authority.

### Safe speculative execution

`compileSpeculativeReadOnlyPlan()` permits read-only, reversible prefetch/testing while frontier reasoning is running.

Messages, purchases, deployments, DNS writes, credentials, payments and production mutation are refused.

Speculation can save wall-clock time.
It cannot cancel required frontier adjudication.

### Online threshold optimization

`compileShadowEscalationThresholdCandidate()` allows cheaper escalation thresholds to be proposed and measured.

Every candidate is SHADOW_ONLY with no promotion authority until a fresh paired sealed evaluation and canonical zero-loss certificate exist.

### Batch/Flex/deferred compute

Existing `frontier-deferred-compute-planner.mjs` remains the canonical same-model deferred compute path.

Its law is preserved: model, revision and reasoning setting stay identical. Only price/latency may change.

### Jev / deterministic crystallization

Existing Noetic/Jev machinery remains downstream of canonical sealed zero-loss evidence.

Repeated cognition can become a bounded Jev reflex and then deterministic code only after zero-loss proof.

### Architecture search

Existing Architecture Lab and sealed tournament search model mixes, roles, topology and stop policy.

No candidate self-promotes.

## OpenRouter executor safety

`src/openrouter-agent-executor.mjs` is a first-class cloud executor.

It:

- never performs a call on construction/import;
- requires explicit enablement;
- requires a protected API key;
- requires verified per-model pricing before execution;
- accepts local-preparation work only;
- requests `data_collection: deny`;
- can require ZDR;
- can apply provider price ceilings;
- permits same-model provider failover;
- sends no model-fallback array;
- requires the returned model identity to exactly match the requested model;
- meters observed token usage;
- refuses actual cost above the reserved ceiling;
- never returns the credential in receipts.

## USD 20 monthly governor

`governMonthlyCognitionBudget()` has one behavior when a proposed call exceeds remaining budget:

`QUEUE_FOR_BUDGET_NOT_QUALITY_DOWNGRADE`

Permitted relief:

- queue;
- defer;
- Batch;
- wait for cheaper equivalent provider;
- exact-cache reuse;
- deterministic execution.

Forbidden relief:

- weaker model as final authority;
- lossy context dropping;
- skipping required frontier adjudication.

## One-plug resource set

Required new founder resource:

1. **One OpenRouter API key**
   - store as `OPENROUTER_API_KEY` in the protected runtime;
   - never commit it to Git;
   - never place it in public logs.

Required runtime settings:

```
OPENROUTER_AGENT_ENABLED=true
UBERMIND_MONTHLY_COGNITION_BUDGET_USD=20
OPENROUTER_PROVIDER_SORT=price
OPENROUTER_REQUIRE_ZDR=true
OPENROUTER_ALLOW_PROVIDER_FALLBACKS=true
```

Optional direct-provider credentials are not required for the first cloud market activation.

## Operator commands

Secret-free readiness:

```bash
npm run ubermind:cloud:doctor
```

Read-only live catalog observation:

```bash
npm run ubermind:cloud:catalog
```

Focused tests:

```bash
npm run test:ubermind:market
```

## Donor ideas intentionally NOT promoted

The deep-research report proposed or discussed several useful but quality-risky mechanisms.

They remain shadow-only unless they earn zero-loss proof:

- 1-2% non-inferiority margins;
- semantic-cache answer reuse;
- lossy small-model context summaries;
- low-tier final answers for "easy" tasks;
- self-reported confidence as authority;
- a small-model Jev/referee as final semantic judge;
- model substitution because it is cheaper.

UberMind's production contract remains stricter.

## Activation boundary

This code prepares the cloud market.

It has not:

- created an OpenRouter account;
- created or stored a credential;
- purchased credits;
- made a live model inference;
- established the current global Frontier Crown;
- proven the USD 20 target;
- promoted any cheap architecture as frontier-equivalent.

The next external action is intentionally tiny:

> Founder creates one OpenRouter API key, sets the monthly spend control, and stores the key in the protected UberBond runtime.

After that, UberBond can observe the live catalog and begin the fresh sealed quality/cost tournament without requiring local hardware.
