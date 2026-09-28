# APEX Public Frontier Scorecard — 2026-09-29

Status: **DATED DOCUMENTED-MECHANISM COMPARISON / NOT A GLOBAL PERFORMANCE RANKING**

## Purpose

This scorecard asks a narrow question:

> Across a curated set of strong public agent/orchestration systems reviewed on 2026-09-29, how much of the desired UberBond reasoning architecture is explicitly documented?

It does **not** ask which system has the smartest model, which product is best for users, or which system wins matched end-to-end reasoning trials.

An undocumented mechanism is scored as **NOT OBSERVED**, not asserted absent.

## Reviewed public set

1. Anthropic multi-agent Research engineering architecture.
2. OpenAI Agents API / Agents SDK.
3. Microsoft Agent Framework.
4. Google Agent Development Kit.
5. Microsoft AutoGen AgentChat/Core.
6. ADAS / Meta Agent Search.
7. AgentSquare.
8. AFlow.
9. MaAS.
10. AutoMaAS.
11. EvoAgentX.
12. DSPy / GEPA.
13. UberBond APEX + Frontier Cognitive Fabric + Noetic/Jev + Architecture Lab candidate.

Primary/public references:

- https://www.anthropic.com/engineering/multi-agent-research-system
- https://developers.openai.com/api/docs/guides/agents
- https://developers.openai.com/api/docs/guides/agents/orchestration
- https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/
- https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints
- https://developers.googleblog.com/adk-go-10-arrives/
- https://github.com/google/adk-docs/blob/main/docs/agents/workflow-agents/index.md
- https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/index.html
- https://arxiv.org/abs/2408.08435
- https://proceedings.iclr.cc/paper_files/paper/2025/hash/0ae94013da7cd459402fd77874e09ee3-Abstract-Conference.html
- https://proceedings.iclr.cc/paper_files/paper/2025/hash/5492ecbce4439401798dcd2c90be94cd-Abstract-Conference.html
- https://arxiv.org/abs/2502.04180
- https://arxiv.org/abs/2510.02669
- https://aclanthology.org/2025.emnlp-demos.47/
- https://proceedings.iclr.cc/paper_files/paper/2026/hash/0e9e708b6f48e14fd0ac29e167413f76-Abstract-Conference.html
- https://github.com/stanfordnlp/dspy/blob/main/docs/docs/learn/optimization/optimizers.md
- https://aclanthology.org/2026.acl-long.981/
- https://arxiv.org/abs/2607.23809

## Rubric

Ten mechanism families are scored only from reviewed public documentation.

1. **Adaptive/query-dependent topology** — reasoning graph or resource allocation changes by task/query rather than using one fixed graph.
2. **Parallel heterogeneous cognition** — multiple agents/branches/specialists can explore genuinely different work in parallel.
3. **Independent evidence challenge** — explicit independent verification, critique, adjudication or comparable anti-consensus mechanism.
4. **Long-horizon context/memory control** — deliberate compaction/offload/retrieval/state management rather than raw prompt growth.
5. **Durable artifact/state continuity** — recoverable checkpoints/artifacts/references that survive beyond one transient model context.
6. **Architecture/program search** — prompts/modules/workflows/topologies themselves can be optimized or evolved.
7. **Anti-overfit evaluation boundary** — train/search evidence is separated from held-out evaluation strongly enough to constrain optimizer leakage.
8. **Quality-first routing identity** — model/reasoning route is evidence-selected with quality primary and exact callable identity/setting represented.
9. **Cognitive crystallization** — repeated cognition can compile into a cheaper typed/deterministic executor and return upward on drift.
10. **Authority/truth separation** — capability, model agreement or benchmark success does not itself create consequence authority or external truth.

Score meanings:

- **1.0** = explicit, central documented mechanism.
- **0.5** = partial/adjacent mechanism.
- **0.0** = not observed in the reviewed public material.
- Scores are architecture-coverage evidence only.

## Dated coverage table

