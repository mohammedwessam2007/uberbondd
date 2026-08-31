# Skills Recommendations

Source: Anthropic `claude-code-setup` pinned at `ed404106fcd80ba98ecb7c851e531dcb626d13b7`.

Skills are packaged expertise, workflows and reusable task instructions. Project skills belong at `.claude/skills/<name>/SKILL.md` and can include references, scripts, templates and examples.

## Good UberBond skill candidates

- project conventions and constitutional invariants;
- PR/exact-diff review;
- test generation following existing patterns;
- migrations with validation;
- provider adapter implementation packets;
- security review;
- capability acquisition/dedupe;
- deployment verification;
- evidence/receipt assembly.

## Invocation control

Use user-only invocation for side-effecting or consequenceful operations. Use Claude-only background skills for stable project knowledge. General safe analytical skills may remain available to both.

## Creation law

A new skill should exist because a repeated or specialized workflow benefits from durable instructions. It must not become a shadow CRM, scheduler, payment ledger, company memory or policy system. Prefer composition with the existing UberBond primitives.

When a skill is created or updated, record source evidence, expected benefit, authority ceiling, test/verification, rollback and whether Task Observer evidence motivated the change.
