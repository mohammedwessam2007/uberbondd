# UBERMIND Ω15 | Combined Claude 5.5 family + subagents + JEV + exact source reuse + full intelligence

2026-10-10. This is the founder's requested **combined** model, not a model tariff comparison in isolation. The requirement is **maximum accepted task intelligence** while minimizing the existing $20 Claude Pro plan's five-hour and weekly usage. The original 890 ideas and GENESIS, Wessam Singularity, Sovereign Cognitive Continuum, Personal Civilization, UberBond, Total Brain, PHOENIX, Capability Genome, JEV W11-W22, Reality Court and all original sources are preserved with no amputations.

**[Editable complete diagram](./UBERMIND_OMEGA_V15_ALL_IN_AGENT_MESH_COST_2026-10-10.mmd)**

## Verified reference tariffs

Published Anthropic API rates on 2026-10-10 per million input/output tokens, NOT Claude Pro allowance conversion: Opus 5.5 $4/$20; Sonnet 5.5 $2/$10; Haiku 5.5 $0.10/$0.50 per prompt of <=100,000 input tokens; Haiku longer prompts $0.50/$2.50. Sources: https://platform.claude.com/docs/en/models/opus-5-5/overview , https://platform.claude.com/docs/en/models/haiku-5-5/overview , https://platform.claude.com/docs/en/about-claude/pricing . Anthropic separately documents shared Pro five-hour/weekly limits and model/effort/context factors at https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work and https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan .

## Model all cumulative agents, not just the cheap token allocations

Baseline = 1 million input + 200,000 output tokens on Opus 5.5 = **$8.00** tariff equivalent, a synthetic fixed geometry.

For the main unsolved work only: **20% Opus / 50% Sonnet / 30% Haiku** model share gives API proxy $3.66 if no work reused. This split is not independent proof those units can be delegated with Opus-quality results. A native E0-E4 certified source-reuse fraction R (defined as share of the baseline meter-weighted main work provably solved with no *fresh* inference, not share of idea count or source bytes) makes this $3.66*(1-R). Every auxiliary scout/verifier/Opus review call, new coordinator prompt, replay, retry and acceptance test that calls Claude must be added. Other deterministic local tests cause no separate API inference in this model.

**Explicit six-call example, with whole prompt and output token geometry:**
- Haiku scout: 4 calls, each 18,000 input and 2,000 output, aggregate tariff **$0.0112**.
- Sonnet independent verifier: 1 call, 30,000 input and 4,000 output, tariff **$0.10**.
- Opus Crown reviewer: 1 call, 20,000 input and 3,000 output, tariff **$0.14**.
- **Total auxiliary agent calls: 6; total overhead $0.2512**. This is not a real Claude Code trace, just an explicit illustrative usage ledger. All repeated coordinator context, extra calls, cache and tool-loop errors must be included when observed.

Therefore **combined theoretical API price** is:

`C = 8*(1-R)*(0.20 + 0.5*0.50 + 0.025*0.30) + 0.2512 = 3.66*(1-R)+0.2512`.

| R: ASSUMED independently certified exact reuse | $ All-In API equivalent | Arithmetic reduction from $8 |
|---:|---:|---:|
| 0% | $3.9112 | 51.11% |
| 40% | **$2.4472** | **69.41%** |
| 60% | **$1.7152** | **78.56%** |
| 80% | **$0.9832** | **87.71%** |
| 90% | **$0.6172** | **92.285%** |

With **all six auxiliary calls still triggered**, theoretical minimum price floor even if R=100% is $0.2512, i.e. 96.86% maximum tariff reduction. However, **when the task is already 100% source-certifiably solved, the optimal router must not launch six useless agents**, so avoid charging optional reviewers and scouts on true native-only source work. The regular Claude user prompt might still consume subscription quota; do not call it 0% five-hour usage.

The R threshold to cut this specific synthetic $8 reference by 90%: **85.0054645%** certified work. To cut 95%: **95.9344262%**. To reach 99% is **mathematically impossible with a fixed $0.2512 auxiliary bill**, since 99% reduction would allow only $0.08. These are arithmetic only; actual certified reuse and blind quality matching are **UNKNOWN**. If a task is genuinely new high-complexity Opus research, essential Opus reasoning may use ~100% or more of the reference after extra team overhead. Do not force cheap models and call a quality failure savings.

## Full UberMind decision tree with two separately enforced gates

1. **Authority and quality gate**: Original founder hierarchy -> existing 890/GENESIS/PHOENIX/Capability Genome -> source SHA/task hash/acceptance rubric, permissions and intended frontier-quality benchmark.
2. **Exact native substrate**: reuse source-verified E0-E4/semantic DAG/multicast/negative knowledge. Actually execute `node scripts/ubermind-five-percent-preflight.mjs` in authenticated checkout when task relevance warrants it; its existing allowlisted JSON source work only covers bounded tasks, not all frontier reasoning.
3. **Dynamic local JEV**: NOUL/CHOICE/SCORE and guarded W11–W22 policy, with separately paid JEV runtime OFF under strict $20 subscription, no provider billing.
4. **Model roles**: bounded Haiku file scout `.claude/agents/ubermind-haiku-scout.md` only when net beneficial; Sonnet primary scoped builder with native tests; Opus full-strength architect/falsifier and reviewer for novel critical unknowns. For a task where frontier Opus must perform everything, keep Opus, no substitutions.
5. **Subagents and agent teams are conditional**: full cost of a scout includes its system/context prefix and output, each retry, all coordination turns. Team launches only with independent task slices, proven cost-quality justification and isolated path ownership. Use succinct source-grounded delta receipts, not full transcripts.
6. **Reality Court**: independent acceptance + held-out reference standards, and no permission widening. Failed cheaper output forces correct strong review and must count all retries.
7. **PHOENIX compound reuse**: certify repeatable results without modifying original 890 ideas. Subsequent matching subtasks may skip inference entirely; this is the real long-run lever.
8. **Separate monetization vs plan meter**: API price estimate is proxy only. Actual $20 Pro subscription bill reduction = 0%, and five-hour/weekly quota saved is unobserved until authenticated matching-run /usage plus independent grading. No JEV, Fable, Claude API, extra subscription purchase, cache-price assumptions or evasion.

## New executable instruments

- `src/ubermind-55-agent-mesh-total-cost.mjs`: standalone all-in pure agent cost calculator importing official W36 rates; counts all explicitly supplied role calls/retries, quality unverified, no provider calls. Also calculates minimum conditional source-certified reuse for requested API-equivalent cuts and refuses impossible fixed-overhead targets.
- `scripts/ubermind-55-agent-mesh-doctor.mjs`: run `node scripts/ubermind-55-agent-mesh-doctor.mjs` in current checkout to print example ledger, scenarios and break-even. Zero API calls, no spend.
- `tests/ubermind-55-agent-mesh-total-cost.test.mjs`: 13 hostile math, extra-agent-overhead and fail-closed tests; registered in current native JEV suite.

**DO NOT assert real Pro usage or max-Opus quality achieved from these numbers alone.** Before promoting a model assignment, independently test *the same task* under the all-Opus reference and the entire UberMind workflow and measure the complete subscription usage. Do not normalize to identical tokens when a real subagent changes reasoning length without observing the actual tokens.

**PHOENIX ID:** UBERMIND-W37-20261010-INTEGRATED-AGENT-MESH-REAL-COST-WITH-QUALITY-GATES.
