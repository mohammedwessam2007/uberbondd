# 06 — 24/7 Operation

## Meaning of 24/7

The organism is continuously available to observe, queue, retrieve, test, deduplicate, classify, prepare, benchmark, crystallize, and wake expensive cognition when justified.

It does not mean every model emits tokens continuously.

## Persistent logical agents

Agents behave like OS processes:
- state persists;
- queues persist;
- most agents sleep most of the time;
- inference wakes only on events, queued work, or uncertainty.

Hundreds of logical agents therefore do not imply hundreds of continuous API streams.

## Event-driven wake conditions

Examples:
- founder task;
- new evidence;
- scheduled revalidation;
- model-market update;
- provider price change;
- Jev drift tripwire;
- unresolved queue item;
- failed test;
- stale Crown evidence;
- new model release;
- Batch window;
- artifact completion.

## Information-value scheduler

For optional work, rank by:
- expected founder value;
- expected information gain;
- probability of changing a decision;
- time sensitivity;
- reuse potential;
- cost;
- latency;
- reversibility;
- Crown-cost avoidance potential.

Safety/authority constraints remain outside economic ranking.

## Night shift

~~~
events/backlog
 -> exact dedup
 -> retrieval/tools
 -> Jev triage
 -> cheap parallel exploration
 -> tests/falsification
 -> evidence normalization
 -> claim graph
 -> dispute dossier
 -> Batch/deferred Crown queue where allowed
 -> morning artifacts
~~~

## No pointless heartbeat

A fixed every-minute Jev call is not canon.

If nothing changed, spend nothing.

Prefer webhooks, deltas, queue events, freshness timers, and low-frequency watches only where needed.

The goal is always alive, not always billed.

## Price/time arbitrage

Flexible work may wait for:
- Batch;
- deferred/flex service tiers;
- identical-model cheaper provider routes;
- legitimately offered off-peak windows;
- warm cache locality.

Never evade quotas, farm accounts, or silently substitute weaker models.

## Failure behavior

Provider unavailable:
- same-model provider fallback if identity/quality contract is preserved;
- otherwise queue or use an equivalent verified Crown supplier.

Budget exhausted:
- queue.

Jev unavailable:
- deterministic fallback where exact;
- otherwise route upward.

TypingMind closed:
- unattended backend may continue only already-authorized cloud work.
