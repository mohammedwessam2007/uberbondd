# Observation log mechanics

Adapted from Eoghan Henn / rebelytics.com, CC BY 4.0, pinned source `510caad26c907793e48306262af216ff9f71c9f7`.

## Layout

```text
skill-observations/
  observation-log/
    NNNN-short-slug.md
    archive/
      .id-floor
  cross-cutting-principles.md
  last-review-date.txt
```

Each observation is an independent file to reduce concurrent-write collisions.

## Identity

Before writing, compute the maximum numeric id found in active files, archive files and `archive/.id-floor`, then allocate max+1 and update `.id-floor`. If a known non-empty log produces no ids, stop and repair the retrieval rather than restarting at 1.

## Required frontmatter

`id`, `title`, `status`, `type`, `skill` (list), `proposes_skill` (list), `siblings_checked`, `area`, `date`, `session_context`, `parked_until`, `resolved`, `resolution`, `reference`.

New entries start `status: open`. Parked entries require a concrete `parked_until` condition. Resolved statuses are `actioned`, `declined`, or `superseded` with a resolution date.

## Body

Use three sections:
- **Issue**: observed failure/friction with enough context to understand later.
- **Suggested improvement**: concrete change.
- **Principle**: generalized reusable lesson.

## Concurrency

Re-read an observation immediately before changing its status. Never rewrite the whole log directory as one batch. Resolve/archive one file at a time.

## Evidence

When an observation depends on ephemeral evidence, preserve a safe durable reference first. Never store secrets, raw credentials, auth cookies, unnecessary PII, or sensitive raw customer/payment payloads merely to support an observation.
