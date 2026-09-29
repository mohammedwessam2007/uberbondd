# Open Router Cognitive Arbitrage Vault

Status: **FOUNDER APPROVED DOCTRINE + RECOVERY VAULT + PRE-LIVE EMPIRICAL PROOF**

This folder is the durable home for UberBond's cloud-only intelligence-per-dollar program.

It exists because the conversation that produced the design became too large and sluggish. A future session must be able to recover the architecture from Git rather than reconstructing it from memory.

## Founder intent

The goal is not "good AI for cheap."

The goal is:

```
FIRST: identify the strongest verified intelligence commercially available for the task.
THEN: obtain equal-or-better finished-work quality for the lowest achievable all-in cost.
```

Formal objective:

```
min Cost(A)
subject to Quality(A) >= strongest_verified_market_quality(task_class)
```

Quality is fixed first. Cost is optimized underneath it.

The founder's informal framing is "number-one AI abuser": aggressively exploit lawful cloud access, model markets, caching, batching, Jev/System-One reflexes, deterministic code, heterogeneous subagents, and every safe orchestration advantage so that a tiny budget can command as much frontier-quality useful work as possible.

## Absolute quality law

```
QUALITY_NEVER_PAYS_FOR_COST_SAVINGS
MAX_QUALITY_DELTA = 0
```

If the monthly budget is exhausted:

```
QUEUE / DEFER / BATCH / WAIT
```

Never:

```
USE_A_WEAKER_FINAL_BRAIN_BECAUSE_IT_IS_CHEAPER
```

Latency, throughput, and queue depth may degrade before quality.

## Physical setup

```
MOHAMED'S IPAD
     |
     v
TYPINGMIND
interactive cockpit only
     |
     v
OPENROUTER
cloud model market
     |
     +--> current Frontier Crown / Pantheon
     +--> cheap heterogeneous workers
     +--> Jev / System-One
     +--> future models
     |
     v
UBERMIND DOCTRINE + EVIDENCE + ROUTING
```

No local GPU is required.
No local model is required.
No workstation inference farm is required.

TypingMind is the human-facing cockpit. It is not the brain.

For unattended 24/7 work while TypingMind is closed, UberBond's existing cloud worker may execute authorized queues, retrieval, Jev circuits, cheap exploration, tests, artifact preparation, and deferred frontier jobs. No second human-facing UI is required.

## 24/7 meaning

"Running 24/7" means the organism is continuously alive and can monitor, queue, retrieve, test, compare, crystallize, and wake inference when justified.

It does **not** mean every model continuously emits tokens.

Persistent agents should behave like OS processes:

```
sleep when there is nothing valuable to do
wake on events / queue / uncertainty
use the cheapest sufficient mechanism
escalate only when required
```

This distinction is essential to the $30/month target.

## The cognition stack

```
EXACT / DETERMINISTIC?
       |
      YES --> CODE / DATABASE / RETRIEVAL
       |
      NO
       v
BOUNDED FUZZY SEMANTIC JUDGMENT?
       |
      YES --> JEV / SYSTEM-ONE
       |
      NO
       v
GENERATIVE SEARCH / DIVERSE EXPLORATION?
       |
      YES --> CHEAP HETEROGENEOUS SWARM
       |
      NO / STILL UNRESOLVED
       v
FRONTIER CROWN / PANTHEON
       |
       v
REALITY COURT
       |
       v
REUSABLE?
       |
      YES --> JEV CIRCUIT --> STABLE --> CODE
      NO  --> CROWN NEXT TIME
```

## Moving Frontier Crown

No model receives permanent loyalty.

The Crown is:

```
F*(t) = argmax_m verified_quality(model_m, task_class_t)
```

A new model enters quarantine, runs fresh hidden tasks, competes in a task-class Arena, and takes a Crown/Pantheon role only when evidence supports it.

A frontier improvement raises UberMind's quality floor rather than making the architecture obsolete.

## Practical interactive sequence

For important work in TypingMind:

```
1. Crown produces an independent baseline.
2. Minimum diverse cheap workers independently explore.
3. Jev/control layer classifies disagreement, evidence gaps, novelty, and value of more compute.
4. Adaptive-N expands only around uncertainty.
5. Falsifier / Framebreaker / Counterfactual / Evidence Hunter attack surviving claims.
6. Minority hypotheses are preserved.
7. Adversarial Synthesis creates an exact dispute dossier.
8. Only unresolved atoms and evidence references reach the Crown.
9. Crown performs final adjudication.
10. Stable result is compared against the independent Crown baseline.
11. Reality outcomes feed calibration and crystallization.
```

