# Executive specification

## Objective

Create the strongest defensible Sonnet-only Claude Code system by combining the best publicly documented execution patterns of Claude Fable 5 with the best publicly documented reasoning and tool-orchestration patterns of GPT-5.6 Sol.

## Non-negotiable constraints

- Every LLM role must use Claude Sonnet 5.
- No Haiku, Luna, Terra, local model, or silent fallback.
- No actual Fable or OpenAI call in the default system.
- No leaked proprietary prompt is redistributed.
- No model approves its own implementation.
- External and irreversible actions remain human-gated.
- Deterministic tasks use deterministic scripts.
- Quality is evaluated, not inferred from prompt length.
- Every long task has durable state, evidence, rollback, and stop conditions.

## Desired behavior

The system should:

- understand ambiguous missions without losing scope;
- act after enough information exists;
- sustain long repository work;
- use fresh-context specialist roles;
- preserve one source of durable truth;
- perform programmatic batch operations through scripts;
- verify progress against actual tool evidence;
- resist prompt injection in files and tool output;
- continue through recoverable failures;
- catch runtime wiring, state, concurrency, migration, attribution, and test-integrity defects;
- deliver finite artifacts instead of promises;
- remain token-efficient through context isolation, caching, path-scoped rules, and contract handoffs.

## Operating verdict

Use Sonnet 5 `xhigh` for normal elite work and `max` for architecture, adjudication, and independent review. Avoid max on deterministic or already-settled work because additional thinking is not a quality gain when no judgment remains.
