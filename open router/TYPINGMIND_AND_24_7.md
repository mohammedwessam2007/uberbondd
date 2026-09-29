# TypingMind and 24/7 Operation

Status: founder-approved operating plan.

## Interactive cockpit

TypingMind is the primary iPad UI.

Its job is human interaction:

- prompt entry;
- model selection;
- multi-model comparison;
- agent/prompt presets;
- final Crown interaction;
- reviewing evidence and finished work.

TypingMind is not the cognitive authority.

UberMind doctrine determines which models, roles, quality gates, and escalation rules should be used.

## Minimal interactive stack

```
iPad
 -> TypingMind
 -> OpenRouter API key
 -> selected cloud models
```

No local model.
No GPU.
No laptop inference requirement.
No new custom chat UI.

## Interactive strict sequence

For consequential or difficult work:

```
A. Current Crown produces an independent baseline.

B. Cheap heterogeneous workers receive the same core problem independently.
   Start minimum diverse N.

C. If useful, assign distinct roles:
   - explorer;
   - researcher;
   - falsifier;
   - framebreaker;
   - counterfactual;
   - evidence hunter;
   - specialist.

D. Jev/control layer evaluates:
   - disagreement;
   - novelty;
   - evidence gaps;
   - branch viability;
   - value of another worker;
   - Crown escalation need.

E. Expand N only around unresolved uncertainty.

F. Produce an adversarial dispute dossier.

G. Crown receives its own baseline plus exact surviving attacks/evidence.

H. Crown changes its baseline only where independently justified.

I. Final answer is recorded with cost and quality receipts.
```

## Crown finalizer law

The finalizer prompt must implement these semantics:

- do not vote;
- do not average;
- preserve the strongest independent Crown baseline;
- treat swarm answers as hypotheses, evidence, attacks, and alternate frames;
- preserve minority hypotheses that survive scrutiny;
- explicitly resolve contradictions;
- change the baseline only where evidence/reasoning justifies it;
- retain the original baseline when the panel adds no verified improvement;
- surface uncertainty rather than manufacture certainty.

## Model sequence is dynamic

Never hard-code a permanent roster.

Maintain roles:

```
CROWN_GENERAL
CROWN_CODING
CROWN_RESEARCH
CROWN_LONG_CONTEXT
CROWN_MULTIMODAL
CROWN_TOOL_USE
CHEAP_EXPLORER_A
CHEAP_EXPLORER_B
CHEAP_EXPLORER_C
SPECIALIST_OPTIONAL
JEV_SYSTEM_ONE
```

Live model names fill these roles after current evidence/pricing refresh.

## 24/7 unattended mode

TypingMind is interactive only.

If the founder wants work to continue while the iPad is closed:

```
UberBond cloud worker
 -> persistent queue
 -> event-driven scheduler
 -> retrieval / tests / code
 -> Jev
 -> cheap exploration
 -> dispute packets
 -> Batch/deferred Crown checkpoints
 -> finished artifacts
 -> surface results in the founder workflow later
```

No second human-facing UI is needed.

## Night shift behavior

While the founder sleeps, prioritize cheap preparation:

- crawl authorized/public sources;
- retrieve relevant evidence;
- run code/tests;
- deduplicate artifacts;
- cluster claims;
- generate counterexamples;
- preserve minority hypotheses;
- update negative knowledge;
- build exact frontier-delta packets;
- coalesce compatible Crown questions;
- send nonurgent work through Batch/deferred same-model routes when authorized.

The objective is to make every expensive frontier call information-dense.

## No idle token burn

A 24/7 organism may have hundreds of logical agents but zero active model streams during idle time.

Agents are stateful processes.

```
queue empty -> sleep
event arrives -> wake relevant organs
uncertainty resolved -> sleep again
```

## Human friction target

The founder should ideally perform only:

- initial OpenRouter/TypingMind setup;
- account/credential actions;
- explicit spending authorization;
- consequential owner decisions;
- tasks that genuinely require personal intent.

Routine routing and orchestration should not be handed back to the founder.

## Interactive vs unattended truth boundary

TypingMind can be the complete human cockpit while UberBond's cloud runtime handles unattended work.

These are complementary.

Do not interpret the existence of the backend executor as a requirement to replace TypingMind.