Majority vote never outranks evidence.

## The $30 doctrine

Accepted initial hard target:

```
ALL-IN MONTHLY COGNITION BUDGET = $30
```

Initial conceptual allocation:

```
Jev Hyperreflex                   $2
Cheap heterogeneous swarm        $6
Frontier Crown                  $16
Second Crown / specialist         $4
Fees + uncertainty reserve        $2
                                ----
                                 $30
```

This allocation is not permanent. The controller reallocates from live receipts.

The desired outcome is not "30 dollars buys 30 dollars of tokens."

The desired outcome is:

```
30 dollars actual spend
  -> hundreds / thousands of dollars of direct-frontier reference-equivalent work
  -> only if matched finished-work quality is equal or better
```

Reference-equivalent compression factor:

```
compression_factor =
  cost_of_strongest_verified_baseline_doing_matched_work_directly
  /
  actual_all_in_ubermind_cost
```

Research ladder:

```
10x -> 25x -> 50x -> 100x -> 250x -> 500x -> 1000x
```

These are targets, not current claims.

## Why Jev matters

Jev/System-One is not the sovereign reasoner.

It is the semantic nervous system.

Use it for abundant bounded judgments:

```
routing
relevance
evidence sufficiency
contradiction
claim materiality
novelty
agent/model selection
adaptive-N
stopping
branch killing
minority preservation
context priority
cache candidate admission
tool selection
search-again
output QA tripwires
drift
Crown escalation
```

Do not use it for:

```
arithmetic
exact date math
exact database facts
deterministic comparisons
novel unresolved multi-hop reasoning
```

Confidence is a routing signal, never proof.

## Crown -> Jev -> Code flywheel

Every expensive Crown call should produce two things:

1. the present answer;
2. reusable cognitive capital.

Post-Crown extraction:

```
What was novel?
What rule was discovered?
What conditions make it valid?
What invalidates it?
Can fuzzy parts become typed Jev decisions?
Can exact parts become code?
What tests establish equivalence?
What drift signal must decompile it?
```

Flywheel:

```
CROWN THINKS ONCE
      |
      v
JEV EXECUTES THE BOUNDED REFLEX MANY TIMES
      |
      v
STABLE STRUCTURE BECOMES CODE
      |
      v
NEW / DRIFTED STATE RETURNS TO CROWN
```

## New compression upgrades preserved in this vault

Beyond the earlier canon, this folder adds:

### Cognitive Multicast

Many agents often need the same unresolved semantic fact.

Do not ask the Crown separately for each agent.

```
many local disputes
 -> normalize
 -> deduplicate
 -> cluster by semantic dependency
 -> one Crown adjudication
 -> multicast result to every dependent agent
```

New metric:

```
dependent_agent_decisions_resolved_per_Crown_call
```

### Crown Call Coalescing

Before a frontier call, hold compatible unresolved atoms for a short bounded window and combine them into one adjudication packet when doing so does not increase context risk or latency beyond mission policy.

This is analogous to database write coalescing and network packet batching.

### Common Semantic Subexpression Elimination

If tasks A, B, and C all depend on the same proposition, solve that proposition once.

Maintain a content-addressed semantic dependency DAG.

```
task A --task B ----> proposition P17 -> one Crown decision -> all consumers
task C --/
```

### Crown Thought Capital Ledger

Every Crown call receives a capital record:

```
cost
task classes benefited
new invariant discovered
Jev circuits spawned
code paths spawned
future Crown calls avoided
reference cost avoided
drift events
lifetime ROI
```

We want expensive thought to behave like capital expenditure rather than recurring rent.

### Negative Knowledge Cache

Preserve not only what worked, but what failed and why.

Do not repeatedly pay models to rediscover:

```
dead hypothesis
bad source
unsupported causal claim
known incompatible tool
known model failure mode
known non-working prompt topology
```

Negative knowledge must be versioned and invalidated when conditions change.

### Error Portfolio Optimizer

Do not select cheap workers purely by benchmark score.

Prefer workers whose errors are less correlated.

The objective of a swarm is not model count. It is:

```
independent useful information per dollar
```

