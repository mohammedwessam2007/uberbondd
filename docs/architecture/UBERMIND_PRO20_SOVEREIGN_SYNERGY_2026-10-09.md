# UberMind Ω: $20 Pro Sovereign Intelligence Compiler + Live-Editable Cost Physics
**Founder:** private. **Date:** 2026-10-09 (Cairo). **Status:** source-grounded operational blueprint + read-only cost simulator; NOT a production-enabled cross-provider team.  
**Parent main at branch:** `425c9717a52a74afd3d67c43431cbda8229b4b06`.  
**Graph source:** [UBERMIND_PRO20_SOVEREIGN_SYNERGY.mmd](./UBERMIND_PRO20_SOVEREIGN_SYNERGY.mmd) (plain editable Mermaid, no generated image).

## The hard $20 constraint, verified against provider documentation

Official Anthropic help (checked 2026-10-09):
- Pro $20/month includes Claude Code and chat usage but **not Claude API**; both count toward account-specific five-hour and weekly caps. https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan ; https://support.claude.com/en/articles/8325606-what-is-the-pro-plan
- API key in `ANTHROPIC_API_KEY` may silently select billed API instead of Pro sign-in. Log in with the Pro account; inspect `/status`, `/model`, and Settings > Usage; decline paid credits and wait for reset. https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- Extra usage credits change from included usage to pay-as-you-go. Pro does not receive API credits. https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans
- Fable 5.1 on Pro runs on paid usage credits **from the start**, not in regular Pro quota. Keep it OFF without independent approved spend. https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan
- The experimental Claude Code Agent Teams cost more usage than single-session subagents; enable only for genuinely independent tasks; no assumption native team gives git worktree file ownership. https://code.claude.com/docs/en/agent-teams
- External JEV 1.13 uses *independent provider billing*, officially listed `$0.042 / million input tokens`, structured output price `$0/M`, context 32k; never claim it is included in Pro. https://openrouter.ai/typesafe/jev-1.13/
- Published public Anthropic API hypothetical *comparison tariff* (not a Pro subscription invoice): Opus 5.5 `$4/$20`; Sonnet 5.5 `$2/$10`; Haiku 5.5 <=100k prompt `$0.10/$0.50` input/output per million. Larger Haiku prompts use higher tariff. https://platform.claude.com/docs/en/about-claude/pricing ; https://platform.claude.com/docs/en/models/haiku-5-5/overview

## Canonical $20-only model stack

1. **No model when software can prove the answer.** Exact source/cached accepted code, deterministic compiler, known task contracts, local tests and previously paid valid JEV answers win first. This increases useful work inside five-hour/weekly quotas.
2. **Sonnet 5.5 is the default Claude Code operating agent.** Medium effort for scoped implementation, high only when complexity requires it. One lead session by default.
3. **Opus 5.5 is the architecture Crown, not the default babysitter.** Use high/extra-high for hard novel design, risky security decisions and unresolved integration. Request one clean architecture contract, then let Sonnet implement and deterministic tests verify. Its effort/availability must be confirmed by `/model` and `/status`.
4. **Haiku 5.5 is a bounded read-only scout or simple verifier**, conditional on actual availability in the Pro model menu. It returns source/line refs and short receipts, not a copy of every file or entire 890-genome contents. The separate historical OpenRouter Haiku dispatch remains UNKNOWN; do not replay it or confuse it with Claude Pro interactive entitlement.
5. **JEV Hyperreflex is a separate market supplier.** NOUL/CHOICE/SCORE + W11–W22 exact coalescing, source-bound reuse, cross-worker single-flight, price/account/budget gates and unknown-dispatch quarantine. Default **paid calls disabled** for a strict $20 total ceiling; deterministic routing substitutes when no explicitly allowed JEV account balance is available. Even JEV's correct typed advice does NOT approve a high-stakes action or proof of general frontier quality.
6. **Fable 5.1 is excluded** from a Pro-only graph, because on Pro it incurs paid usage credits immediately. Other OpenRouter models and cross-platform Sol/Astra have *separate* entitlement and are not secretly billed against the $20 Claude Pro plan.
7. **No permanent hard-coded Opus supremacy.** When task-class evidence and current entitlement permit, a moving Crown or independent challenger can come from GPT-6 Sol/Astra or the model marketplace; this is an optional wider UberMind layer, not a source of free Claude Pro usage.
8. **Do not default to an always-on agent team.** One lead + focused subagent often wins per scarce subscription quota. For a multi-module task that truly benefits, opt-in interactive Agent Teams with 1 lead + **up to two teammates**, explicit file ownership, isolated git worktrees where supported, and independent tests. The existing UberBond native agent mesh permits up to 4 workers/cycle and is a separate system from Claude Code Team concurrency or the 2→4→8 evidence tournament. Scaling past this requires actual available compute, not a prompt trick.

