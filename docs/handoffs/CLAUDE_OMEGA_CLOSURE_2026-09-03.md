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

---

# Continuation — 2026-09-04: convergence with PR #329

## What changed

Two lanes had harvested `sol/night-convergence-runtime-harvest-20260902` and
diverged. Neither head carried the other's work, and both were open against the
same unmoved `main`:

- **#329** had Frontier Operator, the Open Model Universe, the mutation-registry
  anchor-integrity test, and the owner's PayPal.me binding.
- **This branch** had the proposal-eligibility fix, the canon-freshness
  partition, the repaired real-database runner, and six more mutations.

Merged rather than picked. Two collisions:

**`first-cash-canary-packet.mjs`** resolved to this branch's implementation as
the base — 597 lines against 118, bound to the payment-rail doctor, the canary
guard and the canonical fulfilment machine — with #329's payment-link semantics
absorbed into it.

That absorption fixed a conflation of my own. `WHAT_PAYMENT_LINK` answered out
of the rail doctor's state, so the packet reported no payment link while the
owner had supplied a public one. A destination and a rail are different facts.
The link is `PREPARED`; reconciliation stays `EXTERNAL_PROOF_REQUIRED`;
`paymentRailLiveReady` stays false and `canContact` with it.
`PAYMENT_LINK_IS_NOT_CLEARED_PAYMENT_PROOF` rides on every packet whether or not
a link is present, because the moment that field goes missing is the moment
`paymentLink` reads as revenue. Non-HTTPS and unparseable links fail closed.

**`mutation-war.mjs`** resolved to the union, verified by set comparison rather
than by reading the diff: nothing in #329's 148 was dropped.

## PR #329 was red on main's own ratchet

It landed twelve modules — Frontier Operator (eight) and Open Model Universe
(four) — implemented, tested, green and unreachable. That is exactly the
condition the reachability ratchet exists to catch, and it caught it on the
merge rather than because of it.

Classified, not wired, behind two registered gates. Wiring an orchestrator that
nothing schedules would create an orchestrator with nothing to orchestrate, and
an orchestrator that runs is the last thing to switch on before its consequence
path is decided.

`open-model-runtime-executor` is the exception: already reachable through the
model factory, which is why production reachability rose 139 → 140 rather than
staying flat. It reports five blockers, so the new provider is live in the graph
and unable to execute anything, which is the correct shape.

Two provider-list tests broke on the fifth provider, and they broke differently.
One pinned the exact list — updated, not loosened, because adding a provider
should arrive as a failing test. One read the sandbox by array position, found
the wrong row, and reported a defect in the sandbox gate that did not exist; it
would equally have hidden one that did. Now found by name.

## Two gates that had never reported

**The browser gate skipped a guard it could have run.** The mutation war read
`CHROMIUM_PATH`, nothing in this repository sets it, and Chromium is installed
on this host — so it printed `SKIPPED_NEEDS_BROWSER` for `CRAWL-01` while also
printing "0 not killed". In a summary line, a skip that cannot be helped and a
skip that could are indistinguishable.

Detection is the kind of convenience that becomes a fabrication if it guesses,
so `scripts/resolve-chromium.mjs` accepts only paths that exist and are
executable, respects a declared install root instead of also scanning `/opt`
behind it, and returns nothing rather than a plausible path — an honest skip
survives. A declared `CHROMIUM_PATH` stays authoritative and is still checked: a
variable pointing at nothing is a misconfiguration, not a browser.

It lives in its own module because the registry stores anchors as literal source
strings, so a mutation of a function in that same file matches its own
registration and resolves `ANCHOR_AMBIGUOUS`.

**The war could not survive being interrupted.** It takes over an hour against a
real database and this host restarts its container under load; four consecutive
runs were killed in flight, each discarding every verdict it had earned.

`MUTATION_WAR_JOURNAL` appends each verdict as it is decided and replays it next
run, labelled as replayed. The binding is the feature: every entry hashes the
file, anchor, replacement and killing suites, so a guard that moved runs again
rather than inheriting an answer. Suite order is deliberately excluded — a
cosmetic reordering should not discard an hour of real evidence, or the resume
is one nobody uses. Five tests hold it down, because the failure mode here is a
green summary line, and a green lie is not something a later run corrects.

---

# Continuation — 2026-09-04: both blocking gates green

