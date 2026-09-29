# Jev Hyperreflex

Status: architecture doctrine. Jev is a replaceable System-One supplier, not sovereign reasoner.

## Core role

Jev exists to make semantic micro-decisions cheap enough to place everywhere.

It does not exist to replace the Crown on novel reasoning.

```
Crown discovers
 -> semantic decomposition
 -> Jev shadow
 -> paired evaluation
 -> certified reflex
 -> stable exact structure
 -> code
```

## Primitive mapping

### Noul

Use for bounded yes/no-like semantic probability:

- is this evidence relevant?
- does this claim contradict current evidence?
- is another search warranted?
- is this branch still plausible?
- did the task leave the certified region?
- is Crown escalation required?

### Choice

Use for bounded selection:

- which worker should run next?
- which tool should be used?
- which hypothesis deserves another branch?
- which task class applies?
- which routing policy candidate is best?

### Score

Use for bounded ordered judgments:

- evidence sufficiency;
- novelty;
- disagreement severity;
- materiality;
- relevance;
- expected value of another worker;
- drift severity.

## Decision bundling

Prefer one shared state and many typed questions.

Bad:

```
same state -> Jev question 1
same state -> Jev question 2
same state -> Jev question 3
...
```

Preferred:

```
shared state
 -> many Noul / Choice / Score questions
 -> one structured semantic telemetry packet
```

Metric:

```
useful typed decisions per Jev input token
```

## Jev Decision Tensor

For each mission state, maintain a structured semantic vector:

```
novelty
uncertainty
stakes
reversibility
evidence sufficiency
worker disagreement
counterexample strength
branch viability
cache equivalence candidate
context relevance
tool necessity
Crown necessity
model suitability
reasoning-effort proposal
drift probability
```

This tensor is telemetry, not truth.

## Jev as interrupt controller

The Crown should not poll the world continuously.

Jev can cheaply ask whether an event is important enough to wake deeper cognition.

```
event
 -> Jev semantic interrupt check
 -> ignore / queue / cheap worker / Crown
```

A certified interrupt circuit can prevent thousands of unnecessary frontier calls.

## Jev as Adaptive-N controller

```
2 workers
 -> Jev disagreement/value check
 -> stop OR +2
 -> Jev again
 -> stop OR +4
 -> ...
 -> Crown
```

Jev may always trigger more review.

It may suppress mandatory Crown review only inside a separately certified zero-loss routing domain.

## Jev Claim Firewall

Cheap worker outputs are atomized into claims.

For every claim, Jev may evaluate:

- factual vs non-factual;
- material vs immaterial;
- supported vs unsupported;
- duplicate vs novel;
- contradicted vs unchallenged;
- inside vs outside known applicability domain;
- Crown review required vs not required.

Output:

```
cheap/stable
 -> exact reuse / bounded reflex / discard duplicate

material unresolved
 -> adversarial attack
 -> Crown
```

## Jev Context Gate

Never silently delete information because Jev thinks it is irrelevant.

Instead classify context:

```
HIGH
 -> inline

MEDIUM
 -> compact exact extract or direct reference

LOW
 -> artifact-addressed, retrievable

UNCERTAIN
 -> preserve
```

Lossy summarization has no authority without separate zero-loss proof.

## Jev Cache Gate

Exact cache reuse can be authoritative when request and relevant source-state identities match.

Semantic similarity is only a candidate signal.

Jev may propose:

```
this state appears equivalent to certified state X
```

but semantic-cache authority requires independent certification.

## Jev Branch Killer

For each exploration branch:

- premise falsified?
- dominated by another branch?
- evidence already sufficient to terminate?
- expected new information near zero?
- outside mission?
- duplicate of an existing branch?

If safe, terminate early.

Preserve why the branch died in Negative Knowledge.

## Jev Error-Correlation Sensor

When several models agree, ask whether the agreement is genuinely independent.

Signals:

- same source dependence;
- same unsupported premise;
- same reasoning structure;
- same model lineage;
- same failure map;
- same benchmark blind spot.

The swarm should maximize independent information, not votes.

## Jev Tool Gate

For a bounded tool set:

- does another tool call have expected value?
- which read-only tool is best?
- is the result relevant?
- did the tool return contradictory evidence?
- should a failed tool be retried?
- has the tool result invalidated a branch?

Consequential tool actions remain governed separately.

## Jev Output QA Tripwire

After Crown or swarm output:

- required sections addressed?
- evidence refs present?
- contradiction with verified state?
- unsupported confidence?
- outside applicability domain?
- another Crown pass warranted?

Jev can trigger **more** review freely.

It cannot declare a novel uncertain result safe merely because its own confidence is high.

## Jev Circuit Passport

Every promoted circuit should carry:

```
circuit_id
version
purpose
task_class
input_schema
output_schema
applicability_domain
Crown_reference
Crown_revision
paired_evaluation_set
paired_regressions
false_positive_record
calibration_record
evidence_window
drift_detector
dependencies
supersedes
superseded_by
last_revalidated_at
promotion_state
```

## Promotion lifecycle

```
PROPOSED
 -> SHADOW
 -> CALIBRATION
 -> ZERO_LOSS_CANDIDATE
 -> CERTIFIED_BOUNDED_REFLEX
 -> DETERMINISTIC_CANDIDATE
 -> CODE
```

At any point:

```
DRIFT / NOVEL STATE / FAILED REPLICATION
 -> FREEZE
 -> DECOMPILE
 -> CROWN
```

## Shadow Crown audit

Even certified circuits should receive random or policy-selected shadow audits.

Compare:

```
Jev decision
vs
current Crown decision
vs
observed reality outcome
```

A meaningful divergence freezes the circuit until reviewed.

Crown succession should reopen high-value circuits to shadow.

## Never ask Jev to do what code does better

Use code for:

- arithmetic;
- exact comparisons;
- date/time computation;
- cryptographic identity;
- schema validation;
- deterministic policies;
- database retrieval;
- exact string matching;
- permission enforcement.

Jev is for fuzzy bounded semantics.

## Never ask Jev to do what the Crown does better

Use Crown for:

- new conceptual territory;
- unresolved multi-hop reasoning;
- deep scientific synthesis;
- novel strategic framing;
- ambiguous problems without bounded labels;
- high-stakes disputes outside certified circuits.

## Economic metrics

Track:

```
Jev decisions / dollar
Jev decisions / state ingestion
Crown calls avoided / Jev dollar
Jev circuit lifetime
Jev circuit decompilation rate
Jev false-negative escalation misses
Jev false-positive over-escalation rate
reference cost avoided by circuit
```

The north-star Jev metric is not raw call volume.

It is:

```
verified frontier-quality work enabled per Jev dollar
```
