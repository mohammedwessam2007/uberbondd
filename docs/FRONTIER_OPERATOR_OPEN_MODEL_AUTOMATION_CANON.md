# UberBond Frontier Operator + Open Model Foundry + Automation Harvest

Status: provider-neutral foundation proposed and implemented on an isolated expansion branch; no paid Fable dependency; no live external-effect authority added

Version: 1.0.0

Date: 2026-09-03

## Purpose

UberBond should continuously absorb useful mechanisms introduced by frontier AI products, open-model ecosystems, skills, plugins, automation courses and agent frameworks without becoming dependent on any one vendor.

The operating doctrine is monotonic capability expansion:

`new frontier behavior -> extract mechanism -> provider-neutral UberBond primitive -> benchmark suppliers -> governed activation -> measured outcome`

The project does not shrink its capability frontier merely to make the codebase easier for today's models. Implementations may be superseded, but useful capabilities should be preserved or replaced by stronger ones.

This expansion currently harvests three source families:

1. a user-supplied article describing long-horizon frontier-model operation patterns such as goals, loops, leader/worker delegation, independent verification, root-cause work, adaptive effort, visual verification and artifact-first completion;
2. the publicly mirrored Julian Goldie one-hour Claude build/automation course, including Projects, connectors, mini-apps, browser/computer use, Claude Code, skills, artifacts, content/SEO/social workflows, data shaping and recurring automation;
3. UberBond's Open Model Foundry design for open-weight, hosted open-weight, local-runtime and closed-API model suppliers.

These sources are discovery inputs. A course demonstration, product feature, benchmark claim, repository observation or model release is not implementation proof, commercial proof, permission, or authority.

## Frontier Operator

`src/frontier-operator.mjs` converts useful frontier-model operating behavior into provider-neutral contracts.

### Goal Engine

A mission goal must declare:

- outcome;
- reason;
- constraints;
- observable proof requirements;
- permitted effect classes;
- turn, duration and spend bounds;
- fail-closed failure policy.

A convincing answer cannot satisfy a goal. Every required proof item needs a current receipt. `FAIL`, `UNCERTAIN`, or missing evidence means the goal is not proven.

### Leader / Worker / Verifier / Adversary / Judge

The role model is independent from model vendor.

- `LEADER`: decomposes and prioritizes the mission.
- `WORKER`: owns one bounded lane.
- `VERIFIER`: independently checks the lane against its contract.
- `ADVERSARY`: searches for hidden regressions, unsafe assumptions and bypasses.
- `JUDGE`: resolves genuinely disputed evidence or tradeoffs.

Workers do not receive authority merely because a leader delegates a task.

### Parallelism law

Parallel execution is useful only when lanes are genuinely independent. Resource ownership is explicit. Overlapping file/state ownership causes `SERIALIZATION_REQUIRED` rather than parallelism theatre.

### Persistent Loop Engine

A loop is a durable plan with:

- objective;
- cadence;
- stop condition;
- maximum iterations;
- spend ceiling;
- allowed effect classes.

The primitive itself grants no scheduling or business-effect authority. Persistent scheduling must later bind through OMNIA's scheduler, authority and evidence systems.

### Adaptive effort

The generic effort ladder is:

`DETERMINISTIC -> LOW -> MEDIUM -> HIGH -> FRONTIER`

If deterministic software can safely solve a task, it wins before model inference. Otherwise effort may rise according to consequence, ambiguity and complexity. The actual model/provider is selected separately by measured routing.

### Long-horizon mission ledger

Long missions must externalize state instead of trusting one model context window. A checkpoint preserves:

- mission identity;
- exact source revision;
- completed stages;
- failed strategies;
- falsified assumptions;
- blockers;
- next actions;
- observation time.

A new model, session or worker should be able to resume from durable state rather than restart the mission from prose memory.

### Root-cause and proof-carrying completion

Recurring failure should escalate from symptom repair toward reproducible causal diagnosis, smallest structural correction, regression proof and Mutation War coverage where the invariant is important.

Preferred outputs are artifacts and receipts: commits for software, current test output for code claims, stored records for database work, current screenshots for visual work, evidence artifacts for research and provider receipts for external state.

## Open Model Foundry

`src/open-model-foundry.mjs` makes model intelligence a governed supplier market rather than a hard-coded vendor dependency.

Recognized supplier forms include:

- `OPEN_WEIGHT`;
- `HOSTED_OPEN_WEIGHT`;
- `LOCAL_RUNTIME`;
- `CLOSED_API`.

A model supply object can record:

- canonical identity and revision;
- provider;
- license;
- weight availability;
- task classes;
- modalities and tool capabilities;
- context capacity;
- benchmark quality and freshness;
- reliability;
- token and infrastructure cost;
- hardware fit;
- permission eligibility;
- evidence references;
- lifecycle state.

### Open-weight cost law

Open weights are not equivalent to free inference. GPU time, memory, electricity, hosting, latency, operations and verification all count. Open/local suppliers fail normalization when runtime cost is unknown.

