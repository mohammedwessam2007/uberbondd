# PROJECT NULLSTAR — Directive Reconciliation Reading

Regenerate with `npm run nullstar:reconcile`. Machine output:
`artifacts/nullstar/directive-reconciliation.json`.

This document is a reading of that artifact, not a second source of truth. Where the
two disagree, the artifact is right and this file is stale.

## What the reconciler does

Directive section CCCVI asks for a requirement coverage matrix before any building, so
that the answer to "does UberBond already do this?" comes from the tree rather than from
whichever model is reading the directive. The reconciler compiles one row per section and
computes each state from repository evidence, reusing the sovereign coverage matrix's
evidence locator and repo index rather than growing a second view of the repository.

Its discipline is the coverage matrix's discipline:

- a filename match alone never reaches `VERIFIED_CURRENT` — source **and** test **and**
  live reachability **and** a whole-name exact match are all required;
- a `BOUNDARY` or `EXTERNAL_GATE` section is `BLOCKED` no matter what the tree contains;
- a `MILESTONE` is `BLOCKED` until a receipt with an evidence reference is supplied,
  and a module named after the milestone is not a receipt;
- a canonical concept lifts a row only as high as that concept was independently rated;
- a reviewed declaration may mark a section deliberately-not-built, and may never mark
  one built;
- row count must equal section count.

## First reading — 2026-09-14

| state | count | meaning |
|---|---|---|
| VERIFIED_CURRENT | 26 | module, test, production reachability and an exact whole-name match |
| PARTIAL | 29 | a module exists, or canon covers it, without the full evidence set |
| BLOCKED | 14 | research gates, external reality and the five terminal milestones |
| NOT_CURRENTLY_JUSTIFIED | 14 | missions, ontologies and research questions — not build targets |
| MISSING | 253 | no evidence found under the directive's own name |
| DONOR_ONLY | 0 | — |

### How to read the MISSING count

**253 is an upper bound on unmet requirements, not a measurement of them.** The matcher
will not split a title on whitespace, because "GENESIS for Life" contains "GENESIS" and a
looser join is exactly how a coverage report becomes fiction. So a section the repository
implements under a different name reads MISSING until a reviewed alias says otherwise.

Spot-checking the top of the cut set found both kinds. `MODEL FAILURE MAP` was genuinely
absent — nothing in the tree modelled what a specific provider gets wrong. `FOUNDER
COCKPIT`, `KILL SWITCHES` and `COGNITIVE FIREWALL` have plausible counterparts under other
names (`command-center`, the pause fence, the sovereign privacy firewall) and are almost
certainly overstated.

Understating coverage is the safe direction: it can cause duplicated effort on a section
that is already built, which review catches, while overstating it causes a requirement to
be marked done and never revisited, which nothing catches. The number is honest about
which way it errs.

### The BLOCKED set is correct as it stands

The three research gates (intelligence explosion, ASI, singularity), the four reality
gates (market, science, life, and the legal/medical/financial boundary), the two external
benchmarks, and the five terminal milestones are all things no amount of engineering
closes. C21's posture is unchanged: `SYSTEM_LEVEL_ASI_NOT_ESTABLISHED`.

## The cut set

282 unmet build targets, ordered by how many other sections of the corpus refer to the
same distinctive vocabulary. That count is read off the directive itself, so it can be
recomputed and argued with. It is deliberately **not** a score: sections CCCVII and
CCCXIII rule out a number nobody can derive, so no cost, value or unlock percentage is
estimated anywhere in the artifact.

Current head of the cut set:

| refs | state | section | note |
|---|---|---|---|
| 11 | PARTIAL | VIII MODEL CIVILIZATION | a router exists; the provider/model capability market around it does not |
| 7 | PARTIAL | XXXVIII DECISION ENGINE | forecast decision boundary exists; the full dimension set does not |
| 7 | PARTIAL | CCLV PERSONAL API | scattered surfaces, no scoped internal API |
| 6 | PARTIAL | XII WORLD MODEL | fact/belief/forecast separation exists in pieces |
| 6 | PARTIAL | XIII REALITY BUS | reality freeze and receipts exist; no single authorized change stream |
| 4 | MISSING | CCCXIV / CCCXVI NO ASI / IQ THEATER | laws with no executable enforcement yet |
| 3 | MISSING | CLXXVII PERFORMANCE ENGINE | no profiling discipline in the tree |

A cut-set position is a corpus reference count and a state. It is not a work order, and
nothing here authorizes building any of it.

## What this reconciliation has already changed

`CXLIX MODEL FAILURE MAP` was the highest-reference genuinely-absent section (9 corpus
references, no candidate implementation). It is now built, tested, mutation-checked and
wired into `routeModel`, and the reconciler independently re-measures it as
`VERIFIED_CURRENT` on module, test and production-reachability evidence.

That is the loop working: the directive named a gap, the reconciler located it against the
tree rather than against a summary, the gap was closed, and the same mechanism confirmed
the closure without being told.

## Truth boundary

This reconciliation reports what this tree and the canonical coverage matrix support. It
proves no implementation, no runtime behaviour, no external outcome, no recursive
self-improvement and no ASI. A row is a description; a cut-set position is a reference
count. Current code, exact-head receipts and durable external evidence outrank both.
