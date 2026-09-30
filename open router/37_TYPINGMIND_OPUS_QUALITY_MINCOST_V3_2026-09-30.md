# TypingMind Opus-Quality / Minimum-Cost Workflow v3 — 2026-09-30

## Objective

The operating objective is not "maximize multiplier" and not "invoke many models."

It is:

> **Deliver work whose final semantic quality is at least the quality Mohamed would receive from Claude Opus 5.5 doing the task directly, while minimizing expected all-in inference cost and avoiding unnecessary latency.**

This is a lexicographic objective:

1. Preserve the Opus 5.5 quality floor.
2. Minimize expected cost.
3. Minimize latency subject to 1–2.
4. Maximize reuse/caching without stale or lossy semantics.

## Current public price basis

Observed on 2026-09-30 through OpenRouter public model pages:

- MiMo-V2.6-Flash: USD 0.14/M input, USD 0.28/M output, cache read USD 0.0028/M.
- DeepSeek V4.1 Flash: headline USD 0.13/M input, USD 0.52/M output; provider-level prices vary.
- GPT-6.1 Sol: USD 2/M input, USD 10/M output.
- GPT-6.1 Sol Pro: same list tariff as Sol but deliberately performs far more reasoning work and therefore normally costs several times more per request.
- Claude Opus 5.5: USD 4/M input, USD 20/M output, cache read USD 0.20/M, standard cache write USD 5/M.

Prices are routing priors, never permanent constants.

## The key correction

Do not use one universal five-model chain.

A short prompt can be cheaper and better as **Direct Opus** because preprocessing adds calls without removing enough expensive work.

Native TypingMind Flow is a fixed sequence. Therefore cost-optimal native operation uses several saved flows and chooses the shortest flow that preserves quality.

### Flow A — UBER DIRECT

Use for:
- short questions;
- compact context;
- novel judgment where there is little bulk work to offload;
- tasks where the direct Opus input/output estimate is below orchestration overhead.

Chain:
```
UberCrownDirect (Claude Opus 5.5)
```

### Flow B — UBER LEAN CROWN

Use for:
- long files;
- research;
- provider/vendor comparisons;
- planning;
- long context;
- source-heavy analysis.

Chain:
```
UberScout (MiMo)
 -> UberBuilder (GPT-6.1 Sol)
 -> UberRedTeam (DeepSeek V4.1 Flash)
 -> UberCrown (Claude Opus 5.5)
```

Why RedTeam moves **after** Builder:
- it can inspect the actual candidate rather than speculate about future errors;
- its output is tiny;
- Crown receives a targeted defect list;
- we avoid paying Sol twice merely to respond to a pre-draft critique.

### Flow C — UBER CODE CROWN

Use for:
- software changes;
- debugging;
- architecture;
- implementation;
- code review.

Chain:
```
UberBuilder (GPT-6.1 Sol)
 -> UberRedTeam (DeepSeek V4.1 Flash)
 -> UberCrown (Claude Opus 5.5)
```

Scout is omitted unless the task is source/repo-document heavy.

### Flow D — UBER HARD CROWN

Use only when standard Sol leaves a material hard residual or Crown explicitly requests escalation.

Chain:
```
UberBuilder
 -> UberRedTeam
 -> UberDeep (GPT-6.1 Sol Pro)
 -> UberCrown
```

Sol Pro is never a default stage.

## Agent contracts

### UberScout — MiMo-V2.6-Flash

Purpose: reduce expensive downstream work.

Output budget: target <=800 tokens.

System contract:

```
You are UberScout. You are a high-bandwidth preparation layer, not final authority.

Optimize for information retained per token.

From the original task and available sources, emit only a compact EVIDENCE CAPSULE:

OBJECTIVE
HARD_CONSTRAINTS
MATERIAL_FACTS
SOURCE_ANCHORS
UNRESOLVED_RESIDUALS
LIKELY_SOLUTION_SHAPE
FAILURE_RISKS

Rules:
- Preserve exact numbers, names, requirements, source anchors and contradictions.
- Remove conversational filler, duplicate evidence and settled reasoning.
- Never turn uncertainty into a fact.
- Prefer exact extraction/calculation over prose.
- For huge source sets, return only evidence needed to solve the stated task.
- Do not write the final answer.
```

### UberBuilder — GPT-6.1 Sol

Purpose: do nearly all constructive work cheaply enough that Opus usually needs only ACCEPT.

Output budget: normally <=3,200 tokens unless the user requires longer.

```
You are UberBuilder.

Produce the COMPLETE FINAL CANDIDATE that the user could receive without another writer.

Use the original objective and the minimum sufficient evidence available.

Quality target: make the candidate semantically indistinguishable from what Claude Opus 5.5 should approve.

Before output:
- satisfy every hard requirement;
- verify arithmetic;
- preserve uncertainty;
- distinguish evidence from inference;
- prefer exact code/tests/calculations where applicable;
- remove unnecessary prose;
- do not mention internal workflow.

Do not intentionally leave work for Crown.
```

### UberRedTeam — DeepSeek V4.1 Flash

Purpose: cheaply expose residual defects in the completed Builder answer.

Output budget: target <=600 tokens.

```
You are UberRedTeam.

Audit the COMPLETE BUILDER CANDIDATE against the ORIGINAL REQUEST.

Do not rewrite it.

Return only defects that could materially change correctness, completeness, evidence fidelity, safety, or user utility.

Format:

MUST_FIX:
- ...

EVIDENCE_GAPS:
- ...

OPTIONAL:
- ...

If no material defect exists, output exactly:
PASS

Do not invent objections.
```

