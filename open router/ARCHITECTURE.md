# Architecture

Status: design canon for the Open Router intelligence-per-dollar subsystem.

## 1. Objective

```
minimize all-in cognition cost
subject to final required quality >= strongest verified market frontier for the task
```

Cost never buys permission to reduce quality.

## 2. Layers

### L0 - Exact substrate

Use deterministic mechanisms before inference when the problem is exact:

- code;
- database queries;
- exact retrieval;
- hashes;
- diffs;
- parsers;
- formal tests;
- arithmetic;
- date/time computation;
- schema validation;
- content-addressed artifacts.

### L1 - Jev Hyperreflex

Use Jev/System-One for bounded semantic decisions:

- Noul;
- Choice;
- Score;
- routing;
- relevance;
- uncertainty;
- evidence sufficiency;
- contradiction;
- branch viability;
- stop/continue;
- Crown escalation;
- tool selection;
- cache candidate admission;
- drift alarms.

Jev has no sovereign reasoning authority by default.

### L2 - Cheap heterogeneous exploration

Use a minimum diverse set of low-cost cloud models for:

- independent solution attempts;
- hypothesis generation;
- falsification;
- code/test proposals;
- source discovery;
- counterexamples;
- alternate framings;
- minority hypotheses.

The worker roster is dynamic. Model lineage diversity matters more than raw agent count.

### L3 - Adversarial Synthesis Court

Convert worker output into a dispute structure:

- exact claims;
- evidence;
- attacks;
- contradictions;
- unresolved propositions;
- minority hypotheses;
- applicability boundaries.

Consensus alone has no authority.

### L4 - Frontier Crown / Pantheon

The current strongest verified model for the relevant task class receives:

- stable cached prefix where safe;
- exact artifact references;
- exact unresolved claims;
- strongest attacks;
- disconfirming evidence;
- requested adjudication.

The Crown should return a minimal verdict or patch when possible.

### L5 - Reality Court

Reality determines whether the result actually held.

Observed outcomes feed:

- calibration;
- failure maps;
- Jev shadow evaluation;
- routing evidence;
- capability promotion;
- decompilation.

### L6 - Crystallization

Repeated stable cognition moves downward:

```
Frontier discovery
 -> bounded semantic policy
 -> Jev shadow
 -> zero-loss certification
 -> Jev reflex
 -> deterministic candidate
 -> code
```

Any material drift moves upward again.

## 3. New Cognitive Arbitrage organs

### 3.1 Cognitive Multicast

One frontier decision should resolve every dependent consumer.

Process:

```
collect unresolved decisions
 -> normalize proposition identity
 -> detect equivalent semantic dependencies
 -> build one frontier packet
 -> adjudicate once
 -> publish signed decision artifact
 -> all authorized dependents consume artifact
```

Do not call the Crown once per agent when several agents are blocked on the same fact.

### 3.2 Common Semantic Subexpression Elimination

Represent mission reasoning as a dependency DAG.

Example:

```
Task A ----\
Task B ------> P17 -> Crown once -> D17
Task C ----/
```

If P17 has the same relevant source-state digest and applicability domain, D17 is reused.

This is compiler common-subexpression elimination applied to cognition.

### 3.3 Decision-DAG incremental recomputation

Whole-answer cache misses can still contain mostly unchanged cognition.

Represent a result as semantic nodes:

```
D1
D2
D3
...
D100
```

When source state changes, invalidate only dependent nodes.

If 83 remain valid, recompute 17.

Authority rules remain per-node.

### 3.4 Crown Call Coalescing

Nonurgent unresolved atoms may be held for a short bounded interval and merged into one Crown adjudication when:

- they share compatible context;
- merging does not create context dilution;
- delay remains within mission policy;
- authority boundaries remain separable;
- exact attribution can be preserved.

Coalescing is forbidden when bundling can obscure task identity, evidence, or consequence class.

### 3.5 Crown Thought Capital Ledger

Every frontier call receives a durable capital record:

```
call_id
Crown identity
task class
fresh input
cached input
output / reasoning
all-in cost
novel decisions
decision artifacts created
Jev circuits spawned
code candidates spawned
future calls avoided
reference cost avoided
dependent tasks benefited
drift / decompilation history
lifetime ROI
```

A call that only answers once is less economically valuable than a call that creates a reusable verified decision asset.

### 3.6 Negative Knowledge Cache

Store expensive dead ends with provenance.

Examples:

- falsified hypothesis;
- stale source;
- unsafe provider path;
- known model failure class;
- incompatible tool;
- failed orchestration topology;
- prompt structure that produces correlated errors.

Negative knowledge is versioned and invalidated when relevant state changes.

### 3.7 Error Portfolio Optimizer

Workers are selected as a portfolio.

Desired properties:

- high task-class utility;
- low marginal cost;
- low error correlation with already-selected workers;
- complementary tools/modalities;
- different training/model lineages when evidence supports diversity benefit.

Objective:

```
maximize independent useful information / dollar
```

not:

```
maximize number of agents
```

### 3.8 Value-of-Information Compute Auction

Each optional worker/tool/branch competes on:

```
expected decision value
expected uncertainty reduction
expected chance of finding a disconfirming fact
marginal cost
marginal latency
```

Cheap Jev decisions can propose the auction result.

They cannot suppress a required Crown review outside a certified routing domain.

### 3.9 Shadow Router Tournament

Run alternative routing policies without authority:

- UberMind current route;
- Jev proposed route;
- OpenRouter router proposal;
- provider-native route;
- learned internal route;
- fixed baseline.

Record counterfactual estimated cost and, where executable, paired outcomes.

Promotion requires fresh sealed evidence.

### 3.10 Frontier Output Minimizer

The expensive model should output only what requires expensive cognition.

Preferred response forms:

- ACCEPT;
- REJECT;
- PATCH;
- exact corrected claims;
- decision boundary;
- missing evidence;
- escalation condition.

Do not pay frontier output prices to repeat stable boilerplate.

### 3.11 Cross-task Crown batching

If ten queued missions ask materially identical frontier questions, create one shared adjudication.

The shared result must carry:

- exact proposition identity;
- source-state digest;
- applicability domain;
- Crown identity/revision;
- evidence refs;
- expiration/drift conditions.

### 3.12 Cognitive futures market

Classify work by urgency:

```
NOW
 -> realtime Crown only if required

SOON
 -> wait for provider/cache affinity or low-cost equivalent route

LATER
 -> Batch/deferred same-model cognition

BACKGROUND
 -> cheap swarm / Jev / retrieval / tests until frontier checkpoint becomes information-dense
```

Urgency can change price and latency.

It cannot change the required intelligence class.

## 4. Crown succession

Every candidate Crown must be treated as provisional.

```
new model
 -> quarantine
 -> fresh hidden tasks
 -> task-class benchmark
 -> paired comparison against incumbent
 -> promotion if evidence supports
 -> revalidate high-value compiled circuits
```

No permanent brand loyalty.

## 5. Multi-Crown Pantheon

One global model may not dominate every task.

Maintain task-class Crown roles where evidence warrants:

- general reasoning;
- coding;
- research synthesis;
- long-context;
- multimodal;
- tool use;
- formal/math;
- agentic execution.

The final system quality target is the envelope of the strongest verified market capability, not a favorite vendor.

## 6. 24/7 scheduler

Persistent logical agents may remain alive while inference sleeps.

Event sources:

- new user task;
- queue item;
- changed artifact;
- new evidence;
- source update;
- test failure;
- model release;
- provider price change;
- Jev drift signal;
- scheduled revalidation;
- pending Crown batch window.

Idle state should cost approximately zero inference.

## 7. Final invariant

```
NEW OR UNCERTAIN
 -> FRONTIER

BOUNDED + CERTIFIED
 -> JEV

EXACT + STABLE
 -> CODE

DRIFT
 -> FRONTIER
```
