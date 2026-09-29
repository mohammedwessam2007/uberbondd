# 13 — Frontier Intelligence Virtual Machine

Status: ADDITIVE FRONTIER ARCHITECTURE / NOT YET EMPIRICALLY PROVEN  
Date: 2026-09-29  
Parent canon: `open router/`

## One-sentence invention

**Virtualize the strongest verified intelligence available in the market as a stable logical machine, then continuously compile its recurring cognition downward into cheaper semantic reflexes and deterministic execution without permitting the quality contract to weaken.**

The user should not have to care which physical model produced the answer any more than an application cares which physical memory cell held a byte.

The logical product is:

```
FRONTIER(task, state, quality_contract)
```

The physical implementation may be:

```
exact code
+ exact retrieval
+ cached proof artifacts
+ certified Jev circuits
+ cheap heterogeneous exploration
+ specialist tools
+ adversarial synthesis
+ one or more frontier models
```

The implementation is allowed to change continuously.

The required quality contract is not.

---

## 1. Why this is a different abstraction

Ordinary multi-model systems optimize calls.

This system optimizes **cognition as a compiled program**.

The primitive is no longer:

```
prompt -> model -> answer
```

It becomes:

```
intent
 -> quality-typed cognitive program
 -> optimizer passes
 -> heterogeneous execution
 -> proof-carrying result
 -> observed outcome
 -> profile-guided recompilation
```

Models become replaceable processors.

Jev becomes semantic branch prediction / bounded decision hardware.

Code becomes the exact execution substrate.

The Crown becomes the semantic exception handler for irreducible novelty.

Reality becomes the final settlement layer.

---

## 2. The Frontier Intelligence Virtual Machine

```
                         MOHAMED
                            |
                            v
                    INTENT + CONSTRAINTS
                            |
                            v
                 COGNITIVE FRONT-END
          task decomposition / archetype / stakes
                            |
                            v
             QUALITY-TYPED COGNITIVE IR
     claims / evidence / decisions / dependencies / rights
                            |
                            v
                  COGNITIVE OPTIMIZER
       constant fold / CSE / DCE / partial evaluation
       batching / multicast / locality / speculation
       adaptive-N / error portfolio / stop-loss
                            |
                            v
                 FRONTIER HYPERVISOR
        chooses processors without weakening quality
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
      CODE                JEV              CHEAP SWARM
  exact semantics     bounded semantics      exploration
        |                   |                   |
        +-------------------+-------------------+
                            |
                      unresolved IR
                            |
                            v
                     CROWN / PANTHEON
                  irreducible semantic novelty
                            |
                            v
                    COGNITIVE LINKER
        merges patches into one provenance-preserving result
                            |
                            v
                     REALITY COURT
                            |
                            v
                   PROFILE + RECEIPTS
                            |
                            v
                       JIT / AOT
          recurring frontier cognition compiles downward
```

---

## 3. Quality Type System

Every cognitive node carries a required quality type.

Initial type family:

```
Q_EXACT
    deterministically checkable

Q_CERTIFIED_BOUNDED
    bounded semantic decision with current zero-loss evidence

Q_FRONTIER
    requires strongest verified market reasoning for task class

Q_MULTI_FRONTIER
    requires independent frontier disagreement/adjudication

Q_REALITY_SETTLED
    requires external observation / executable test / human or world evidence

Q_UNKNOWN
    no safe lower-bound classification exists
```

Substitution law:

```
an execution backend may satisfy a node only if
its certified authority >= the node's required quality type
```

Therefore:

```
cheap model confidence cannot silently satisfy Q_FRONTIER
Jev confidence cannot silently satisfy Q_FRONTIER
majority vote cannot silently satisfy Q_FRONTIER
semantic similarity cannot silently satisfy Q_EXACT
```

Unknown escalates.

This turns the zero-loss doctrine from a slogan into a type-checking problem.

---

## 4. Cognitive Intermediate Representation

The CIR is model-independent.

A minimal node contains:

```
node_id
semantic_identity
task_archetype
operation
inputs
dependencies
source_state_digest
evidence_refs
claim_or_decision
required_quality_type
current_authority
uncertainty
stakes
reversibility
side_effect_class
applicability_domain
invalidators
freshness
selected_backend
cost_estimate
latency_estimate
reuse_count
observed_outcomes
drift_state
```

The system never needs to ask:

> Which model owns this workflow?

It asks:

> Which currently available backend can execute this CIR node while satisfying its type and policy at minimum all-in cost?

---

## 5. Cognitive instruction set

Candidate provider-neutral instructions:

```
EXACT(expr)
RETRIEVE(ref)
DIFF(a,b)
HASH(x)
VALIDATE(schema,x)

NOUL(question,state)
CHOICE(question,choices,state)
SCORE(question,scale,state)

EXPLORE(problem,portfolio)
FALSIFY(claim,evidence)
COUNTEREXAMPLE(claim)
DIVERSIFY(branches)
EVIDENCE(query)

CROWN(problem,quality_type)
CROWN_PATCH(nodes)
MULTICROWN(problem,independence_contract)

LINK(nodes)
VERIFY(result,tests)
SETTLE(result,reality_source)

CACHE(node)
INVALIDATE(node,reason)
DECOMPILE(node)
```

This is not intended to be the final instruction set.

The important move is that cognition becomes compilable against an explicit ABI instead of being hard-wired to vendor prompts.

---

## 6. Compiler passes

### 6.1 Constant folding

If a node is exact and its inputs are known, compute it with code now.

No model.

### 6.2 Common Semantic Subexpression Elimination

If multiple tasks depend on the same proposition under the same relevant source-state digest, adjudicate once.

Reuse everywhere authorized.

### 6.3 Dead Branch Elimination

If a premise is falsified or a branch cannot affect any live output, terminate it.

Preserve the death reason in Negative Knowledge.

### 6.4 Loop-Invariant Cognition Hoisting

If repeated iterations resend stable doctrine, evidence, schemas, or instructions, move them into stable cached/reference state.

Pay only for the changing delta.

### 6.5 Partial Evaluation

Resolve everything possible before the Crown wakes.

The Crown receives only irreducible unknowns.

### 6.6 Cognitive Vectorization

Bundle many compatible bounded decisions over shared state into one Jev evaluation.

Bundle compatible Crown atoms only when attribution and context remain lossless.

### 6.7 Evidence Multicast

Acquire a source once.

Normalize once.

Reference from every dependent worker.

### 6.8 Semantic Dead-Output Elimination

If generated prose is never consumed by a human or downstream semantic dependency, do not generate it.

Request structured patches/verdicts instead.

### 6.9 Branch Prediction

Use cheap/Jev evidence to predict the likely execution path.

Speculate only when fallback capacity is reserved.

A wrong prediction may waste money.

It may not force a lower-quality final result.

### 6.10 Incremental Recompilation

When evidence changes, invalidate only dependent semantic nodes.

Do not rerun a whole mission if 93% of its cognition remains valid.

### 6.11 Context Locality Scheduling

Cluster nonurgent work by shared immutable context, source set, task archetype, or Crown prefix so provider caches and shared evidence are maximally reused.

Urgency overrides locality.

Quality never does.

### 6.12 Frontier Residualization

Represent every task as:

```
task = certified_known_part + irreducible_frontier_residual
```

Only the residual is purchased at Crown prices.

The long-run target is to minimize expected residual size while preserving the quality type.

---

## 7. Zero-loss semantic rate problem

The research objective can be expressed as:

```
minimize expected cognition cost
subject to no intentional reduction in required final quality
```

A more revealing interpretation is:

**How little expensive semantic information must the current frontier contribute after everything already known, exact, reusable, or cheaply discoverable has been removed?**

This is a zero-intentional-loss semantic compression problem.

The system tries to spend frontier tokens only on semantic surprisal.

Repeated surprisal becomes structure.

Structure becomes a reflex.

Stable reflex becomes code.

---

## 8. Crown as semantic exception handler

The Crown is not the default CPU.

The Crown handles:

- novel task archetypes;
- unresolved multi-hop reasoning;
- failed lower-level verification;
- out-of-distribution states;
- important minority hypotheses;
- high-stakes ambiguity;
- drifted compiled circuits;
- conflicts between strong specialists;
- new model-market transitions.

The ideal mature hot path contains almost no Crown work.

The ideal cold path has unrestricted access to the Crown.

---

## 9. Cognitive cache hierarchy

```
L0  deterministic exact state
L1  exact content-addressed decision artifacts
L2  certified bounded Jev reflexes
L3  cheap specialist / heterogeneous exploration
L4  task-specific Crown
L5  independent second Crown / Pantheon
L6  reality settlement
```

A request climbs only as high as necessary.

A result descends only as low as evidence permits.

---

## 10. Quality escrow

Before attempting a cost-saving speculative path, reserve enough budget to execute the required fallback.

Rule:

```
never spend the rescue money on the experiment
```

If cheap prework burns toward the expected direct-Crown cost without shrinking unresolved semantic entropy, stop and buy the Crown.

This makes compression fail economically rather than epistemically.

---

## 11. Cognitive locality market

Time becomes another optimization dimension.

Each queued node has:

```
urgency
quality_type
context_affinity
evidence_affinity
batch_compatibility
cache_affinity
expected_future_reuse
```

The scheduler may delay nonurgent work to:

- share a Crown prefix;
- exploit provider Batch/deferred pricing;
- coalesce equivalent decisions;
- reuse freshly loaded evidence;
- amortize one frontier adjudication across many consumers.

This is temporal arbitrage without quality downgrade.

---

## 12. Error Portfolio Market

Do not buy five agents that fail the same way.

Track pairwise and conditional error correlations by task archetype.