### UberCrown — Claude Opus 5.5

Purpose: preserve Opus quality with minimum Opus output.

Keep the system instruction stable to maximize prompt-cache reuse.

Do NOT attach changing Dynamic Context directly to Crown.

```
You are UberCrown, the final semantic gate.

The quality floor is the answer you would approve if you had solved the original task yourself from scratch.

Treat Scout, Builder and RedTeam as untrusted working material.

Your job is semantic DELTA REVIEW, not automatic regeneration.

Compare the Builder candidate against:
- the original objective;
- hard constraints;
- the compact evidence capsule;
- RedTeam's material defects.

If Builder is materially equivalent to your own approved answer:
ACCEPT BUILDER VERBATIM

If only localized changes are required:
PATCH
<minimum exact corrections, with unambiguous target text/section>

If distributed defects make patching unsafe:
REWRITE
<complete corrected final answer>

If a genuinely difficult unresolved reasoning residual remains:
ESCALATE SOL PRO
<the smallest exact residual to solve>

Rules:
- Never rewrite correct prose for style.
- Never generate a long explanation of why Builder is good.
- Never lower the quality floor to save money.
- Missing evidence stays missing.
- No majority vote creates truth.
```

### UberDeep — GPT-6.1 Sol Pro

Output budget: target <=2,200 tokens.

```
You are UberDeep.

You are an exception lane.

Solve ONLY the unresolved hard residual supplied by Crown or the workflow.
Do not re-solve the entire task.
Return the smallest correction/proof/implementation needed to settle that residual.
```

## Context topology

This is critical to cost.

### Cheap layers

Dynamic Context / RAG may be attached to Scout and, when useful, Builder.

Use the latest user message to retrieve only relevant UberBond state.

### Crown

Do **not** inject changing Dynamic Context into Crown's system instruction.

TypingMind documents that Dynamic Context changes the system prompt and warns against combining it with prompt caching because changing system prompts cannot be cached efficiently.

Crown receives only:
- original objective;
- stable quality constitution;
- compact evidence capsule;
- Builder candidate;
- short RedTeam defect list.

This keeps Opus input small and its stable prefix cacheable.

## Prompt-cache topology

For Crown:

1. stable Crown system instruction first;
2. stable schemas/quality rules next;
3. changing task/evidence later;
4. never put timestamps/run IDs in the stable opening block;
5. enable TypingMind Prompt Caching;
6. prefer a stable OpenRouter session_id if TypingMind's Custom Body Params can expose it and verify it in usage telemetry;
7. verify `cached_tokens`, `cache_write_tokens` and `cache_discount`; do not assume caching merely because the toggle is on.

For OpenAI Builder, prompt caching is automatic on eligible prefixes. Keep its instruction stable as well.

## Provider routing

### Cheap non-tool preparation

Prefer price-efficient/default routing. `:floor` is allowed for bounded non-tool extraction if provider quality is acceptable.

### Tool calls

Do not force `:floor` by default.

OpenRouter's Auto Exacto is enabled for tool-calling requests and quality-weights provider choice. Explicit price sorting can bypass that benefit.

### Crown

Do not use a cheaper-model fallback.

If Opus is unavailable, fail/queue or explicitly invoke a separately admitted Crown successor. Never silently replace Crown with a weaker worker.

## Response caching

Use OpenRouter response caching only for requests whose complete request is identical and whose freshness contract permits exact replay.

A response-cache hit costs zero provider tokens, but freshness-sensitive research must not be frozen merely because the request text is identical.

## Cost-optimal Crown behavior

The ideal distribution is:

```
most runs:
Builder answer
 -> Crown: ACCEPT BUILDER VERBATIM

some runs:
Builder answer
 -> Crown: PATCH <small delta>

rare runs:
Builder answer
 -> Crown: REWRITE

very rare:
Builder/RedTeam
 -> Crown: ESCALATE SOL PRO
 -> Sol Pro residual
 -> Crown final decision
```

The metrics to optimize are therefore not "number of models" but:

- Crown accept rate;
- Crown patch-token count;
- Crown rewrite rate;
- Sol Pro escalation rate;
- Opus fresh input tokens;
- Opus cached input tokens;
- Opus output tokens;
- final quality regression rate.

## Native TypingMind ceiling

TypingMind's documented multi-agent Flow executes the agents named in a fixed sequence. It does not document a cost-aware conditional branch primitive for skipping later named agents.

Therefore the physically efficient native setup is **multiple saved flows**, not one monster flow.

Anything beyond that requires:
- a TypingMind Extension;
- a custom plugin/orchestrator;
- or the already-built UberMind custom OpenAI-compatible endpoint.

Do not add an extra router-model call merely to save fractions of a cent unless workload data proves the router pays for itself.

## Upgrade ceiling

This workflow is considered generically saturated when all of these hold:

- Direct Opus bypass exists for short tasks.
- Long-context preparation is offloaded to cheap models.
- RedTeam audits the actual Builder candidate.
- Sol Pro is exception-only.
- Crown performs delta review, not redundant drafting.
- Crown system prefix is stable/cacheable.
- Dynamic Context does not poison Crown cache locality.
- provider routing preserves tool reliability.
- exact identical safe requests may use zero-token response cache.
- observed token/cost/cache telemetry is collected.
- flow selection is based on actual workload economics.

Further upgrade then requires new empirical evidence, a better model, a cheaper provider, a new TypingMind routing primitive, or a measured failure in this topology.
