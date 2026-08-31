# Hooks Recommendations

Source: Anthropic `claude-code-setup` pinned at `ed404106fcd80ba98ecb7c851e531dcb626d13b7`.

Hooks automatically run commands in response to Claude Code events. For UberBond, hooks are useful only when they preserve or verify canonical invariants and never create undeclared external effects.

## Common safe patterns

- Prettier/ESLint/Ruff/Black/gofmt/rustfmt after edits where configured.
- Type checking after edits when the project has an established checker.
- Related tests after relevant edits.
- Block direct edits to `.env`, credentials/secrets files and lock files unless a mission explicitly requires them.
- Notification hooks for permission prompts or idle prompts.

## Detection → recommendation

| Signal | Candidate hook |
|---|---|
| Prettier config | format after Edit/Write |
| ESLint/Ruff config | lint/fix after Edit/Write |
| TypeScript config | type-check after Edit |
| Test directory | run related tests after Edit |
| `.env`/secret files | block unsafe direct edits |
| lockfiles | block direct edits; use package manager |
| Go project | gofmt after Edit |
| Rust project | rustfmt after Edit |

## UberBond placement

Hooks belong in `.claude/settings.json` and must remain subordinate to `AGENTS.md`, `UBERBOND_CANON.md`, protected-path rules and external-effect authority.

Never create a hook that silently sends messages, deploys, spends, mutates provider/customer state, changes DNS/credentials, or promotes worker output into commercial truth.
