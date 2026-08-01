# ELITE DUO Sonnet OS V1

This package is the focused system requested:

- **Fable 5 Max operating discipline**
- **GPT-5.6 Sol Max decision discipline**
- **Claude Sonnet 5 as the only inference model inside Claude Code**

There is no Haiku route, no model zoo, and no silent external API call.

## What this is

A clean-room dual-kernel operating system that makes separate Sonnet 5 sessions perform four roles:

1. **Fable Kernel Architect**  
   Long-horizon execution design, durable state, tool discipline, recovery, and self-verification.

2. **Sol Kernel Adjudicator**  
   Architecture, counterfactual analysis, programmatic tool strategy, contradiction resolution, and acceptance design.

3. **Elite Executor**  
   Implements the merged contract with Sonnet 5.

4. **Elite Independent Reviewer**  
   Reviews the result in a fresh context using both kernels.

Every role uses Claude Sonnet 5. Therefore Claude usage is metered as Sonnet usage, not Fable usage.

## What this is not

It does not run the actual Fable 5 weights or actual GPT-5.6 Sol weights. Prompt instructions cannot transfer model weights.

Actual Fable 5 Max or GPT-5.6 Sol Max can be used through the optional premium-pulse workflow, but those calls consume their own plan or API allowance.

## Fast install

Upload this ZIP to Claude Code and paste `INSTALL_PROMPT.txt`.

After installation:

```bash
elite-duo
elite-duo-deep
elite-duo-max
elite-duo-plan
```

## Recommended mode

Use `elite-duo` for most work. It uses Sonnet 5 medium for execution while the role agents use high or max only at decision and review boundaries.

Use `elite-duo-max` only for the hardest finite mission.
