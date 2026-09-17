# NULLSTAR terminal completion war — what actually happened

Machine-readable: `artifacts/nullstar-terminal/final-report.json`. Every figure
below is computed by `npm run nullstar:final-report` from the artifacts, not
typed in.

## The verdict

`SOFTWARE_SIDE_COMPLETE` for this ledger. Zero software items open, two
external.

Read that narrowly. It means the thirteen items CD001-CD013 are closed, each by
a check that computes its own status from artifacts and the filesystem rather
than from a label in a file. It does not mean UberBond is finished, and it is
not a completion claim for the V3 program, whose constitution compiler is the
only part of it that exists yet.

The zero moved twice, and both moves are the point:

- It read `SOFTWARE_SIDE_COMPLETE` once before while branch debt was not
  represented in the ledger at all. EVENT HORIZON section 009 counts unique
  commits off main, open integration PRs and diverged branches in
  `softwareOpen`; measuring them reopened three items.
- Those three were then closed by reading branches and modules rather than by
  labelling them, and the reading found two guards main did not have.

What the last two items cost, and what they returned:

- **CD012** had checked 3 of 101 stranded pre-rewrite modules. All 101 are now
  placed: 89 by export identity or filename token, 12 read individually because
  the automated pass could not place them. Eleven were superseded. One,
  `src/reserved-domains.mjs`, was a real gap: nothing in main guarded RFC 2606
  domains and `registerSendingDomain` accepted `example.test` as an
  OWNER_CONFIRMED outreach sending domain, reachable from two production job
  handlers.
- **CD011** had three diverged branches with no terminal class. All three are
  SUPERSEDED, decided on content. The 100K branch carried one check main never
  had -- `mailbox-authenticated-address-required` -- without which a mailbox
  could certify against a DNS-verified, warmed, authenticated domain while its
  real sending address belonged to a different one.

Both guards only narrow: neither can permit a send that was previously refused.
Nine fixtures now declare what they are rather than the guards being loosened
to let them through.

FD001 no longer gates a branch, because main already implements the founder
press as an authenticated HTTP entry. The policy question it asks is still
unanswered and is not mine to answer.

CD006 and CD007 remain external. Neither is code: one needs a model provider,
the other needs a buyer.

## What the constitution doctor found

`npm run constitution:doctor` compiles the nine canon files into 262 Directive
Objects -- 155 prohibitions, 64 obligations, 43 permissions -- and asks which
of them anything actually enforces.

The honest answer is a coverage number and a precision problem. 69 directives
link to a mutation-killed guard, including 26 of the 48 that govern an external
effect. The other 22 are a review queue, not a defect count: reading five of
them found one compound sentence whose pieces are enforced in different places,
three keyword false positives, and one rule enforced by absence -- nothing in
`contacts.mjs` constructs an email address, so there is no inference path to
guard. Those readings are in `artifacts/constitution/reviewed-linkage-findings.json`.

The doctor cannot yet tell those three apart from a genuine hole. That is why
its number is published as a queue, and why an entry closes by being read
rather than by tuning the matcher until the count falls.

## The central finding

**An evaluation drawn from inside the distribution a solver was built against
cannot tell a mechanism from a lookup over that distribution.**

That sentence cost five generations to learn properly.

A tournament can be run carefully — thresholds fixed in advance, held-out seeds,
null candidates, regression checks — and still promote a solver that has
memorised the shape of the questions rather than learned to answer them. The
tournament is not where the defect lives. It is in the items every tournament
draws from.

The clearest instance: GA3 promoted an invention solver scoring 1.0 on every
item the generator emits. Handed "Report the mean plus the midrange" it returned
the mean, because the prompt contains the substring "report the mean". It did
not fail loudly. It answered a different question.

## Eight generations

| | family | at | outcome |
|---|---|---|---|
| GA1 | forecasting | d3 | promoted, tied three ways |
| GA2 | research | d3 | promoted, tied three ways |
| GA3 | invention | d3 | promoted a lookup |
| GA4 | invention | d3 | **no promotion** |
| GA5 | invention | d3 | **no promotion** |
| GA6 | invention | d3 | promoted a composer |
| GA7 | invention | d4 | promoted an n-ary composer |
| GA8 | invention | d5 | promoted a clause-aware composer |

Two null results. Both were declared in advance as legitimate outcomes and
neither was retried with a lower bar.

GA4 promoted nothing because the composing candidates could not beat a lookup
in-distribution. GA5 promoted nothing because the comparison rule required
beating an incumbent that three strictly-better candidates merely tied — the
GA4 declaration had said the incumbent was not grandfathered, and the mechanism
grandfathered it anyway. Intent and mechanism diverged and the mechanism won,
which is the right order.

