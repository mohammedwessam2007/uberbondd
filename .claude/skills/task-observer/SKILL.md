---
name: task-observer
description: >
  Monitor UberBond multi-step work for reusable skill improvements, corrections,
  repeated manual work and methodology gaps. Run as an observation layer during
  substantive Claude Code sessions. Recommendations never silently mutate canon.
---

# Task Observer — UberBond integration

Created by Eoghan Henn / rebelytics.com. Source: `rebelytics/one-skill-to-rule-them-all` pinned at `510caad26c907793e48306262af216ff9f71c9f7`. Licensed CC BY 4.0.

This project copy adopts the upstream Task Observer methodology while placing it beneath UberBond's repository brain, authority and evidence laws.

Skills improve best from friction observed during real work. The observer watches for:
- user corrections and steering;
- repeated manual workflows that should become skills;
- rules an existing skill repeatedly fails to enforce;
- better methods discovered during execution;
- tooling changes that obsolete old instructions;
- cross-cutting principles that should apply to several skills;
- its own blind spots.

## UberBond hard boundary

Task Observer is **recommendation-only**. It may create observation records and proposed skill updates, but it may not silently rewrite:
- `UBERBOND_CANON.md`;
- `UBERBOND_BOOTSTRAP.json`;
- Master Memory or current commercial truth;
- authority/consent/payment/delivery policy;
- another skill or prompt;
- provider/customer evidence.

Any proposed skill change follows:

`work -> observation -> candidate lesson -> evidence/counterexample -> proposed skill diff -> review/tests -> merge -> version`

## Storage

Use the stable project workspace, never a temporary worktree, for:

```text
skill-observations/observation-log/
skill-observations/observation-log/archive/
skill-observations/cross-cutting-principles.md
skill-observations/last-review-date.txt
skill-updates/
```

Never put secrets, credentials, auth cookies, payment raw data, private customer payloads or unnecessary PII into observations.

## Session Start Protocol

1. Ensure the stable observation directories exist. If `last-review-date.txt` is missing, initialize it to literal `never`.
2. Read only frontmatter of existing observation files to build cheap awareness of open items.
3. If a legacy single-file observation log exists, follow `references/migration.md` before writing new records.
4. If open observations have not been reviewed in more than seven days, mention the backlog without blocking the user's active mission. Autonomous/scheduled review may proceed only within existing authority.
5. Check that `CLAUDE.md` keeps Task Observer activated for substantive UberBond work.
6. Before changing any existing observation's status, re-read that file to avoid races.

## Reference files

Load only when their trigger applies:
- `references/weekly-review.md`: review/reconciliation procedure.
- `references/skill-authoring.md`: before creating or editing a skill.
- `references/observation-log.md`: storage/frontmatter/id/archive mechanics.
- `references/signals.md`: when unsure whether something is worth logging.
- `references/environments.md`: environment/setup/compaction guidance.
- `references/migration.md`: legacy log conversion.

## What to observe

### New skill candidate
A reusable multi-step workflow, methodology, recurring task or repeated owner action not already covered by a current skill.

### Existing skill improvement
A documented rule is violated, the user corrects a missing edge case, a better workflow emerges, a tool changes, assumptions are wrong, or a rule should structurally enforce rather than merely describe behavior.

### Simplification
Rules that never matter, duplicate/contradictory instructions, or instructions repeatedly ignored because the enforcement mechanism is weak.

Do not log one-off task trivia, already-captured preferences, generic tool outages or material that would require leaking confidential information.

## Immediate logging

Write a useful observation while context is fresh. One observation per Markdown file:

```text
skill-observations/observation-log/NNNN-short-slug.md
```

Use frontmatter:

```markdown
---
id: 1
title: Short descriptive title
status: open
type: internal
skill: [existing-skill]
proposes_skill: []
siblings_checked: none
area: workflow
date: YYYY-MM-DD
session_context: what task was being worked on
parked_until:
resolved:
resolution:
reference:
---

**Issue:** What happened and why it matters.

**Suggested improvement:** Concrete proposed change.

**Principle:** General reusable lesson.
```

Statuses: `open`, `actioned`, `declined`, `superseded`, `parked`. Parked observations require a clear `parked_until` condition and stay out of the active work queue until that condition becomes true.

## Sibling check

Before logging a skill-specific observation, check whether the lesson applies to sibling skills in the same methodology family. Record the result in `siblings_checked` so absence of propagation is explicit rather than accidental.

## Checkpoints

Flush pending useful observations at objective tool-visible completion points such as:
- every few completed task items;
- a major deliverable;
- commit/push/PR/deploy/release boundaries;
- end of a material session.

Do not invent observations merely to satisfy a quota. The point is persistence of real learning.

## Weekly review

When a review runs, load `references/weekly-review.md`. Review is evidence-driven and stages proposed updates rather than silently altering live skills. Apply small, clearly additive fixes only when the user/project workflow already authorizes the change and appropriate verification is available. Structural changes/new skills need the full authoring workflow.

## Confidentiality and taxonomy

Classify observations as open-source/general or internal. If uncertain whether a detail could identify a client/user/project secret, keep it internal and generalize before any public reuse.

## Surfacing

Default end-of-session output is a compact grouped summary of useful observations and candidate changes. Do not bury the user's requested deliverable under skill-maintenance chatter.

## UberBond-specific principle

The observer exists to make the AI employee organization improve from actual work. It is not itself the company brain. Repository canon, exact current code, durable receipts and external evidence always win conflicts.
