# UberMind Fair-Cost Frontier Reference — 2026-10-08

## New frontier after PR #1306

Founder requests the actual **33,333.333x** equal-or-higher-quality, <=USD30/month all-in system versus USD1M independently proven legitimately cheapest direct frontier reference. Preserve all original 890 moonshot idea records; this is not an excuse to optimize only one narrow task class.

Current sealed historical comparison (two tasks, Oct 7): observed Opus cost USD 0.063696, observed Sol candidate USD 0.031808, evaluator USD 0.0245325. **Historical measured model-only factor: 2.0025150905x. Historical proof-inclusive factor: 1.1305543969x.** These values apply to only these two sampled tasks. They are *not* the global multiplier, and no new independent held-out matched task was added here.

## Newly discovered fair reference condition

First-party current public price evidence: [OpenRouter Opus 5.5](https://openrouter.ai/anthropic/claude-opus-5.5/) $4/$20 per million input/output; [OpenRouter Opus 5.5 batch](https://openrouter.ai/anthropic/claude-opus-5.5:batch/) $2/$10 per million input/output and cached input $0.10/M for batch, versus $0.20/M standard. Both route listings show up to 1M context and 128K max output. Anthropic docs note provider-side batch beta may have distinct 300K output limits; **do not conflate direct Anthropic batch beta with an OpenRouter-hosted route**.

Batch suitability is conditional on client delivery deadlines, request capabilities and authentication. The original Oct 7 comparison was actually performed on a synchronous Opus reference, not batch. A hypothetical half-cost reference would shrink its two-task proof-inclusive ratio to **0.5652771985x** and candidate-only to **1.0012575453x**, *if* that exact workload could have met batch constraints and the tariff applied. This is a modeled fair-alternative scenario, **not a retroactively revised historical paid bill** or measured saving.

## What was implemented

- `src/ubermind-cheapest-eligible-reference.mjs`: pure budget/capability/workload comparator, output/context and maximum-wait checks, as-of-day price refusal and self-attestation warning; distinguishes asynchronous batch from interactive deadlines. Does not infer identical model quality across unrelated model families.
- `scripts/ubermind-cheapest-reference-doctor.mjs`: production read-only standard-vs-batch illustrative check plus historical two-task conditional comparison with `measuredMultiplierIncreaseThisCycle:0`.
- New native Node tests for the two priced routes, urgent nonbatch workload, stale price, capacity overflow, JEV-vs-Opus model mismatch, duplicate routes, historical exact bills and zero denominators. Never mint empirical 33,333x from tariff math.
- Existing quality-first law unaffected: JEV advisory shadow; source-exact E1 preserved; no automatic Crown suppression; no hidden-model paid replay, 890 originals retained.

## Next meaningful empirical advancement

Evaluate genuinely new diverse independently blinded finished-work tasks against the cheapest eligible current frontier quality route. Use authenticated provider/evaluator bills, original input/output token receipts, task fingerprint, production SLA, realistic cache and batch options, independent grades, data-retention policy and real demand. Include ALL system costs, not just model token bills. The global 33k target requires independently certified matched-quality evidence and an actual $1M plausible workload with actual <=$30 all-in spend. A code change, symbolic reuse, duplicate synthetic consumers or changing how `cost` is computed does not increase the **measured** multiplier.

**This module changes calculation honesty and route selection, not actual observed multiplier.**
