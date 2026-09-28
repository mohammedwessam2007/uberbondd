# APEX Sealed Architecture Tournament — 2026-09-29

Status: **IMPLEMENTED CANDIDATE / NO PRODUCTION PROMOTION AUTHORITY**

## Purpose

The APEX/Jev merge established a strong reasoning architecture and a dated public mechanism-coverage result. It deliberately did **not** establish global empirical reasoning superiority.

UberBond already had three relevant organs:

- Nullstar Omega sealed holdouts;
- APEX reasoning-architecture Arena;
- frontier model admission / task-tournament evidence.

The missing piece was a strict bridge between them.

`src/apex-sealed-tournament.mjs` provides that bridge without creating a second evaluation truth system.

## Flow

```text
SEALED NULLSTAR MANIFEST
    |
    | task id + family + difficulty + salted answer digest
    | no plaintext answer
    v
BOUND ARCHITECTURE RUNS
    |
    | exact run identity
    | independent evidence ref
    | measured cost / latency / founder minutes
    v
SEALED DIGEST SCORING
    |
    +--> CORRECT
    +--> INCORRECT
    +--> ABSTAINED
    |
    v
AGGREGATE TRIAL RECEIPT
    |
    | success rate + Wilson 95% interval
    | false-positive rate + Wilson 95% interval
    | abstention rate
    | independent process score + verifier evidence
    | no raw response in optimizer payload
    v
APEX REASONING ARCHITECTURE ARENA
    |
    | quality-first Pareto frontier
    | economics only inside quality frontier
    v
REPLICATION GATE
    |
    +--> incumbent retained
    +--> challenger signal requires replication
    +--> challenger replication candidate
    |
    v
NO SELF-PROMOTION
```

## Hard laws

1. **No plaintext sealed answers leave the scorer.**
2. **No sealed prompts enter the optimizer-facing payload.**
3. Every manifest row must be `SEALED_HOLDOUT`.
4. One complete run is required for every manifest task.
5. Task IDs, run IDs and evidence references must be unique.
6. Abstention is distinct from an incorrect answer.
7. Cost, latency and founder minutes are normalized per task before entering the Arena.
8. Independent process evidence is required.
9. The declared verifier identity may not equal the declared architecture-designer identity.
10. All architectures in one tournament must use the same suite version, corpus digest and task class.
11. The APEX Arena remains quality-first.
12. A challenger may become a **replication candidate** only when:
    - its 95% Wilson success interval is entirely above the incumbent's; and
    - its false-positive upper bound is not worse than the incumbent's.
13. A replication candidate is still not a production winner.
14. `promotionAuthority = NONE`.
15. `productionActivationAuthorized = false`.
16. External deployment, spend, customer, payment, DNS and credential authority remain unchanged.

## Important boundary

The bridge can prove that the evaluator itself did not expose plaintext answers or sealed prompts through its result.

It cannot prove that a candidate model never encountered equivalent tasks elsewhere in pretraining, fine-tuning, browsing, prior runs or leaked external data.

That is why a sealed result remains evidence, not metaphysical certainty.

## Exact-source hostile verification

The 2026-09-29 controlled exact-source harness verified:

- 100-task incumbent at 70% produces a Wilson 95% success interval of approximately 0.604–0.781;
- 100-task challenger at 96% produces approximately 0.902–0.984;
- the clearly separated challenger becomes `SEALED_CHALLENGER_REPLICATION_CANDIDATE`;
- the result still has `promotionAuthority = NONE` and `productionActivationAuthorized = false`;
- serialized trial output contains neither correct-answer strings nor wrong-response strings;
- incomplete manifest coverage is refused;
- self-verification identity is refused.

## What remains external

A real empirical frontier claim still requires actual provider execution on exact model/revision/settings, real metered receipts, a sufficiently broad sealed corpus, faithful public baselines, repeated runs, and independent replication.

This module makes those experiments harder to game. It does not manufacture their outcomes.
