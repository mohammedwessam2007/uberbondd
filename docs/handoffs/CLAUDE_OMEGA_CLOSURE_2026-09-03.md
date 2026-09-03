# Claude Omega Closure — Handoff

Date: 2026-09-03
Branch: `claude/uberbond-ragnarok-closure-pek0g6`
`origin/main` at reconciliation: `acc7d132b5752b131af2eb6d44052bfb8e92f0da` (unmoved through the session)
Convergence branch harvested: `sol/night-convergence-runtime-harvest-20260902` @ `7344aea1`

## What this session was

The Omega closure mission: drive UberBond to pre-customer engineering complete,
leaving only blockers that no amount of code can close. Its measurable exit
condition was the founder-absence doctor's `softwareGaps`, which started at 3.

It is now `[]`. That is the honest form of the claim: every blocker the doctor
can still name is a credential, an account, an external party or elapsed time.
It is not a claim that the software is finished, and the doctor is not an oracle
— it measures what it was taught to probe. What changed is that nothing it
probes is now waiting on us.

## The two defects `main` is shipping

Neither was in the brief. Both were found by attacking code the merge brought in
rather than by reading the mission list.

### A proposal could mark its own win as commercial truth

`src/proposal-acceptance-engine.mjs` set `commercialTruthEligible` from the
proposal's own `paymentEvidence` object, accepting any evidence whose `origin`
said `EXTERNAL`. The origin field is supplied by the same caller that supplies
the proposal. A sandbox fixture, a synthetic reference, or a string typed by
hand all passed, and the engine then reported the result as eligible for
canonical payment validation.

That is the exact laundering the canon names first: capability never creates
authority, and a system that accepts a payload's self-description as its
provenance has no provenance at all.

Now the reference itself must survive inspection — an `EXTERNAL_PAYMENT`
evidence class, a `payment:` reference, and no `sandbox`, `synthetic`,
`fixture`, `fake` or `test` segment in it — and the field it produces is renamed
to say what it is: `ELIGIBLE_FOR_CANONICAL_PAYMENT_VALIDATION_NOT_CLEARED_REVENUE`.
Eligibility to be checked is not a check that passed.

### The canon-drift row could never be satisfied

The founder-absence doctor asked whether canon names the current head. Canon
cannot name the commit that contains it: regenerating canon produces a commit,
and that commit changes the head the artifact would have had to name. The row
reported a gap that no work could close.

A permanently red row is worse than no row. It teaches its reader to skip it,
and the day canon genuinely drifts the row looks exactly the same.

The honest question is not "does canon name HEAD" but "does canon still describe
this source." Canon naming an earlier commit is fresh when nothing but the canon
artifacts has changed since — the source it describes is then byte-for-byte the
source that is here. Anything else moving makes it stale, which is the entire
point of the row.

The same defect existed a second time in `tests/canon-freshness.test.mjs`, which
counted `config/system-readiness-input.json` — the generator's own input — as
source under a `config/` prefix. Excluded by exact path, not by prefix: a
`config/` exemption would also have covered the reachability classification and
every policy file beside it.

## The real-database gate had never once completed

`npm run test:postgres-real` did not fail. It ran
`tests/omnia-v9-external-effect-state-machine`, stopped inside it, and waited.
Roughly 180 real-database tests scheduled after that file had never executed,
and no run ever said so. A runner left by a previous session was found still
sitting in the same place after ten hours.

The mechanism was measured rather than assumed. A PostgreSQL backend ends up
asleep in `sock_alloc_send_pskb`, blocked writing results to a socket whose
client is gone: zero CPU, no lock held, blocked by no session, while every Node
process in the tree sits idle in `ep_poll`. Ruled out in turn: lock contention
(`pg_blocking_pids` empty), a runaway trigger (zero utime and stime across a
six-second sample), and fsync on throttled storage (it still stalls with fsync,
`synchronous_commit` and `full_page_writes` off). Each stalling statement was
replayed on a fresh connection and completed correctly in under a tenth of a
second, so this is a harness defect, not a production one.

Repairing it took four attempts, and each of the first three is worth recording
because each moved the hang one layer up rather than removing it:

1. `--test-timeout=120000` bounds every suite. The run then hung in cleanup.
2. A per-suite database, so one poisoned database cannot infect the next. The
   run then hung in `DROP DATABASE`.