| System | Adaptive topology | Parallel cognition | Independent challenge | Context / memory | Durable state / artifacts | Architecture search | Anti-overfit boundary | Quality-first exact routing | Crystallization / drift | Authority / truth separation | Coverage / 10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **UberBond APEX candidate** | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | **10.0** |
| Anthropic Research | 1 | 1 | 0.5 | 1 | 1 | 0 | 0 | 0 | 0 | 0.5 | **5.0** |
| OpenAI Agents | 0.5 | 1 | 0.5 | 1 | 1 | 0 | 0 | 0.5 | 0 | 1 | **5.5** |
| Microsoft Agent Framework | 1 | 1 | 0.5 | 0.5 | 1 | 0 | 0 | 0 | 0 | 1 | **5.0** |
| Google ADK | 1 | 1 | 0.5 | 0.5 | 0.5 | 0 | 0 | 0 | 0 | 1 | **4.5** |
| AutoGen | 1 | 1 | 0.5 | 0.5 | 0.5 | 0 | 0 | 0 | 0 | 0.5 | **4.0** |
| ADAS / Meta Agent Search | 0 | 0.5 | 0 | 0 | 0 | 1 | 0.5 | 0 | 0 | 0 | **2.0** |
| AgentSquare | 0 | 0.5 | 0 | 0.5 | 0 | 1 | 0.5 | 0 | 0 | 0 | **2.5** |
| AFlow | 0 | 0.5 | 0 | 0 | 0 | 1 | 0.5 | 0 | 0 | 0 | **2.0** |
| MaAS | 1 | 1 | 0 | 0 | 0 | 1 | 0.5 | 0.5 | 0 | 0 | **4.0** |
| AutoMaAS | 0.5 | 1 | 0 | 0 | 0 | 1 | 0.5 | 0.5 | 0 | 0 | **3.5** |
| EvoAgentX | 0.5 | 1 | 0 | 0.5 | 0 | 1 | 0.5 | 0 | 0 | 0 | **3.5** |
| DSPy / GEPA | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | 0 | **2.0** |

## Interpretation

On this **specific documented-architecture coverage rubric**, the UberBond candidate is **rank 1 of 13 reviewed systems** and is the only reviewed entry with an explicit mechanism in all ten families.

That is a **coverage result**, not a quality/performance result.

The table is intentionally difficult for any single public framework because the UberBond target is a composition of:

- high-end reasoning orchestration;
- long-horizon state;
- evaluation science;
- architecture search;
- model routing;
- System-One compilation;
- deterministic crystallization;
- authority governance;
- external-reality truth.

Public systems are often narrower by design. A lower score therefore does not mean they are worse products.

## Why the candidate is now coverage-complete

The previous architecture already contained model/revision/effort identity, task-class quality routing, sealed first passes, provider diversity, independent adjudication, context minimization, authority separation, Noetic/Jev compilation and drift decompilation.

The 2026-09-29 upgrade adds or makes first-class:

- adaptive test-time reasoning topology;
- identity-blind critique/adjudication;
- reasoning-architecture Arena;
- failure-anchored architecture mutation;
- quality-diversity architecture archive;
- train/search versus sealed-holdout separation;
- direct specialist artifact persistence;
- adaptive context/memory operations while preserving durable raw evidence;
- branch steering/cancellation and straggler tolerance;
- canary / side-by-side architecture replacement;
- explicit prohibition on candidate self-promotion.

## What would be required for a real #1 claim

The phrase **"number 1 publicly"** remains inadmissible as a performance claim until UberBond has a matched empirical tournament.

Required closure:

1. current exact live model identities and reasoning settings;
2. callable providers with metered cost and latency receipts;
3. sealed multi-domain task corpus;
4. matched or normalized inference budgets;
5. current public baseline implementations or faithful reproductions;
6. blind evaluation;
7. deterministic/external ground truth where possible;
8. real long-horizon tasks, not only static benchmark questions;
9. architecture-search train/holdout separation;
10. repeated runs and confidence intervals;
11. failure, timeout and abstention counted;
12. external outcome settlement for claims about real-world success;
13. independent replication of a claimed winner.

Until those exist, the strongest truthful status is:

> **Rank 1/13 on the dated public documented-mechanism coverage rubric; empirical global-performance rank unknown.**

## Percentile statement

Within this curated thirteen-system comparison, UberBond is at the top of the documented-coverage distribution.

A global percentile across "all agent systems in the world" cannot be statistically inferred from this sample.

## Permanent update law

This scorecard expires as evidence, not as history.

When a public system adds a mechanism, a new system appears, or a reviewed claim proves wrong:

1. update the evidence;
2. rescore the affected row;
3. add the donor mechanism to the Architecture Lab if useful;
4. run a sealed challenger tournament;
5. preserve the old scorecard for provenance;
6. never preserve rank by changing the rubric after seeing a competitor.
