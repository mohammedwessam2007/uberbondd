# UberBond Wallbreaker Canon

## Purpose

Wallbreaker is UberBond's evidence-first problem-solving kernel for hard walls. It exists so a failed attempt becomes structured information rather than a reason to repeat the same mechanism with louder prompting.

Wallbreaker does **not** create external authority. It prepares and ranks solution paths under the existing UberBond constitution, consequence gates, capability controls, payment truth, distribution truth, and economic objective.

North star:

`risk-adjusted cleared contribution profit / founder minute`

## Core loop

`wall -> compile objective/success/constraints -> generate diverse candidate families -> score -> verify -> select bounded candidate -> observe result -> classify failure -> invalidate assumptions -> derive countermoves -> acquire missing capability -> rerank -> execute through existing gates`

The implementation begins in `src/wallbreaker.mjs` and is operator-runnable through:

`npm run wallbreaker -- path/to/problem.json`

or JSON on stdin.

Focused hostile tests:

`npm run test:wallbreaker`

## Problem object

A compiled wall retains:

- objective;
- explicit success criteria;
- hard constraints;
- assumptions;
- unknowns;
- required capabilities;
- owner-reserved authority;
- risk budget;
- spend ceiling;
- founder-minute ceiling;
- evidence references.

If objective or success criteria are absent, Wallbreaker fails closed.

## Candidate population

Candidates are not merely ranked ideas. Each candidate declares a strategy family, mechanism, capability requirements, assumptions, constraint conflicts, reversibility, expected contribution, success probability, cost, founder minutes, risk, evidence strength, novelty, robustness, and evidence references.

Wallbreaker preserves one strongest candidate per strategy family before constructing the fallback frontier. This prevents twenty near-identical agents from masquerading as cognitive diversity.

## Failure compiler

Current failure classes:

- `WRONG_ASSUMPTION`
- `MISSING_EVIDENCE`
- `CAPABILITY_GAP`
- `IMPLEMENTATION_DEFECT`
- `PROVIDER_FAILURE`
- `AUTHORITY_BLOCK`
- `ECONOMIC_FAILURE`
- `ENVIRONMENT_CHANGE`
- `STOCHASTIC_FAILURE`
- `VERIFIER_FAILURE`
- `IMPOSSIBLE_CONSTRAINT`
- `UNKNOWN`

Each class maps to different countermoves. Provider failure can cause provider substitution. A capability gap can request Capability Genome retrieval. A falsified assumption prunes every dependent candidate. A verifier failure withholds the success claim and repairs independent checking. An authority block produces lawful substitutes or escalation, never circumvention.

## No dumb retry law

A failed mechanism signature is not eligible again merely because the model restates it. It must be materially changed, or the failure must be explicitly classified as safely retryable with known outcome semantics.

Unknown external outcomes are not blindly retried.

## Capability Genome seam

When failure is classified as `CAPABILITY_GAP`, Wallbreaker emits focused capability queries rather than inventing access. The intended later seam is:

`missing capability -> Capability Genome -> approved substitutes -> benchmark -> minimum sufficient bundle -> Wallbreaker candidate population`

Until that Genome is live, these are retrieval requests, not proof that a tool was installed.

## Adaptive compute

Wallbreaker selects a compute tier (`CHEAP`, `STANDARD`, `DEEP`, `EXTREME`) from observed ambiguity, failure count, available candidates, and unresolved unknowns. The tier is a routing signal for existing AI/model infrastructure, not permission to spend or evade provider limits.

## Authority law

Capability never creates authority.

Wallbreaker may search for lawful substitutes around a blocked path. It must not reinterpret a permission, legal, provider-terms, consent, customer, payment, or security boundary as a puzzle to bypass.

Every Wallbreaker output currently carries:

- `businessEffectAuthority: NONE`
- the canonical zero external-effect ledger.

Execution still flows through UberBond's existing consequence system.

## Economic law

Candidate ranking combines expected contribution, success probability, founder minutes, cost, risk, evidence, reversibility, novelty, and robustness. These values are planning estimates unless linked to real external outcome evidence.

No Wallbreaker score creates revenue truth.

## Evolution target

This v1 kernel is deterministic orchestration infrastructure, not a claim of superhuman intelligence. The next layers should connect it to:

1. Capability Genome retrieval;
2. heterogeneous model generation;
3. verifier/critic workers;
4. solution-population evolution;
5. durable failure/strategy memory;
6. scheduler escalation;
7. model-aware empirical performance;
8. WallBench held-out evaluation;
9. real economic outcome feedback.

The target is not an IQ number. The target is a measurable rise in wall-clearance rate, recovery after failure, strategy diversity, verification precision, transfer from prior failures, founder-minute reduction, and economic outcomes.
