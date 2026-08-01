# ELITE DUO FABLE FRACTION ENGINE V4

V4 keeps the complete 6,000+ file APEX corpus and adds a native Sonnet context-economy engine.

## Objective

Approach Fable-style long-horizon execution quality while paying only for Claude Sonnet 5 inference and avoiding repeated context processing.

## Honest boundary

No prompt or harness turns Sonnet into the actual Fable model. The system targets the transferable part of Fable performance:

- mission persistence;
- context discipline;
- evidence-grounded tool use;
- autonomous recovery;
- fresh-context verification;
- memory and compaction;
- correct stopping behavior.

Actual savings vary by mission. V4 does not claim a percentage until the included benchmark passes at equal quality.

## The five engines

1. **Cache-First Engine** keeps exact stable prefixes and the same Sonnet model.
2. **Context Governor** watches live usage and changes operating behavior before bloat becomes expensive.
3. **Evidence Evaporator** moves giant tool outputs to hashed files and returns compact recoverable digests.
4. **Compaction Continuity Engine** snapshots state before compaction and audits/reinjects it afterward.
5. **Fork Engine** uses cache-sharing Sonnet forks for side tasks that need full parent context, while fresh subagents remain the independent reviewers.

## Launch

```bash
elite-fable-fraction
```

Maximum main-session reasoning:

```bash
elite-fable-fraction-max
```

No experimental forks:

```bash
elite-fable-fraction-safe
```
