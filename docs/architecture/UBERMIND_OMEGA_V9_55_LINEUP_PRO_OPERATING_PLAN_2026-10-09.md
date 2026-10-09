# UberMind Ω9: Claude 5.5 Lineup Budget-Aware Sovereign Routing

**October 9, 2026.** Starts at the ordinary founder prompt. The current model family is **Claude 5.5** (Opus 5.5, Sonnet 5.5, Haiku 5.5), not a documented 5.4 family. The goal is **maximal accepted frontier intelligence per limited $20 Claude Pro allowance**, not maximizing token counts or bypassing limits.

## Editable graph

[UBERMIND_OMEGA_V9_55_LINEUP_PRO_TREE.mmd](./UBERMIND_OMEGA_V9_55_LINEUP_PRO_TREE.mmd). This supersedes Ω8 as a recommended *routing scenario*, not as proof that its cross-model branches are all connected. Preserve Ω1–Ω8 architecture and W1–W30 verified code/lineage.

## The external '5.5 lineup on $20' arithmetic, made explicit

Source: https://ai.thesatyajit.com/articles/claude-haiku-5-5 and https://claude-55-lineup.vercel.app/ (calculator, sometimes inaccessible), contrasted with official https://support.claude.com/en/articles/8325606-what-is-the-pro-plan and https://platform.claude.com/docs/en/models/haiku-5-5/overview .

- Third-party projection assumes **$1,280/month API-equivalent allowance** inferred from Opus accounts, NOT $1,280 of real API credits.
- It assumes roughly **97% cached context reads, 2.5% cache writes, 0.5% output**, and that Claude Pro's private meter converts models using published API tariff ratios. Anthropic has not verified this fungible-pool assumption and gives **no guaranteed per-model weekly token quota**.
- Claimed *monthly*, cache-dominated totals: Haiku 5.5 <=100K prompt mode **83.5B**; Haiku mixed short/long **27.8B**; Haiku long >100K **16.7B**; Sonnet 5.5 **6.11B**; Opus 5.5 **3.05B**. Individual Haiku prompts over the 100K boundary have a higher per-token list tariff. These are NOT independent buckets to add together at full allocation.
- For scenario-only allocation with shares h,s,o adding to 1, **estimated total monthly tokens in billions = h * H(mode) + s * 6.11 + o * 3.05**. This is arithmetic on unverified, mutually exclusive full-allocation scenarios, not a measured quota or entitlement.
- **Balanced UberMind recommendation: 55% hypothetical consumption budget Haiku / 30% Sonnet / 15% Opus**. Total scenario = 48.2155B tokens/month at maximum short Haiku cache workload, 17.5805B at mixed Haiku, 11.4755B long. Main caveat: these are overwhelmingly reused prefix-read tokens, not newly generated intelligence, and can be constrained by the real weekly or 5-hour caps.
- Throughput-oriented 75/20/5: Haiku-short 63.9995B monthly projected, much less frontier reserve.
- Frontier-critical 35/35/30: Haiku-short 32.2785B projected, more Opus attention for novel high-stakes work.
- Choose the mode **per task and actual remaining usage**, not a rigid quota assignment. Claude does not offer a supported slider allocating 55/30/15 plan usage automatically.

## The operational model tree

