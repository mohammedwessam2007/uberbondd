# UberBond Expected-Success Cold Email Compiler V2 — 2026-09-28

Status: evidence-weighted synthesis + novel optimization architecture. It does not claim a universally guaranteed best email. It defines the format and selection algorithm that should maximize expected qualified-positive reply probability under current evidence and then improve from UberBond's own outcomes.

## Objective

Primary message objective:

maximize P(qualified positive reply | delivered, eligible prospect)

subject to:
- legal eligibility = 1
- suppression = 0
- sender health = healthy
- complaint/unsubscribe risk below internal limits
- claims supported by evidence
- no deceptive identity, fake urgency, or invented personalization

Secondary commercial objective:

maximize expected cleared contribution profit per delivered email.

## Core probability decomposition

For a prospect x and candidate email m:

P(QPR | x,m) ≈
P(delivery | route)
× P(relevant attention | x,m)
× P(problem recognition | x,m)
× P(offer desirability | x,m)
× P(reply action | x,m)
× P(qualification | reply,x)

A good copy line cannot repair a near-zero term upstream. Therefore target quality, timing, relevance, and offer quality dominate stylistic micro-optimization.

Expected commercial value:

EV(x,m) =
P(QPR|x,m)
× P(meeting|QPR,x)
× P(close|meeting,x)
× expected contribution profit
- expected research/compute cost
- expected sender-reputation cost
- expected compliance risk
- expected opportunity cost.

## Message-selection score

Before UberBond has enough causal outcome data, use an evidence-weighted prior:

UES = gate × (
0.18 ProblemEvidence
+ 0.14 RoleOwnership
+ 0.12 TriggerStrengthFreshness
+ 0.12 RelevanceSpecificity
+ 0.10 OfferUtility
+ 0.08 ProofSimilarity
+ 0.07 CTAEase
+ 0.06 Credibility
+ 0.05 MessageClarity
+ 0.04 SubjectFit
+ 0.02 Novelty
+ 0.02 ToneFit
- 0.10 CognitiveLoadPenalty
- 0.08 HypePenalty
- 0.08 CreepyPersonalizationPenalty
- 0.08 UnsupportedClaimPenalty
- 0.06 AskCostPenalty
)

The weights are initialization priors, not empirical constants. Replace them with calibrated coefficients from UberBond's own randomized outcome data as soon as sample size permits.

gate = 0 if legal/suppression/evidence/sender-health constraints fail.

## The format: EVIDENCE → CONSEQUENCE → PREWORK → MICRO-COMMITMENT

This is a four-sentence compiler, not a static template.

### Subject
2–5 words, plain buyer language, concrete problem/priority.
No clickbait, fake Re:, deceptive urgency, or generic marketing language.

### Sentence 1 — Specific verified evidence + reason-now
Pattern:
"I [checked/traced/compared/noticed] [specific object/workflow] at [company] and found [verified observation]."

Rules:
- first line should not be transferable to 100 other companies;
- prioritize direct problem evidence over decorative personalization;
- use fresh company/activity signal only when it changes relevance;
- for senior buyers prefer company/strategic context;
- for operators prefer workflow/task context.

### Sentence 2 — Consequence at recipient altitude
Pattern:
"For [role/function], that can mean [credible operational/strategic consequence]."

Altitude:
- C-suite: risk, growth constraint, missed objective, strategic cost;
- VP/Director: functional capacity, efficiency, conversion, risk;
- Manager: process friction, throughput, handoff, workload;
- IC: exact task burden, time, errors.

Rules:
- do not invent financial loss;
- if causal confidence is incomplete, use hypothesis language;
- use buyer vocabulary, not vendor jargon.

### Sentence 3 — Prework + proof + useful offer
Pattern:
"I already [mapped/tested/benchmarked] it and put [specific evidence/output] into [custom artifact]."

Offer families:
- one-page evidence map;
- teardown/audit;
- benchmark/peer comparison;
- diagnostic;
- custom short report;
- annotated screenshot;
- repair-order list.

Rules:
- genuinely customized;
- useful even if the prospect never buys;
- research/prework effort proportional to account value;
- proof should match problem/role more than logo prestige.

### Sentence 4 — Micro-commitment
Default:
"Want me to send it?"