Select a worker set that maximizes:

```
independent useful information gained
-------------------------------------
marginal all-in cost
```

Agreement from correlated lineages is discounted.

A cheap contrarian with independent failure modes may be more valuable than a stronger redundant worker.

---

## 13. Counterfactual Router Exchange

A router can become confidently wrong if it only observes the paths it chose.

Maintain shadow challengers.

Occasionally sample unchosen routes.

Estimate:

```
routing regret
missed better model
missed cheaper equivalent path
false escalation
false suppression
```

This is the exploration tax required to keep the optimizer from becoming trapped in its own history.

---

## 14. Cognitive Superoptimizer

The system should eventually search over entire cognition programs, not just models.

Mutation operators include:

- reorder retrieval and reasoning;
- change worker portfolio;
- change number of branches;
- change Jev questions;
- split/merge CIR nodes;
- move checks to deterministic code;
- modify Crown packet structure;
- change output granularity;
- add/remove a second Crown;
- alter cache/locality policy;
- change batch timing;
- change evidence acquisition order.

Every candidate faces a sealed task set.

Any required-quality regression kills it.

Among survivors, lower cost wins.

This is superoptimization of cognition under a quality contract.

---

## 15. Metamorphic quality tests

Ordinary benchmark tasks are insufficient.

Generate transformations that should preserve or predictably alter the answer:

- reorder irrelevant context;
- rename entities;
- perturb formatting;
- insert distractors;
- remove duplicated evidence;
- paraphrase the task;
- change nonmaterial details;
- split/merge equivalent task representations.

A compiled circuit that is correct only on the surface form fails.

This attacks benchmark gaming and brittle semantic caching.

---

## 16. Proof-carrying cognition packets

Every consequential result should be able to carry:

```
result
claims
evidence
provenance
quality type
backend identities
Crown revision
tests
counterexamples considered
known uncertainty
applicability domain
invalidators
cost receipt
drift expiry
```

The artifact is not merely an answer.

It is a transportable, auditable cognition object.

---

## 17. Cognitive garbage collection

Compilation creates state.

State can rot.

Periodically identify:

- stale Crown-derived decisions;
- expired evidence;
- unused circuits;
- dead task archetypes;
- superseded model assumptions;
- duplicated semantic nodes;
- negative knowledge invalidated by new reality.

Archive recoverably.

Do not let old optimization become hidden doctrine.

---

## 18. AOT + JIT cognition

### Ahead-of-time

Precompile known high-frequency archetypes before they arrive:

- exact parsers;
- fixed retrieval plans;
- Jev circuit candidates;
- cached immutable context;
- test harnesses;
- tool contracts.

### Just-in-time

Profile live missions.

Hot semantic call sites become compilation targets.

Cold, weird, novel states remain Crown-native.

This is a cognitive hot-path / cold-path architecture.

---

## 19. Frontier succession is recompilation

A new strongest model changes the logical machine's implementation baseline.

Therefore:

```
new Crown
 -> benchmark
 -> promote
 -> mark affected compiled circuits STALE_FOR_REVALIDATION
 -> shadow against new Crown
 -> preserve circuits that still satisfy the stronger quality contract
 -> decompile those that do not
```

The physical processors change.

The logical interface remains.

---

## 20. The stable product

The long-run product is not a particular model stack.

It is:

# FRONTIER INTELLIGENCE AS A VIRTUALIZED SERVICE

with this contract:

```
Give me the strongest verified market-quality result this task requires.

Use any lawful combination of current models, code, caches, tools,
semantic reflexes, and previously purchased cognition.

Minimize cost underneath the quality floor.

If the cheap path cannot prove it belongs here, escalate.

If the market frontier rises, raise the floor.

If compiled cognition drifts, decompile.

If reality disagrees, reality wins.
```

---

## 21. What would make this genuinely important

Not the diagram.

Not the terminology.

Evidence.

The architecture becomes scientifically interesting if repeated live trials show all of the following simultaneously:

1. final task quality tracks a moving strongest-market baseline;
2. direct frontier token share falls over time on recurring workloads;
3. cost compression increases as the system accumulates verified cognition;
4. new frontier models raise quality without requiring a rewrite of the user-facing system;
5. repeated cognition measurably migrates Crown -> bounded semantic policy -> Jev -> code;
6. routing and caching do not introduce paired regressions inside promoted domains;
7. quality failures trigger decompilation instead of being hidden by aggregate averages.

Until those receipts exist, this is a strong architecture hypothesis.

After those receipts exist, it becomes a new kind of compute system.

---

## Final law

```
DO NOT OPTIMIZE WHICH MODEL ANSWERS.

COMPILE THE COGNITION.

VIRTUALIZE THE FRONTIER.

PURCHASE NOVELTY ONCE.

AMORTIZE IT FOREVER WHEN EVIDENCE PERMITS.

RECOMPILE WHEN REALITY OR THE MARKET CHANGES.
```