Two gates had never once completed in this repository's history. Both are green
now, and getting there was seven defects **in the gates themselves** — every one
of which had been reporting a guard as untested while printing a clean summary.

## `test:mutation-war` — 164 mutations, 164 killed, 0 skipped

1. **It read `CHROMIUM_PATH` and nothing sets it**, so a browser guard was
   skipped on a machine with Chromium installed. In a summary line a skip that
   cannot be helped and a skip that could are indistinguishable.
2. **`SKIPPED_NEEDS_POSTGRES` meant "nobody handed this run a database"**,
   leaving nine guards unexercised wherever a variable was unset — the same
   defect as the browser skip, one layer down. The war provisions its own
   database now; the skip survives only for a server that will not start.
3. **Suites ran with no deadline.** One hang stopped the whole run in `ep_poll`
   with no verdict and nothing to say which mutation it was on. Thirteen minutes
   of a run went that way before anyone read `/proc`.
4. **All 160 mutations shared one database, then one server.** A suite that left
   state behind broke every database-backed suite after it, so the gate was
   measuring the order it happened to visit them in. Each database-backed
   mutation now gets a private disposable server.
5. **A hang beside a kill erased the kill.** Two guards reported the exact
   assertion the mutation was written to break, in a file where another test
   stalled, and were recorded as untested. An `ERR_ASSERTION` failure now wins
   over a co-occurring hang — one way only, so a loaded machine still cannot
   manufacture evidence.

It is also resumable. Four consecutive runs had been lost to container restarts,
each discarding every verdict it had earned. `MUTATION_WAR_JOURNAL` records each
verdict as it is decided, bound to a hash of the file, anchor, replacement and
killing suites, so a guard that moved runs again rather than inheriting an
answer. It proved itself the same session: a restart mid-run cost nothing.

## `test:postgres-real` — 23 suites, 184 tests, 184 pass

It ran `omnia-v9-external-effect-state-machine`, stopped inside it, and waited,
so roughly 180 tests scheduled behind that file had never executed and no run
ever said so. Three causes, each found by removing the one in front of it.

**The exhaustive transition check made ~600 client round trips.** Around the
122nd the connection stopped responding — backend `active`, waiting on nothing,
holding no lock, ignoring `statement_timeout`. A pool, then one dedicated client,
then a connection per pair all stopped in the same place, which is what
identified the round trips themselves as the cost rather than anything held in a
session. The loop now runs in PL/pgSQL: four statements instead of six hundred,
and the client no longer takes any part in deciding what the database accepted.

An `unref` was masking this. It stopped a stuck socket pinning the event loop,
but with nothing else pending the loop drained mid-query and the runner cancelled
the test deterministically. A socket must be a reason to stay alive while the
test runs and stop being one when it ends: a destroy in the `finally`, not an
unref at the top.

**The Gmail concurrency test asserted that exactly one of two workers claimed a
row.** That was only ever true when the two transactions happened to overlap. On
a fast database they stopped overlapping and both claims were legitimate —
`RESULT_UNCERTAIN` is itself an unresolved status, so a committed row is a valid
candidate again. Nothing was double-dispatched, which is the invariant that
matters. The overlap is now made real by holding the first worker's transaction
open, which tests `FOR UPDATE SKIP LOCKED` rather than assuming it.

**The payment replay test drove a hundred replays from the client.** Inside
`node:test`, after about a hundred rejected pg queries the next one never
returns. Measured four ways before concluding anything, because "the database is
slow" was the convenient answer and it was wrong:

| condition | result |
|---|---|
| no conflicts, 200 queries | 61 ms |
| conflicts through a pool | stops at ~55 iterations, no backends left on the server |
| conflicts on one dedicated client | same ~100 errors |
| identical loop outside `node:test` | 300 conflicts in 90 ms |

It is the test runner, not the driver and not production — **nothing in `src/`
changed for it**. Postgres now runs its own hundred in PL/pgSQL and reports what
the index refused, which tests the constraint more directly than counting
exceptions in JavaScript did.

Every rewritten check was falsified before being believed: claiming all
transitions legal fails with Postgres's own message; removing `FOR UPDATE SKIP
LOCKED` fails the lock test; dropping `UNIQUE` from `provider_event_id` fails the
replay test.

## What did not change

No production module was modified for any of this. Commercial truth is
unchanged: zero customers, zero cleared revenue, zero accepted deliveries, zero
retained customers. No outreach, no payment, no credential, no deployment.
