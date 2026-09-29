# 07 — 1000x Compression Lab

## Mission

Search for architectures that preserve the current frontier quality floor while reducing actual all-in cost.

Target ladder:

~~~
10x -> 25x -> 50x -> 100x -> 250x -> 500x -> 1000x
~~~

Targets are experiments, not claims.

## Orthogonal compression dimensions

### Call elimination
- exact cache;
- certified Jev;
- deterministic code;
- task-archetype reuse;
- duplicate branch killing.

### Fresh-input elimination
- stable-prefix caching;
- artifact references;
- exact deltas;
- evidence multicast;
- deterministic source slicing.

### Output elimination
- Crown returns verdict/patch instead of rewriting entire artifacts;
- cheap/deterministic machinery assembles the final artifact.

### Cheaper identical cognition
- Batch/deferred mode;
- cheapest verified same-model provider;
- cache locality.

### Better exploration efficiency
- pre-inference routing;
- adaptive N;
- error-diverse worker selection;
- branch stop-loss;
- counterexample-first search.

### Amortization
- Frontier Thought Bonds;
- Jev circuit compilation;
- deterministic compilation;
- archetype-level reuse.

## Experiment protocol

For every candidate:
1. freeze architecture before seeing holdout answers;
2. use fresh hidden tasks;
3. run direct current-Crown baseline;
4. run candidate architecture;
5. blind paired evaluation;
6. record task result, regressions, all token classes, tool spend, Jev spend, fees, wall time, founder time, and cache effects;
7. compute reference-cost equivalent;
8. reject any candidate with required-quality regression;
9. among survivors prefer lower all-in cost;
10. promote only with canonical evidence.

## Frontier Thought Amortization experiment

Baseline:
- Crown solves N recurring tasks independently.

Candidate:
- Crown solves representative novel archetypes;
- compiler extracts bounded decisions;
- Jev/code handles recurring instances;
- Crown sees out-of-domain cases only.

Measure:
- frontier calls avoided;
- frontier tokens avoided;
- paired regressions;
- reuse frequency;
- amortization half-life.

## Evidence Multicast experiment

Baseline:
- each worker independently retrieves context.

Candidate:
- one retrieval layer creates normalized evidence objects;
- every worker references them.

Measure duplicate retrieval eliminated, input tokens saved, source diversity retained, and final quality.

## Counterexample-First Crown experiment

Baseline:
- Crown sees raw worker transcripts.

Candidate:
- cheap workers falsify first;
- Crown receives candidate + strongest attacks + exact evidence + unresolved claims only.

Measure Crown input/output reduction and paired quality.

## Production-without-duplicate-baseline experiment

After a task-class architecture earns bounded zero-loss evidence:

Baseline production:
- direct Crown + candidate + final Crown.

Compressed production:
- certified pipeline only + randomized Crown shadow audits.

This is the bridge from impressive demos to sustained extreme compression.

## Continuous search

The lab never freezes permanently. Models, prices, cache systems, Jev versions, providers, and task distributions change. The optimum is a moving frontier.
