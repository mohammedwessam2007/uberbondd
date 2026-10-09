# UBERMIND Ω16 | Minimum-Sufficient Conditional Swarm (W38)

**2026-10-10.** Founder: “Find a better graph, less cost; we'll keep working like this.” Improve Ω15's unnecessary agent spawn pattern without discarding the previous full UberMind intelligence, all **890 original ideas**, GENESIS, Sovereign Cognitive Continuum, Personal Civilization, Total Brain, PHOENIX, negative knowledge, Capability Genome, JEV W11–W22, Reality Court, source provenance or any other mission.

**[Complete editable Ω16 source graph](./UBERMIND_OMEGA_V16_CONDITIONAL_SWARM_MINIMUM_COST_2026-10-10.mmd)**

## One important change, validated by the provider's architecture docs

Anthropic explains that each custom subagent has a separate context and **its own calls count against the same Claude subscription usage limits**. A short dedicated Haiku scout can keep large research out of the lead's context, but launching many agents increases total work. **Agent teams** are heavier than targeted subagents because participants run independent Claude sessions. Sources: https://code.claude.com/docs/en/sub-agents and https://code.claude.com/docs/en/agent-teams .

The previous W37 **fixed illustration** always ran four Haiku scouts, one Sonnet verifier, one Opus reviewer: 6 calls, **$0.2512** API-equivalent after the main model allocation. Ω16 instead uses **conditional calls**:
- **Haiku source scout**, one call, full prompt 18k / output 2k tokens, model tariff $0.0028; only if needed for a task. For comparison assume it always runs on this particular class, trigger probability 1.0.
- **Sonnet independent review**, one call, full prompt 30k / output 4k tokens = $0.10 per call; *assume* triggered on 35% of these tasks, expected $0.035.
- **Opus Crown adversarial review**, one call, full prompt 20k / output 3k = $0.14; *assume* triggered on 15% of these tasks, expected $0.021.
- **Modeled expected auxiliary overhead** $0.0588; **all-on worst-case** $0.2428. These probabilities are founder-unverified examples, not measured task failure rates or evidence that fewer reviewers maintain the same quality. Required review cannot be skipped on the basis of a cheaper expected cost.

Crucial: for a fully solved and source-verified entire task, **do not launch even the Haiku scout**. Use existing E0–E4 execution with appropriate native tests instead. No fresh model call for that subtask does not imply zero Claude chat account metering.

## Exactly comparable API-equivalent math

Common baseline: ALL Opus 5.5, 1 million input + 200k output, **$8.00** official uncached API-equivalent.

W37 retained primary routing 20% Opus / 50% Sonnet / 30% Haiku, $3.66 per full unresolved baseline work. At certified native reuse share `R`, Ω15 cost = `3.66 * (1-R) + .2512`.

Ω16 retains **the identical primary model assignment**, changing only expected overhead:
`Ω16 expected = 3.66*(1-R) + .0588`, worst-case `3.66*(1-R) + .2428`.

| Source-certified reusable original meter-weighted main work R (ASSUMED) | Ω15 fixed six-call scenario | Ω16 conditional expected scenario | Reduction versus all Opus, Ω16 |
|---:|---:|---:|---:|
| 0% | $3.9112 | $3.7188 | 53.515% |
| 40% | $2.4472 | **$2.2548** | **71.815%** |
| 60% | $1.7152 | **$1.5228** | **80.965%** |
| 80% | $0.9832 | **$0.7908** | **90.115%** |
| 100% fully exact replay | skip six agents; near-zero extra inference | skip all agents; zero modeled fresh inference | cannot infer total plan usage |

The difference is **$0.1924 less modeled expected auxiliary work** on these assumptions at every R. Relative value increases for high-reuse jobs. Absolute percentages are NOT observed plan quota savings.

### Optional future, strictly gated model mix improvement

A separate hypothesis: move from 20/50/30 to **10% Opus / 50% Sonnet / 40% Haiku**, only when evidence establishes that the extra Haiku-suitable units genuinely meet the original Opus-level acceptance. New primary proxy `$2.88` before reuse; at R=60%, modeled $1.152 + $0.0588 = **$1.2108**, or **84.865% below the $8 API-equivalent reference**. This is a *more aggressive cost hypothesis*, not the default correct-quality recommendation. The quality-preserving frontier may instead require MORE Opus, in which case take the higher cost.

With the default same-quality-unknown 20/50/30 split and hypothetical trigger rates, reaching a **90% API-equivalent cut** needs **79.7486339% certified native reuse** of the original weighted main work, compared with W37's 85.0054645% if all six auxiliary calls were always made. This is cost break-even math, not measurement of actual source reuse or a guarantee of identical quality.

## Execution route

Founder will, existing canonical security and original 890/GENESIS -> quality/source/authority escrow -> selective retrieval and E0-E4 native executor -> incremental decision-DAG/Cognitive Multicast/negative-knowledge -> local JEV-style NOUL/CHOICE/SCORE decision logic (separate paid JEV inference disabled in strict $20 Pro setup) -> one Sonnet worker for scoped implementation OR full Opus if novel/hard OR one Haiku read-only scout if evidence discovery would otherwise flood context. Worktrees/agent team only if truly independent and task's full usage cost and quality permit it. Native tests first; Sonnet verifier or Opus review triggered by actual quality/security/uncertainty criteria, not unconditional schedules. PHOENIX persists source-bound accepted outcomes and verified reuse. No automatic 16-agent swarm, no fabricated real-time fork metrics, no new secret/BYOK/paid API route.

## Files and verification

- `src/ubermind-conditional-agent-optimizer.mjs`: pure conditional probability and worst-case model from existing W37 all-in cost engine. Role trigger probabilities and R are explicitly USER-ASSUMED, not observed. No actual plan-metric claims.
- `tests/ubermind-conditional-agent-optimizer.test.mjs`: 13 hostile source-level tests, includes exact W36/W37 price import, worst/expected math, long-Haiku tier, no-provider/quality truth gate.
- `scripts/ubermind-conditional-agent-doctor.mjs`: standalone native Node CLI for illustration without inference or spend.
- `.claude/skills/ubermind-lean/SKILL.md`: add short on-demand Ω16 pointer, no extra root CLAUDE.md hot imports.

**Real money:** monthly Claude Pro is still $20, actual five-hour/weekly metered usage remains **UNKNOWN**. The all-in model prices above are **API tariff illustrations**, not subscription-dollar charges or proof of Opus-equivalent quality.

**Quality gate:** if an Opus review was actually necessary to attain highest-quality work, its real call MUST execute, regardless of what trigger probability makes our expected chart look better. A cheap but rejected answer has no savings.

**PHOENIX:** UBERMIND-W38-20261010-OMEGA16-CONDITIONAL-SWARM-QUALITY-BOUNDARY.