3. `WITH (FORCE)`. `FORCE` still has to terminate the unstoppable backend, so it
   waited too — and `statement_timeout` does not govern that wait: a ten-second
   budget was observed sitting there for nearly four minutes.
4. No cleanup at all. These databases live inside an embedded server that is torn
   down when the run ends. A disposable server does not need housekeeping, and
   paying for it with an unbounded wait is how a gate stops reporting.

Also fixed inside the state-machine suite: a connection leak where
`await query().catch()` does not catch the synchronous throw a dead client
raises, so `release()` was skipped.

The gate now always terminates and always reports. It is classified
INFRASTRUCTURE with its mechanism written down, not hidden behind a green badge.

## Merge reconciliation

Sixteen commits of convergence-branch work merged against nine of newly advanced
`main`. Two collisions were resolved by verified semantics rather than by branch
preference:

- **`lead-path-sprint-fulfillment.mjs`** — resolved to `main`'s. Mine had
  reimplemented a parallel state machine instead of composing
  `service-fulfillment.mjs`. Taking mine would have created the second ledger the
  engineering law forbids.
- **Postal** — `main`'s evidence layer wins; the adapter hardening from this lane
  was already present in v1.3.0, so there was nothing to carry.

`src/first-cash-canary-packet.mjs` was rebound to the canonical fulfilment module
as a consequence, and its canary now proves the canonical machine *refuses*
synthetic payment evidence rather than simulating a delivery.

## Mutation findings worth keeping

`POSTAL-QUARANTINE` was anchored on the ledger wrapper's quarantine filter and
**SURVIVED**. `deriveCurrentPostalState` filters the same three fields
immediately afterwards, so removing the wrapper's copy changes no output for any
input. A redundant guard is unfalsifiable — not wrong, just untestable, and a
test suite cannot tell the difference between a guard that is redundant and one
that is missing. Re-anchored on the filter that actually decides, it kills.

## Gates, as measured

Figures are in `config/system-readiness-input.json` and regenerated canon; the
notes there carry the caveats rather than being smoothed away. Two gates are
explicitly not claimed green:

- **Mutation war**: 154 mutations registered, every anchor resolving to exactly
  one site. Individually verified KILLED this session: `POSTAL-QUARANTINE`,
  `PROPOSAL-01`, `PROPOSAL-02` and `CANON-01` through `CANON-04`. The full run was started
  three times and each time lost to a container restart under load. It is NOT
  claimed as passing.
- **Real PostgreSQL**: last complete run 167/171 with one genuine assertion
  failure (Gmail concurrent recovery workers, which passes 4/4 when its suite runs
  alone) and three suite-level timeouts.

## Commercial truth

Unchanged and constitutional:

```
realCustomers: 0
clearedRevenueUsd: 0
acceptedPaidDeliveries: 0
retainedCustomers: 0
```

Nothing in this session touched it, and nothing in this session could. No live
outreach was performed, no payment was created, no credential was configured, no
deployment was promoted. Prepared targets remain prepared.

## What remains, classified

These are not unfinished code:

- **NO_CONFIGURED_MODEL_PROVIDER** — no provider key and no pricing evidence. The
  harness's own session OAuth is the agent's credential, not UberBond's provider.
- **NO_PAYMENT_PROVIDER** — no account to reconcile a payment against. The chain
  is complete and refuses without claiming anything.
- **NO_OWNER_AUTHORIZED_FIRST_SPRINT** — the canary packet is built and gated;
  activation is an owner decision with money in it.
- **VERCEL_RUNTIME_UNPROVEN** — the connected project reports `live:false` and no
  exact-current-main runtime is proven.
- **BRANCH_DELETION_NOT_PERMITTED** — `git push --delete` returns 403 for every
  branch while pushes succeed. A scoped permission, not a fault.
- **FOUNDER_ABSENCE_DURATION_UNPROVEN** — provable only by elapsed real time.

## Next highest-value mission

Not more engineering. The first-cash canary is the single first-money experiment
and everything it needs on our side exists. The next thing that moves the north
star is one owner-authorized $450 white-label Lead-Path Revenue Leak Evidence
Sprint, requiring cleared payment, accepted delivery, actual founder minutes and
partner margin — the four things no repository can manufacture.

If engineering time is spent first, spend it finishing the two gates above:
one uninterrupted mutation war and one clean real-database run. Both are now
capable of completing; neither has been observed doing so.
