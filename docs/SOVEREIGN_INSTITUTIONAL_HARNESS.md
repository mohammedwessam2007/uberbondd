# Sovereign Institutional Harness

Status: `IMPLEMENTED_INTERNAL_ENGINEERING_PRIMITIVE`

Truth class: `RESEARCH_DONOR + UBERBOND_COMPOSITION`

This document digests the useful software-engineering architecture from the founder-supplied September 2026 article about using GPT-6 Astra through a structured institutional harness. The article is a donor source, not authority and not proof of the broader performance claims made by the article.

Implementation: `src/sovereign-institutional-harness.mjs`

Deterministic tests: `tests/sovereign-institutional-harness.test.mjs`

## Core law

Raw model capability is not production quality. A powerful model becomes dependable only when it operates inside explicit roles, evidence, gates, verification, observability, and rollback.

Canonical engineering flow:

`EXACT CONTEXT -> SPECIFICATION -> ARCHITECTURE -> PLAN -> TEST-FIRST BUILD -> INDEPENDENT REVIEW -> RISK GATE -> SHIP READINESS -> OBSERVED MONITORING -> RECONCILIATION -> LEARNING`

A reasoning model is therefore a replaceable cognitive substrate inside a proof-carrying institution, not a one-command oracle.

## Research-donor mechanisms retained

The source contributes these useful ideas:

- harness engineering over one-shot prompting;
- one strong reasoning substrate may fill several professional disciplines when roles, tools, context, and gates are separated;
- the six-phase workflow `SPECIFICATION -> ARCHITECTURE -> PLAN -> BUILD -> REVIEW -> SHIP`;
- specification and architecture before implementation;
- test-first construction;
- dual review: specification match and engineering quality;
- ten engineering disciplines: Conductor, Backend Architect, Test Engineer, Code Reviewer, Data Engineer, Debugger, Frontend Engineer, Infrastructure/DevOps Engineer, Performance/Observability Engineer, Security Engineer;
- the six-layer operational runtime `DATA -> SIGNAL -> DECISION -> RISK -> EXECUTION -> MONITORING`;
- independent risk constraints, kill switches, CI/CD, rollback, observability, reconnect/retry/reconciliation, and explicit failure handling;
- long context as institutional memory rather than an unstructured prompt dump;
- direct tool use reducing handoff loss between reasoning and execution.

These are architectural donors. Their presence does not establish the article's wider claims.

## UberBond upgrade

UberBond composes the donor pattern with mechanisms already present in the repository.

### Four added sovereign disciplines

The ten article disciplines are retained and extended with:

- `RISK_OFFICER`: independent stop-the-line control;
- `ADVERSARIAL_FALSIFIER`: actively attempts to disprove the result;
- `AUTHORITY_GUARD`: prevents capability or performance from creating new permission;
- `REALITY_RECONCILER`: compares intended effects with observed reality and refuses synthetic closure.

The same underlying model may serve multiple disciplines, but review and authority gates require isolated context plus a different execution-instance identity from build roles. This preserves institution compression without pretending that self-review is independent review.

### Exact-context binding

Every mission identifies an exact Context Fabric / Brainstate snapshot and digest. A large context window is not treated as truth merely because it is large. The mission is bound to a specific state so stale context can be detected rather than silently inherited.

### Proof-carrying phase transitions

Each phase has mandatory artifacts:

- **SPECIFICATION**: mission spec, acceptance criteria, authority envelope, context snapshot;
- **ARCHITECTURE**: architecture, interface contracts, failure model;
- **PLAN**: task plan, test plan, rollback plan;
- **BUILD**: observed failing-test receipt, implementation receipt, observed passing-test receipt;
- **REVIEW**: specification, quality, security, performance, and adversarial verdicts;
- **SHIP**: CI receipt, risk verdict, rollback rehearsal, immutable release manifest.

No later phase may leap over an unsatisfied earlier phase. A one-shot implementation artifact is structurally insufficient.

### Real TDD ordering

The harness checks chronology, not prose. The failing test must be observed before implementation, and the implementation must precede the passing-test receipt.

### Proof DAG binding

Observed gate evidence can bind into UberBond's content-addressed Proof DAG. Synthetic ancestry remains visible. A derived receipt with synthetic ancestry cannot be relabeled as clean observed evidence.

### Minimum sufficient executor

The mission is routed through the existing Institution Cell Compiler:

`DETERMINISTIC_CODE -> SKILL -> AGENT -> HUMAN_GATE`

The cheapest sufficient verified executor is preferred. Intelligence does not justify agent proliferation.

### Independent risk as a one-way ratchet

Runtime is compiled into:

`DATA -> SIGNAL -> DECISION -> RISK -> EXECUTION -> MONITORING`

The RISK layer must possess a kill switch and hard-limit reference. It may reduce or block exposure, never increase authority. Execution must require a current risk lease and must not share its execution instance with the risk layer. Monitoring must also be independent from execution and carry a reconciliation path.

### Readiness is not authority

A mission may become `SHIP READY` without automatically acquiring permission to create consequential external effects. For consequential shipping, an explicit authority-lease reference is required. Even then, the harness itself returns `externalEffectAuthority: NONE`. It establishes internal readiness, not external authority.

### Self-improvement without self-coronation

UberBond upgrades the donor's self-improvement framing into:

`OBSERVE -> HYPOTHESIS -> CANDIDATE_PATCH -> SANDBOX -> HOLDOUT_BENCHMARK -> INDEPENDENT APPROVAL -> PRODUCTION PROPOSAL -> MONITOR -> ROLLBACK`

Promotion eligibility requires:

- an explicit baseline;
- holdout evaluation;
- leakage checking;
- no critical metric regression beyond declared tolerance;
- hostile tests all passing;
- an observed sandbox receipt;
- rehearsed rollback;
- independent PASS verdicts from Code Reviewer, Adversarial Falsifier, Risk Officer, and Authority Guard;
- no candidate self-approval;
- no authority expansion as a reward for performance.

The result is still a promotion proposal. The evaluator does not mutate production by itself.

### Reality outranks simulation

Internal code and tests can establish internal software behavior. They cannot manufacture facts that require the outside world. Those remain external-proof classes handled by UberBond's External Proof Router and real-world evidence systems.

## Merged institution

The resulting UberBond pattern is:

`CONSTITUTION -> EXACT CONTEXT -> INTENT -> SPEC -> ARCHITECTURE -> PLAN -> INSTITUTION CELL -> TDD BUILD -> PROOF DAG -> ADVERSARIAL REVIEW -> RISK -> AUTHORITY -> SHIP READINESS -> EXECUTION -> MONITORING -> RECONCILIATION -> VALUE -> LEARNING -> REVOCATION`

This composes the research donor with UberBond's existing constitutional architecture: attenuation-only delegation, recursive revocation, temporal authority leases, blast-radius budgets, Proof DAG, Institution Cell Compiler, replaceable mechanism suppliers, External Proof Router, Capability Genome, Context Fabric / Brainstate continuity, GENESIS / Perpetual Frontier challengers, bounded self-improvement, and the terminal Sovereign Cognitive Continuum law that the founder supplies will, UberBond supplies intelligence, and reality supplies feedback.

## Standard

`10/10` is a design target, not an evidence label. The engineering standard is instead: no known bypass of the declared gates, explicit uncertainty, falsifiable receipts, independent review, reversible promotion, and external evidence for every claim that software alone cannot establish.

The harness itself must remain replaceable. If a future frontier system invents a superior institution, it should challenge this design through the same evidence rules rather than preserving it merely because it became canon.