Alternatives to test:
- "Worth sending over?"
- "Useful if I send the 1-pager?"
- "Want the screenshots?"
- "Should I send the repair map?"

Rules:
- one CTA;
- first touch normally asks for permission/interest, not a meeting;
- direct scheduling becomes available after demonstrated intent.

## Structural constraints

- default <=100 words;
- starting prior 51–100 words;
- default 3–4 sentences;
- one message = one idea;
- no company biography;
- no feature dump;
- no generic compliment;
- no irrelevant personal trivia;
- no unsupported ROI claim;
- no calendar link unless intent warrants it;
- readable without scrolling on mobile.

## High-value novelty layer

The compiler should generate 8–20 candidate messages per prospect, each changing only controlled strategy atoms.

Candidate axes:
- trigger mentioned vs trigger used only for selection;
- problem framing;
- consequence altitude;
- proof type;
- offer type;
- CTA wording;
- subject architecture;
- tone;
- word count.

Use a calibrated model to estimate P(QPR) for each candidate. Sample challengers using Thompson sampling or another constrained exploration policy so the system keeps learning instead of freezing around one local optimum.

Do not let the model optimize safety/legal gates away.

## Follow-up sequence

Touch 1: strongest evidence + strongest offer.
Touch 2: new evidence or screenshot.
Touch 3: relevant benchmark/peer comparison.
Touch 4: alternate consequence or stakeholder angle.
Touch 5: fresh trigger or alternative useful artifact.
Touch 6: concise close-the-loop.
Touch 7: only if marginal expected value remains positive and sender/buyer signals are healthy.

Never send "just bumping this." Every touch must add new information.

## Prospect gating

Before drafting, require:
1. ICP fit;
2. observable/problem evidence or strong trigger;
3. role owns/cares about consequence;
4. valid contact route;
5. legal/jurisdictional eligibility;
6. not suppressed;
7. sender route healthy;
8. offer can genuinely help.

If any mandatory gate fails, abstain.

## Buyer-state adaptation

Cold/no strong intent:
- offer asset;
- no direct meeting ask.

Medium intent/fresh activity:
- mention strongest context if useful;
- ask interest/permission.

High intent/replied:
- direct next step;
- schedule efficiently.

Executive:
- company/priority signal, strategic consequence, relevant benchmark.

Operator:
- workflow evidence, concrete friction, teardown/repair artifact.

## Mathematical learning loop

For each delivered message store:
- prospect/segment;
- sender route;
- all strategy atoms;
- evidence snapshot;
- exact copy;
- word count;
- subject class;
- offer class;
- CTA class;
- timing/trigger age;
- delivery;
- human reply;
- positive reply;
- qualified positive reply;
- meeting;
- show;
- opportunity;
- close;
- cleared revenue;
- negative/unsubscribe/complaint;
- compute/research cost.

Model:
logit(P(QPR)) = β0 + βxX + βmM + βxm(X×M) + random effects(segment, sender, time).

Use hierarchical partial pooling so small segments borrow strength from the global model without being forced into a universal template.

Promote a variant only after:
- sufficient sample;
- holdout replication;
- no sender-health regression;
- no complaint/unsubscribe regression;
- downstream outcomes not worse.

## Record-attempt protocol

For a world-class reply-rate attempt:
- use tightly homogeneous micro-cohorts;
- select only prospects with high problem-evidence scores;
- use 1:1 prework;
- keep sender volumes low enough to protect quality/reputation;
- count unique delivered truly-cold prospects as denominator;
- exclude bounces and automated replies;
- report total human reply, positive reply, qualified positive reply, meeting, and revenue separately;
- require replication on an independent cohort.

## UberBond current offer phenotype

Subject: lead handoff

I traced one of your home-service client lead paths and found three places where a booked-job lead can disappear between the form and follow-up.

I mapped the breaks and repair order in a one-page evidence sheet, with screenshots.

Want me to send it?

## Why this should outperform a static template

A static template optimizes wording.

This compiler optimizes:
prospect selection × timing × evidence × role ownership × problem framing × proof × offer × ask size × message structure × sender health × learning.

The mathematically expected winner is therefore not one sentence pattern. It is the candidate with the highest calibrated expected qualified-positive-reply probability for that exact prospect, under hard trust/compliance constraints.
