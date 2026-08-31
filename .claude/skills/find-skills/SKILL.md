---
name: find-skills
description: Helps discover installable agent skills for a genuine UberBond capability gap. Use after checking current UberBond capabilities first. Every discovered candidate remains subject to UberBond dedupe, license, security, data, authority, and economic review before installation or invocation.
---

# Find Skills — UberBond project integration

Source: `vercel-labs/skills` at `435076e78988e1e6ec40d00b0b1d76bdbbc5419a`.
License: MIT.

This project-local integration preserves the upstream discovery workflow while adding UberBond's mandatory admission layer.

## When to use

Use this skill when:
- a mission exposes a specialized capability not already present in UberBond;
- a worker asks whether an installable skill exists for a task;
- the capability-acquisition loop needs candidate skills;
- a repeated manual workflow might be packaged as a reusable skill.

Do **not** search the ecosystem merely because a task is difficult. Search current UberBond modules, skills, MCPs and canonical capability registries first.

## Skills CLI

The upstream skill uses the open Skills CLI:

```bash
npx skills find [query] [--owner <owner>]
npx skills add <package>
npx skills update
```

The upstream skill also supports global installs with `-g -y`; UberBond defaults to **project-local and reversible** installation instead. Do not use global mutation unless separately justified.

Browse source candidates at `https://skills.sh/` or GitHub, but treat popularity only as a signal.

## Discovery workflow

1. State the exact missing capability.
2. Search UberBond first for equivalent canonical coverage.
3. If missing, inspect the Skills ecosystem/leaderboard and run a focused search such as:
   ```bash
   npx skills find "react performance"
   npx skills find "pr review"
   npx skills find "deployment"
   ```
4. Verify candidate quality before recommending or installing:
   - exact source and current ref/version;
   - license and attribution obligations;
   - source reputation and maintenance signals;
   - actual skill contents, scripts and requested tools;
   - overlap with UberBond;
   - data/secret exposure;
   - external-effect and authority surface;
   - rollback/uninstall path;
   - expected founder-minute or economic benefit.
5. Pass the candidate through `src/external-capability-control-plane.mjs` and `docs/AI_SKILL_PLUGIN_ASSIMILATION_CANON.md`.
6. Prefer the smallest useful skill or mechanism. Do not vendor an entire platform when a small skill is enough.
7. Test it on a bounded mission and leave a receipt.

## Quality signals

Upstream recommends considering install counts, trusted/official publishers and GitHub reputation. UberBond adds a stronger rule: **no popularity metric is approval**. Current code and evidence decide whether a candidate is useful.

## When nothing suitable exists

If no skill passes review, do the task with existing capabilities or create a narrow UberBond-native skill. New skills enter the normal observation → proposed diff → review/test → merge loop.

## Authority law

Finding or installing a skill never grants it permission to:
- contact customers/prospects;
- spend money;
- alter DNS/credentials/KYC;
- bypass access controls or platform policy;
- mutate production/customer systems;
- overwrite payment/customer/delivery truth;
- treat its own memory or claims as canonical evidence.

Capability never creates authority.