A five-family portfolio can dominate fifty near-duplicate agents.

### Shadow Router Tournament

Every production route can have cheap, zero-authority shadow alternatives:

```
production route
vs
Jev proposal
vs
OpenRouter auto/router proposal
vs
learned internal proposal
```

Only observed outcomes and sealed comparisons can promote a shadow policy.

### Value-of-Information Compute Auction

Every extra worker or tool call should compete on expected information value.

Question:

```
Is the expected reduction in decision uncertainty worth the marginal cost and delay?
```

Jev can propose this cheaply, but uncertain suppression of Crown review remains prohibited without zero-loss certification.

### Frontier Output Minimizer

The Crown should not rewrite entire artifacts when only three claims changed.

Preferred Crown outputs:

```
ACCEPT
REJECT
PATCH
changed claims
exact decision boundary
escalation condition
```

Cheap or deterministic assembly may construct the final artifact only where quality is preserved.

### Decision-DAG Memoization

Cache decision nodes, not just whole answers.

A large task may contain 100 semantic decisions, of which 83 are already certified and unchanged.

Recompute only the 17 invalidated nodes.

This is incremental compilation applied to cognition.

### Semantic Circuit Library

Certified Jev circuits are indexed by:

```
task class
input schema
applicability domain
Crown reference
evidence window
accuracy/calibration record
drift detector
dependencies
supersession lineage
```

A circuit is reusable only inside its certified domain.

### Frontier Succession Revalidation

When a stronger Crown appears, high-value circuits re-enter shadow against the new Crown.

This lets old compiled cognition inherit improvements from future models.

## Failure policy

Unknown stays unknown.

Never claim:

- global number one without evidence;
- frontier equivalence without paired trials;
- $30 produces thousands of dollars of reference compute until measured;
- Jev is superior merely because it is cheap;
- a model is permanently the Crown;
- 24/7 means unlimited novel frontier thought.

## Scoreboard

Track at minimum:

```
all-in spend
reference-cost equivalent
compression factor
finished tasks / artifacts
paired quality regressions
Crown calls
Crown fresh input tokens
Crown cached input tokens
Crown output/reasoning tokens
Crown calls avoided
Crown decisions multicast
Jev decisions
Jev input tokens
Jev shadow circuits
Jev certified circuits
Jev decompilations
cheap swarm calls
average adaptive N
model-lineage diversity
branches killed early
negative-knowledge hits
exact cache hits
prefix-cache hits
decision-DAG cache hits
artifact-reference token savings
deterministic paths crystallized
Crown Thought Capital ROI
reality drift events
Crown successions
founder minutes
```

## Recovery order

A future chat that needs this subsystem should:

```
1. refresh current main
2. read AI_START_HERE.md
3. read AGENTS.md
4. read docs/UNIVERSAL_CONTEXT_PROTOCOL.md
5. recover Total Brain / Master Memory / Current Handoff
6. read open router/README.md
7. read open router/CANON_SNAPSHOT_2026-09-29.json
8. read open router/ARCHITECTURE.md
9. read open router/JEV_HYPERREFLEX.md
10. read open router/ECONOMICS_AND_SCOREBOARD.md
11. read open router/TYPINGMIND_AND_24_7.md
12. refresh live model/pricing/Crown evidence
13. continue from activation and empirical proof
```

Do not restart from model selection.

Do not replace TypingMind with another interactive UI unless the founder explicitly asks.

Do not turn the $30 target into a lower-quality target.

## Canonical next frontier

```
PLUG IN
 -> RUN LIVE TASKS
 -> RECORD REAL COST / TOKEN / QUALITY RECEIPTS
 -> CROWN VS UBERMIND PAIRED TESTS
 -> SHADOW JEV
 -> CERTIFY BOUNDED CIRCUITS
 -> COGNITIVE MULTICAST
 -> CROWN CALL COALESCING
 -> DECISION-DAG MEMOIZATION
 -> CRYSTALLIZE TO CODE
 -> MEASURE REFERENCE-EQUIVALENT COMPRESSION
 -> MUTATE FROM EVIDENCE
```

Final invariant:

> Highest verified market intelligence, minimum achievable all-in price, no intentional quality reduction. Crown thinks where novelty is irreducible, Jev governs abundant bounded semantic reflexes, code handles exact structure, and every reusable frontier thought is compounded across future work.
