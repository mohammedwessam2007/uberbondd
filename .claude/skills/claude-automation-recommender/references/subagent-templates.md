# Subagent Recommendations

Source: Anthropic `claude-code-setup` pinned at `ed404106fcd80ba98ecb7c851e531dcb626d13b7`.

Subagents are specialized Claude instances with separate context/tool access. Useful patterns include code review, security review, test writing, API documentation, performance analysis, UI/accessibility review, dependency analysis and migrations.

For UberBond, prefer focused workers with bounded tools and explicit mission/result schemas over generic agent swarms. Every subagent remains a replaceable supplier beneath canonical state, authority and evidence.

Potential project placements:

```text
.claude/agents/code-reviewer.md
.claude/agents/security-reviewer.md
.claude/agents/test-writer.md
```

Read-only reviewers should receive Read/Grep/Glob rather than write or shell access. Writing/testing agents receive only the minimum tools required by their mission. A subagent's confidence or prose cannot manufacture provider success, payment, customer acceptance, demand, consent or renewal.