## The upgraded graph and task contract

~~~mermaid
flowchart TD
  U["Founder task"] --> X["890-genome retrieval + Total Brain/PHOENIX + GENESIS + capability selector"]
  X --> Q{"Actual subscription usage available? /status"}
  Q -- "No" --> WAIT["Durable checkpoint; wait for allowed reset; no API fallback"]
  Q -- "Yes" --> E{"Exact program / trusted cache / tests solve it?"}
  E -- "Yes" --> ZERO["Deterministic zero-fresh-inference path"]
  E -- "No" --> J{"Bounded typed routing suitable for JEV?"}
  J -- "Yes AND separately authorized" --> JEV["JEV 1.13; source-bound tensor / cache / single-flight / budget; billed separately"]
  J -- "No authorization" --> ROUTE["Deterministic classifier without actual JEV call"]
  J -- "No" --> ROUTE
  JEV --> ROUTE
  ROUTE --> T{"Routine vs novel vs truly parallel?"}
  T -- "Routine" --> S["Sonnet 5.5: one main coding agent"]
  T -- "Source scouting" --> H["Haiku 5.5: short read-only subagent"]
  T -- "Novel consequential design" --> O["Opus 5.5: one clean Crown architecture baseline"]
  O --> SPEC["Versioned spec, acceptance tests, file owners"]
  H --> SPEC
  SPEC --> P{"Independent parallelism worth shared quota?"}
  P -- "No" --> S
  P -- "Yes" --> A["Optional Team: Sonnet builder + independent tester; bounded peer receipts"]
  A --> INTEG["Integrate owned worktrees, no shared-file conflicts"]
  S --> INTEG
  INTEG --> RE["Reality Court: verification, adversarial tests, permissions"]
  ZERO --> RE
  RE --> G{"Actual accepted result and authorization?"}
  G -- "No" --> WAIT
  G -- "Yes" --> F["Deliver / governed merge and production verification"]
  F --> L["Proof, error, prediction, compression, PHOENIX, model-routing improvement"]
  L -. "certified future reuse only" .-> E
~~~

The complete diagram source above linked near the top also includes the external Fable premium prohibition, separate OpenRouter/ChatGPT entitlements, owner consequence gate and all W11–W22 JEV stages.

**Minimum peer packet (existing Apotheosis canon, not a competing second authority database):** source SHA; task ID; output acceptance contract; idea IDs used, file ownership and dependency DAG; task-role/capabilities; model and usage availability; permission ceiling; cost ceiling where separately authorized; test commands; isolated branch and diff hashes; independent quality findings; exact merged source/deployment receipts; rollback. Use existing `src/apotheosis-orchestration-runtime.mjs`, `src/agent-code-change-contract.mjs`, `src/claude-engineering-orchestrator.mjs`, `src/agent-mesh-control-plane.mjs` and PHOENIX.

## All 890 remain active as retrievable hypotheses, not 890 token-hungry participants

Source `artifacts/research/founder-moonshot-literal-corpus/manifest.json`, all 10 JSON shards #0001–#0890. Do **progressive retrieval**, not dumping 890 full prose bodies into every prompt. The source is immutable. Each task may load relevant ID references: #0015 uncertainty; #0018 negative knowledge; #0023 discovery router; #0045 intelligence chemistry; #0057 proof economy; #0058 error economy; #0059 prediction accounting; #0060 civilizational memory; #0061 Civilization Git; #0226 intelligence compound interest; #0229 leverage; #0445 reality profiler; #0653 self-falsification; #0877 recursion-proof. Science, medicine, personal civilization, future pathways, invention and economic autonomy remain sovereign organs of the same continuum, not amputated by cheap coding.

