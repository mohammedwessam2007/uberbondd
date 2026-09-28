# APEX Sealed Architecture Tournament — 2026-09-29

Status: **IMPLEMENTED CANDIDATE / NO PRODUCTION PROMOTION AUTHORITY**

## Purpose

The APEX/Jev merge established a strong reasoning architecture and a dated public mechanism-coverage result. It deliberately did **not** establish global empirical reasoning superiority.

UberBond already had the necessary organs:

- Nullstar Omega sealed holdouts;
- APEX reasoning-architecture Arena;
- frontier model admission and task-tournament evidence;
- private-evidence commitment machinery.

`src/apex-sealed-tournament.mjs` is the bridge between them. It does not create a second evaluation truth system.

## Flow

```text
PRECOMMITTED SEALED HOLDOUT
    |
    | suite + corpus digest + manifest digest + source freeze
    | raw holdout remains outside repository
    | optimizer/candidate access = false before evaluation
    v
FROZEN ARCHITECTURE IDENTITY
    |
    | class + digest + revision + source ref + freeze timestamp
    | public baselines also require reproduction evidence
    v
BOUND ARCHITECTURE RUNS
    |
    | exact run identity + time
    | independent evidence ref
    | verifier-independent flag
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
MATCHED-CEILING APEX ARENA
    |
    | same suite / corpus / manifest / commitment / task class
    | common cost ceiling
    | common founder-minute ceiling
    | common latency ceiling
    | quality-first Pareto frontier
    v
REPLICATION GATE
    |
    +--> incumbent retained
    +--> challenger signal requires replication
    +--> challenger replication candidate
    +--> public-reviewed-set leader replication candidate
    |
    v
NO SELF-PROMOTION / NO GLOBAL-RANK AUTHORITY
```

## Hard laws

1. **No plaintext sealed answers leave the scorer.**
2. **No sealed prompts enter the optimizer-facing payload.**
3. Every manifest row must be `SEALED_HOLDOUT`.
4. The supplied corpus digest must cryptographically bind the exact manifest being scored.
5. The holdout commitment must bind suite version, corpus digest, manifest digest and task count.
6. Raw holdouts must remain outside the repository.
7. The commitment must declare optimizer and candidate access false before evaluation.
8. Plaintext answers must not be exposed before evaluation.
9. The evaluator must be declared independent.
10. Future-dated holdout commitments and future-dated run evidence are refused.
11. Every architecture must have a frozen identity: class, SHA-256 digest, revision, source ref and freeze time.
12. Public baseline architectures require a reproduction-evidence reference.
13. Runs predating the architecture freeze or holdout commitment are refused.
14. One complete run is required for every manifest task.
15. Task IDs, run IDs and evidence references must be unique.
16. Abstention is distinct from an incorrect answer.
17. Cost, latency and founder minutes are normalized per task before entering the Arena.
18. Independent process evidence is required.
19. The declared verifier identity may not equal the declared architecture-designer identity.
20. All architectures in one tournament must use the same suite version, corpus digest, manifest digest, holdout commitment and task class.
21. All competitors must fit the same declared cost, founder-minute and latency ceilings.
22. The APEX Arena remains quality-first.
23. A challenger may become a **replication candidate** only when its 95% Wilson success interval is entirely above the incumbent's and its false-positive upper bound is not worse.
24. `PUBLIC_FRONTIER` mode additionally requires a declared minimum number of reproducible public baselines.
25. Even clear separation across every reviewed public baseline yields only `PUBLIC_REVIEW_SET_LEADER_REPLICATION_CANDIDATE`.
26. `globalRankAuthority = NONE`.
27. `percentileAuthority = REVIEWED_SET_ONLY`.
28. A replication candidate is still not a production winner.
29. `promotionAuthority = NONE`.
30. `productionActivationAuthorized = false`.
31. External deployment, spend, customer, payment, DNS and credential authority remain unchanged.

## Claim modes

### TASK_CLASS

Asks whether one architecture has a sufficiently strong sealed signal over the incumbent on one task class.

Possible strong result:

`SEALED_CHALLENGER_REPLICATION_CANDIDATE`

This is not production promotion.

### PUBLIC_FRONTIER

Asks whether the candidate is clearly separated from **every architecture in a declared reviewed public set** under the same ceilings.

Requirements include:

- enough public baselines to satisfy the declared minimum;
- reproduction evidence for each public baseline;
- same sealed corpus and commitment;
- same task class;
- common quality-preserving cost, latency and founder-minute ceilings.

Possible strong result:

`PUBLIC_REVIEW_SET_LEADER_REPLICATION_CANDIDATE`

This still carries:

`globalRankAuthority = NONE`

because a finite reviewed set is not the world.

## Important boundary

The bridge can verify internal consistency of the supplied commitment and refuse several obvious leakage/identity failures.

It cannot prove by itself that:

- the commitment receipt was generated by a genuinely independent external custodian;
- a model never encountered equivalent tasks in pretraining, fine-tuning, browsing, previous evaluations or leaked data;
- a public-baseline reproduction is perfectly faithful;
- a reviewed set is globally representative.

Those require external provenance and independent replication.

## Exact-source hostile verification

The 2026-09-29 controlled exact-source harness verified:

- source and test modules parse;
- 100-task incumbent at 70% produces a Wilson 95% success interval of approximately 0.604–0.781;
- 100-task challenger at 96% produces approximately 0.902–0.984;
- the separated challenger becomes `SEALED_CHALLENGER_REPLICATION_CANDIDATE`;
- with three reproducible public baselines in the harness, the same challenger can become `PUBLIC_REVIEW_SET_LEADER_REPLICATION_CANDIDATE`;
- both results keep `promotionAuthority = NONE`, `productionActivationAuthorized = false`, and `globalRankAuthority = NONE`;
- serialized trial output contains neither correct-answer strings nor wrong-response strings;
- too few public baselines are refused;
- incomplete manifest coverage is refused;
- forged corpus identity is refused;
- self-verification identity is refused;
- common-latency-ceiling violations are refused;
- future-dated run evidence is refused.

## What remains external

A real empirical frontier claim still requires actual provider execution on exact model/revision/settings, real metered receipts, a sufficiently broad sealed corpus, faithful public baselines, repeated runs, independent replication and appropriate external settlement.

This module makes those experiments much harder to game. It does not manufacture their outcomes.