1. **Prompt**: ordinary Claude chat or Claude Code session. In normal Claude chat, the model selection remains user-controlled, with no magic internal model switching or external JEV calls.
2. **W30 Hot-18 context and original 890 corpus**: retrieve only relevant #0001–#0890 ideas, PHOENIX + Total Brain + Negative Knowledge + Capability Genome. Preserve all 10 original shards, source proofs and every old unique record. Current W30 verified startup direct-import source byte footprint **329,441 bytes vs 585,706 original**, a 43.75318% *byte* reduction, NOT measured token/quota savings.
3. **E0–E4 exact engine**: if a trusted, still-applicable accepted result exists, use deterministic code, already validated results, tools and tests, requiring no new model inference for that operation.
4. **Optional Jev 1.13**: typed NOUL/CHOICE/SCORE, governed W11–W22 scoped public cache, single-flight, reservations and source validation. Only with **separate provider funding and actual owner authority**. Strict $20-only defaults to deterministic local rules. Do not infer Jev decision quality from screenshots' 16ms/fork counts.
5. **Haiku on demand**: read-only source/path/AST/document lookup, source-grounded brief findings. In Claude Code, use the new project-specific `.claude/agents/ubermind-haiku-scout.md` custom subagent (`model: haiku`, `effort: low`, read-only tools, six-turn bound). Its `omitClaudeMd: true` is **only for safe read-only scopes**: main Claude remains subject to entire canon and all AGENTS/CLAUDE policy and must pass scope-specific restrictions. No ingestion of secrets, independent deployment or policy action. Due to omitted CLAUDE.md imports, never use this subagent for privileged action or policy adjudication.
6. **Sonnet 5.5 main engineer**: normal answer, iterative implementation, fixed interfaces, typed tests; one session by default. If user runs Claude Code, `/model opusplan` (if available) chooses Opus during plan mode and Sonnet during execution, with the same shared subscription usage limits.
7. **Opus 5.5 protected Crown**: high-effort fresh architecture, inventions, unresolved science, significant risk and semantic contradictions; return source-bound executable specs, acceptance tests and the small hard residual review. Escalate whenever Haiku/Sonnet miss quality, regardless of percentage allocation.
8. **Optional agent team**: only for independently owned code modules; Sonnet builder plus independent Sonnet falsifier, Haiku source scout if genuinely additive. Teammates each consume additional *shared* usage. Worktree isolation and task claim locks do not equal conflict-free edits automatically.
9. **Reality Court**: deterministic checks, adversarial tests, provenance, allowed external effects and accepted output. Then PHOENIX Proof Economy #0057, Error Economy #0058, Prediction Accounting #0059, Civilizational Memory #0060, Civilization Git #0061, Compound Interest #0226, Self-Falsifying #0653 and Recursion Proof #0877 create bounded future reuse without deleting original ideas.

## A separate explicit API list-price illustration (not Pro account billing)

Take a **defined** synthetic reference workload with total 1M input and 200K generated output tokens, all Opus 5.5 normally:
- Opus-only API-equivalent: 1M input × $4/M + 200K output × $20/M = **$8.000**.
- Sample routed mix **does not prove identical accepted quality**: Haiku 5.5 short-prompt 600K in/30K out = **$0.075**; Sonnet 5.5 300K in/120K out = **$1.800**; Opus 5.5 100K in/50K out = **$1.400**. Combined **$3.275** = **59.0625%** list-price difference versus $8 assuming identical summed token geometry. Tool costs, cache changes, subagent overhead, independent tests/retries and quality mismatches are NOT included. The monthly projections above are a different simulation using cache-heavy token proportions; don't combine the two sets as if measured.
- **Your actual $20 Claude Pro cash subscription stays $20** inside included usage, with no refund. It includes Claude Code but **not Claude API credits**. No Haiku 83B guarantee or quality-equivalent work multiplier is established. Anthropic's usage quota is private, shared across models and across Claude and Claude Code. API keys in `ANTHROPIC_API_KEY` can cause separately billed use, so prefer correct subscription sign-in.

## Normal-Claude paste-once Project Instruction

> Act as **UBERMIND Ω9**, the 5.5 Sovereign Intelligence Router. Treat my ordinary message as the mission. Optimize for the highest quality accepted outcome per unit of my existing Claude Pro allowance. Recover only actually accessible and relevant original 890 founder idea IDs, GENESIS, Total Brain, PHOENIX, source policies, tools and accepted work, preserving all originals. Try exact verified work before new inference. Route narrow non-sensitive read-only searches to a Haiku scout only if available and it genuinely reduces main context; use Sonnet for well-specified coding and ordinary work; use the strongest available Opus thinking for novel architecture, hard science, high-risk uncertainty and failed quality gates. In Claude Code, choose opusplan if actually available and helpful. In normal Claude chat, do not pretend that you can secretly change models. No always-on agent swarms; use independent workers only if extra usage buys independent tests or avoids expensive context pollution. Jev uses separate, existing legitimate provider permission or stays a deterministic local rule. No paid API fallback, Fable, additional subscriptions or hidden credits. Preserve complete 890/GENESIS lineage. Check tests, permissions, source SHA and actual outcomes before claiming done, then leave a compact PHOENIX checkpoint. My next prompt is the task.

## Outcome measurement required before claiming world's best

Record **accepted complete tasks per weekly percentage of real Pro usage**, model availability and actual `/status`, not screenshot billions. For an apples-to-apples comparison, use several representative tasks, grade accepted quality blindly, compare Sonnet-only against selective Haiku scouting and Opus-on-call, and charge all coordinator/subagent work to one meter. There are no live matched Claude Pro usage results yet for this Ω9 design. No timers, paid model calls or quota-evasion methods authorized.

**PHOENIX:** `UBERMIND-W31-20261009-LINEUP-PRO-QUALITY-ESCROW`.