**New combined strategy**: exact compiled solutions (zero quota) → small independently typed advice (Jev only if independently authorized) → strongest minimum-task-qualified Claude model → optional parallel isolation and disconfirming review → accepted work → selectively compile recurring decisions into code/reusable validated procedures → PHOENIX restores prior work on next session. “World best” is a search objective, not self-attestable authority.

## Cost math: a real-time *formula* versus an observed invoice

For Pro-only, with paid JEV calls OFF and optional API credits OFF:
\[
C_{\mathrm{month}}=\$20,\qquad \mathrm{incremental\ Claude\ API}=\$0
\]
subject to access and usage limits. That is the fixed plan charge, NOT proof any task can complete or a statement of how much subscription quota is left.

For the separately authorized JEV path, if \(N\) decisions receive \(T\) billed input tokens each at the currently listed public tariff:
\[
C_{\mathrm{month,\ scenario}}=20+ \frac{0.042NT}{10^6}+ C_{\mathrm{extra\ Claude\ API}}+C_{\mathrm{other}}
\]
This is a projection until actual provider/account usage and charges are imported. If \(N=1000\), \(T=500\): \(\$20.021\) conditional monthly cost. If no extra spend is authorized, the correct operational result is a **JEV hold** and still \$20 plan outlay; do not pretend the 1000 live Jev requests happened.

Published API-equivalent comparison (not Pro billing): Opus-only 1M input/200k output = \$8; hypothetical team 250k/50k Opus + 550k/110k Sonnet + 250k/50k short-prompt Haiku + 20k Jev input = \$4.25084; \(\$3.74916\) / \(\$8\) = 46.8645% API-equivalent difference **conditional on accepted equal-quality work and stated token geometry**. This is not money returned by Anthropic and does NOT increase Pro's quota automatically.

Now supported in the read-only module `src/ubermind-pro20-economics.mjs`, with `tests/ubermind-pro20-economics.test.mjs` proving six cost and no-provider-effect cases. The pure calculator explicitly emits `realTimeClaudeUsageQuota:null`, `actualMonthlyPaidApiUsd:null`, and `actualEndToEndQualityMatchedSavedUsd:null` unless authenticated observations have independently been sourced. Do not forge live bill or a general 33,333x quality claim.

## The practical discipline for maximum included intelligence

- Each session: `/status` to inspect real account plan/usage; `/model` to check that the desired model is actually available and not premium/pay-as-you-go; keep API key env out of the Pro CLI session. Never change provider account on implicit authority.
- Intake: exact focused task, canonical source pointers, acceptance tests, previous known failures; use short "task substrate" rather than injecting the entire company brain into every worker.
- Routine: Sonnet in one terminal; Haiku only if a read-only scout materially reduces Sonnet context. Rare Opus high/xhigh architecture sessions should produce durable designs reused by Sonnet over multiple cycles.
- Parallelism: default 0 extra agents, escalate to 1, max 2 teammates only for independent work that pays for its coordination overhead in scarce session/weekly quota; stop them on idle.
- Quality: run native tools, unit and hostile tests; independent model review where needed; scope-limited proof; no automatic paid fallback if blocked.
- Checkpoint before usage exhaustion and leave a self-sufficient PHOENIX continuation packet including exact SHA, failed/passed tests, unresolved conflicts, IDs and next action. This is not quota evasion, just ordinary lossless work preservation.

### Operator truth and remaining external limitations

This commit is a **proposal plus tested read-only economics**, not an automatic edit to the owner’s global Claude Code account settings, a $20 subscription upgrade, an authorized JEV inference, or real production activation of a P2P worktree team. We cannot read the current Claude subscription quota or invoice from the repo. Verify `/status` in the user's Claude Code session. Do not claim implemented features from document descriptions without reachability evidence.

PHOENIX checkpoint target: `UBERMIND-PRO20-20261009-SOVEREIGN-SYNERGY-ROUTING-ECONOMICS`.