### Model tournament

UberBond should benchmark models on its own task classes using private/rotating holdouts where appropriate. Important measures include:

- task success;
- output quality;
- reliability;
- latency;
- token cost;
- infrastructure cost;
- founder intervention;
- tool-use success;
- recovery success;
- security/policy compliance.

Selection should choose the cheapest sufficient governed supplier for the mission, not the model with the loudest public benchmark.

A future model may replace today's leader without changing the institution. GPT, Claude, Qwen, DeepSeek, Kimi, GLM, gpt-oss, Mistral, Gemma and future families are supplier candidates, not constitutional dependencies.

## Open-model specialization frontier

When lawful data and economics justify it, UberBond may evaluate:

- retrieval augmentation;
- prompt/compiler specialization;
- adapters or LoRA;
- task-specific fine-tuning;
- distillation from data UberBond has rights to use;
- specialized deterministic + model hybrids.

Potential future internal workers include opportunity rankers, capability selectors, failure classifiers, proposal critics, evidence verifiers, code reviewers, goal checkers, reconciliation analysts and context retrievers.

No specialization result silently becomes an active model. It still passes Capability Genome security, benchmark, permission and promotion gates.

## Automation capability harvest

`src/frontier-capability-harvest.mjs` records source-derived capability hypotheses from the automation course and frontier-operator research.

The automation family includes hypotheses for:

- project-scoped durable memory;
- connector fabric;
- landing-page and mini-app generation;
- content, SEO and social workflows;
- browser/computer use;
- coding-agent bridges;
- skills;
- artifact generation;
- data shaping;
- recurring jobs;
- email/calendar/cloud-drive integration;
- payment connectors;
- spreadsheet reconstruction.

The important transformation is provider-neutralization:

`Claude Project -> UberBond durable mission/context object`

`Claude connector -> governed Capability Genome connector adapter`

`Claude mini-app/artifact -> artifact-first worker capability`

`Claude browser/computer use -> permissioned browser/computer capability`

`Claude Code -> replaceable software-factory worker`

`Claude skill -> governed capability atom/bundle`

`Claude recurring task -> OMNIA persistent loop`

`Claude integration -> provider adapter subordinate to UberBond authority and truth systems`

A payment connector, for example, never replaces Payment Truth. A messaging connector never creates messaging authority. A browser tool never creates permission to bypass provider restrictions or access private sessions.

## Context Spine

The system should grow without forcing every worker to consume the entire company.

Target retrieval flow:

`constitution -> mission contract -> required capability atoms -> relevant subsystem contracts -> current state -> recent evidence -> worker`

Large company memory is an asset. Large mandatory prompts are not.

## Frontier Engine

The long-term Frontier Engine asks continuously:

> What can today's UberBond not do that new technology now makes possible?

Its target loop is:

`new model/tool/skill/product mechanism`
`-> discover`
`-> normalize claims`
`-> extract provider-independent primitives where possible`
`-> search substitutes`
`-> license/security/authority screening`
`-> benchmark`
`-> route bounded mission`
`-> measure real outcome`
`-> retain/degrade/replace/revoke`
`-> use newly acquired capability to discover newly reachable opportunities`

This is recursive capability expansion, not vendor-chasing.

## Non-negotiable laws

1. **Capability expands; supplier dependency does not.** Useful mechanisms should become provider-neutral where feasible.
2. **Frontier behavior becomes an UberBond primitive when that increases reusable capability.** A slash command or product UX is not the durable architecture.
3. **Capability never creates authority.** Models, skills, connectors and tools remain subordinate to OMNIA.
4. **Open weights are not zero-cost runtime.** Hardware and operations remain economic inputs.
5. **Long-horizon truth lives outside model context.** Mission ledgers and checkpoints survive provider/session loss.
6. **Workers do not self-certify important work.** Verification is independent where consequences justify it.
7. **Completion is evidence, not prose.** Missing or uncertain proof remains incomplete.
8. **Parallelism requires independent ownership.** Overlapping mutation domains serialize or coordinate explicitly.
9. **Expensive intelligence is an escalation tier, not a default tax.** Deterministic and cheaper sufficient routes win when they meet the same risk class.
10. **Discovery is not activation.** Course examples, public feature claims and model releases remain hypotheses until Genome admission and measured proof.
11. **Commercial truth remains external.** New automation capability cannot fabricate customers, revenue, accepted delivery or retention.
12. **New technology should enlarge the reachable mission frontier.** The architecture should continuously revisit missions previously impossible or uneconomic.

## Current truth boundary

This branch adds provider-neutral planning, evidence and supplier-market primitives. It does not claim:

- Fable 5.1 is available to UberBond;
- any open model is currently hosted or free to run;
- the automation-course connectors are installed or authorized;
- persistent loops are activated in production;
- any new capability is Genome-approved or active;
- any commercial outcome has occurred.

The expansion is intentionally isolated from the current convergence/Omega closure work. Convergence should later compare exact heads and selectively integrate this branch only after verification.