## Every invention promotion fixed the previous one's confabulation

- **GA3** matched whole phrases → "the mean plus the midrange" returned the mean
- **GA6** composed two named quantities → dropped the third of any three, silently
- **GA7** folded every adjacent pair → read "A, plus B divided by C" as `((A+B)/C)`
- **GA8** resolves each clause before joining it

Each was a confident wrong answer rather than a refusal. Each was invisible
until a difficulty level existed that could ask. The pattern is the finding.

## What the instrument gained

- **An out-of-pattern gate.** Candidates face items built outside the generator.
  Confabulating on any of them disqualifies at any in-distribution score,
  because a solver that returns nothing outside its competence is usable and one
  that returns a confident wrong number is not.
- **Gating and reporting probes kept disjoint**, so a candidate is never judged
  and congratulated by the same items.
- **Ties treated as unresolved.** Twice a tie-break chose on size, and twice the
  tied candidates were separable by evidence nobody had run. GA6 picked the one
  that confabulated on every difficulty-4 item. Tied candidates are now run
  against each other first; disagreement means nothing is promoted.
- **Throwing separated from refusing.** A crashing solver used to be counted as
  one that deliberately declined, which the gate treats as acceptable.
- **Difficulty 4 and 5**, because difficulty 3 had saturated at 1.0 across all
  seven families and a suite where everything scores perfectly cannot rank
  anything.

## Transfer

The GA2 declaration argued that provenance-and-freshness ranking should transfer
to other organs. Nothing had measured it.

Against the epistemic immune system's own vocabulary — twelve knowledge states
sharing no label with the suite — over sixty constructed claims:

```
mechanism, reading the organ's ordering    60/60
the promoted solver, unchanged             26/60   (chance is 30/60)
the rule it replaced                        0/60
```

**The mechanism transfers. The implementation does not.** The solver carries a
table of the suite's own labels, so handed an organ that names evidence
differently it scores everything at zero and falls through to whatever comes
first.

This is the attribution failure again in a different register: vocabulary and
reasoning are separable, and mistaking one for the other has now cost two
generations their attribution and one transfer claim its truth.

## Two corrections that went against me

The cross-organ task's **first construction was unanswerable**. The decoy source
was as strong as the truth and fresher, so no rule weighing strength against
recency could recover the intended answer. Every arm scored noise and the solver
under test came out ahead at 0.48 by picking whatever the shuffle put first. It
was caught because the ordering of the arms made no sense, not because a check
failed. Its numbers are not reported.

The **first verdict was flattery**. It compared every arm against the rule under
replacement and concluded the implementation transferred, because 0.43 beats 0 —
but that rule scores 0 by being systematically wrong, and beating a
systematically wrong rule is not evidence. Against chance, the implementation
does not transfer. Changing the baseline reversed the conclusion.

## Debt

Twelve failure-debt entries, all closed with a regression test and a repair
commit. Ten completion-debt items, eight closed by measurement, two externally
blocked.

Three things were moved **out** of the debt ledger into a permanent-limitations
section that does not enter the count, because no work closes them and an item
that can never close makes a completion count meaningless:

1. Every probe, grammar and generator here was written by the same author as the
   solvers they judge.
2. Every capability number comes from one instrument.
3. The solvers are hand-written deterministic functions, so what improved is the
   author's understanding of a task expressed as code.

## What this is not

Not artificial general intelligence, superintelligence, an intelligence
explosion, or a singularity. No such claim is made or supported anywhere in this
work.

Not evidence about a model — every solver is a deterministic function.

Not recursive self-improvement — the improvements were written by hand, selected
by a tournament, and each introduced the defect the next had to fix.

Not revenue, customers or cleared payment. Those remain zero.

Not a production change to any organ.

## Reproducing it

```
npm run test:deterministic          # 7551 tests on the merged tree
node scripts/mutation-war.mjs       # 441 mutations, 441 killed
npm run nullstar:branch-debt
npm run nullstar:completion-debt
npm run nullstar:final-report
```

## What changed after the merge to main

The NULLSTAR lineage is on main as of `755e00a2`, and merging it took main from
red to green: `UBEROCEAN` had been added to the sovereign layer registry without
being added to the orchestration dependency graph or phase list, so the topology
could not resolve and six tests failed, plus two reachability failures. Those
were failing on main before this branch touched it.

Hosted CI reported eight failures on the merged head. Every one had `runner_id 0`,
no runner name, no executed steps, a four-second duration and a 404 on log
download. No runner was ever assigned, so that is infrastructure non-evidence
rather than a source failure, and it is recorded as such rather than claimed as
a pass.
