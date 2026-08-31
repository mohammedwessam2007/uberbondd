# Plugin Recommendations

Source: Anthropic `claude-code-setup` pinned at `ed404106fcd80ba98ecb7c851e531dcb626d13b7`.

Plugins are installable collections of skills, commands, agents and hooks. Common official categories include code review, plugin development, feature development, code simplification, git/commit workflows, frontend design, automation rules, security guidance and language servers.

For UberBond:
- prefer official/current sources when equivalent;
- install only when a maintained bundle is materially better than a narrow project skill;
- inspect the bundle before activation;
- dedupe against existing UberBond capability;
- keep plugin state subordinate to current repository canon;
- no plugin gains customer-contact, provider-call, spend, deployment, credential, DNS, payment, KYC or production-mutation authority.

Typical Claude Code management commands include `/plugin install <plugin-name>`, `/plugin list`, and `/plugin info <plugin-name>`. Runtime installation must leave a version/health/rollback receipt.
