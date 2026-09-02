# Claude Ragnarok Nightfall — Dawn Handoff

Date: 2026-09-02
Branch: `claude/uberbond-ragnarok-closure-pek0g6`
Base at session start: `4417895367d24614edddcd641247767e041b800a`
`origin/main` at reconciliation: `5436eeb111a17f012ea7dc307f295703da391bc6`

## What this session was

A Ragnarok closure mission that lost five parallel lanes to a model-credit wall
mid-flight, recovered their partial work, finished it, then merged nine commits
of newly advanced `main` and reconciled the collisions.

The two most valuable findings were not in the mission brief. Both are defects
`main` is shipping right now.

## Two inherited reds found on main

### `npm run brain` fails on main

It is the mandatory first command of every UberBond session — named in
`AGENTS.md`, `CLAUDE.md` and the resume packet — and on `origin/main` it returns
`UBERBOND_BRAIN_BOOTSTRAP_FAILED`. Every worker starting from main today gets a
refusal instead of the project's memory.

Cause: the 2026-09-02 owner-goals commit added an initiative to the
reconciliation overlay with status `CURRENT_OWNER_DOCTRINE`, which was not in
the closed `MEMORY_STATUSES` vocabulary. `normalizeInitiatives` correctly
rejects the whole array when any row carries a status it cannot classify, so one
unrecognised string took the entire memory index down, and with it the brain and
four tests.

Verified on a clean worktree of `origin/main` before anything here was touched.
Fixed by adding the status rather than relabelling the record: owner doctrine is
genuinely not a program, a donor, a generated artifact or an unresolved name.

**The four tests that catch this already existed and were already failing.
`main` was merged red.**

### `npm run readiness` cannot run on main

`config/system-readiness-input.json` on `origin/main` is not valid JSON. It ends
mid-array, so the readiness generator — the only sanctioned way to regenerate
canon, and the one the resume packet forbids hand-editing around — exits with a
`SyntaxError`. Canon could not be regenerated on main at all, which is why the
canon-freshness tests were failing with nothing able to fix them.

Cause: a truncated write. Diffing before repairing showed the commit changed
three measurements and **not one capability entry**, yet 21 of 33 capabilities
were missing from the file it left behind. Restored from the last valid version
at `60f7f6e5`, keeping the measurement refresh the commit was actually for.

This is the second time a readiness artifact has silently gotten smaller; the
resume packet already warns about `d1a75d04`. Closing the braces on the
truncated file would have produced valid JSON and permanently lost 21 entries.

## The cross-lane gap

**PR #317 (`work/night-postal-20260902`) adds the Postal webhook evidence
module, ledger, route and migration, but does not touch the adapter that
consumes them.** `main` still carries the PR #277-era adapter.

Verified on `main`:

| Defect | Still open on main |
|---|---|
| HTTP 409 treated as a definite rejection | yes |
| Dispatch has no timeout | yes |
| `reconcile` throws without an `executionId` | yes |
| Reconciliation rows need no provenance | yes |

The third one matters most. `external-effect-recovery.mjs` calls
`adapter.reconcile({ businessKey, providerEffectIdentity, expectedTo })` with no
`executionId`. The adapter on main throws on exactly that shape, which does not
fail one execution — it aborts the whole recovery batch.

Merging PR #317 alone delivers the evidence half and leaves the half that reads
it unhardened. This branch closes all four, with mutations `POSTAL-01` and
`POSTAL-02` holding two of them.

Full classification: `artifacts/ragnarok/night-donor-reconciliation-2026-09-02.json`.

## The merge defect neither side had alone

Merging `main` produced two provider identities for one gateway: `ai-gateway`
(main) and `vercel-ai-gateway` (this branch) name the same credential and the
same executor. `describeProviderReadiness` returned two rows, and main's row
derives its env prefix by upper-casing the provider id — yielding
`AI-GATEWAY_API_KEY`, a variable nobody sets.

Measured with a fully configured gateway: `ai-gateway` reported
`credential-absent` while `vercel-ai-gateway` reported ready, from the same key.

Both halves matter. Readiness and execution disagreeing makes a working lane look
unavailable. Two rows for one credential is worse: `executeWithFailover` reads a
provider list as destinations, so an exhausted gateway looked like a chain with
somewhere left to go, and routing around it would have retried the same provider
under another name — the one thing the routing law forbids, while looking exactly
like the thing it permits.

Resolved to one canonical id with the other as an alias, an explicit env-prefix
map, and the duplicate branch removed. Both spellings still build an executor.

## Commits on this branch

| SHA | Purpose |
|---|---|
| `a6ded0f8` | Merge PR #277 branch (free-first router, Postal adapter) |
| `c7a42d32` | Orchestration packet; repair the merge's canon drift |
| `5def45b8` | LIVE outreach routing derived from activation receipts, not caller booleans |
| `5f4a4693` | Make the four doctors runnable; Postal route, migration and real-database proof |
| `7f81213d` | Test the sprint machine and the payment rail against their real contracts |
| `af23fb51` | Close the last measurable software gaps; register 14 mutations |
| `5b8750f4` | Merge current main; reconcile one gateway wearing two identities |
| `2e5b74a1` | Repair the company brain main has been shipping broken |
| `d8d6b478` | Restore the readiness input main truncated; record the night reconciliation |

## Verification at this head

| Gate | Result |
|---|---|
| `npm run check:syntax` | 704 files parse |
| `npm run test:deterministic` | 3191 tests, 3137 pass, 2 fail, 52 skipped |
| `npm run test:relay-safety` | 150 / 150 |
| `npm run test:wallbreaker` | 16 / 16 |
| `npm run test:capability-genome` | 84 / 84 |
| `npm run test:external-capabilities` | 13 / 13 |
| `npm run test:event-horizon` | 11 / 11 |
| `npm run test:browser` | 1 / 1, against the runner's Chromium |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:mutation-war` | 138 mutations, 129 killed, **0 not killed**, 9 skipped for want of a database |
| Reachability | 284 `src` modules: 138 production, 27 operator-only, 119 classified with a reason |

The 2 deterministic failures are the canon-figure tests, closed last by
regeneration once every source change has landed. Every other suite is green.

New in this session: `scripts/with-real-postgres.mjs`. Roughly 180 tests about
what two real connections do to one real row had been skipping themselves in
every environment without a database server, while `embedded-postgres` was
already a devDependency the smoke scripts start per run. A gate that cannot run
is worse than no gate.

## Doctors, as they answer right now

| Doctor | Answer |
|---|---|
| Outreach | `FREE_FIRST_ROUTER_PLAN_ONLY__NO_ACTIVATED_PROVIDER` — 75,100 researched per 30 days, **0 live-usable**, cold transport not proven, 16 accounts `NOT_STARTED` |
| Payment | `SANDBOX_CONFIG_MISSING`, live-ready false |
| First cash | `NO_CONTACT_PERMITTED`, `canContact: false`, six gates blocking |
| Founder absence | `CREDENTIAL_BLOCKED`, software gaps: canon drift only, 3 owner actions |
| Model providers | `NO_MODEL_PROVIDER_CONFIGURED`, 0 configured, failover has no destination |
| Event Horizon | `EVENT_HORIZON_HEALTHY`, champion `lead-path-evidence-sprint` |
| Capability Genome | `FOUNDATION_HEALTHY` — 30 repos, 2 bodies, 2 normalized, **0 approved, 0 active** |

The founder-absence doctor's software-gap list is derived from probes against
the tree, not asserted. That mattered: it was reporting nine gaps because the
script handed it only one of the two probes it declares, so every row resolved
by a source probe reported open. It was saying the work was unfinished because
nobody had given it a way to look.

## Commercial truth

| Measure | Value |
|---|---:|
| Real customers | **0** |
| Cleared revenue | **$0.00** |
| Accepted paid deliveries | **0** |
| Retained customers | **0** |

Unchanged, and nothing in this session could have changed them. The reviewed
free-provider pool permits ~75,100 transports per 30-day month; proven free
cold-B2B transport across all of it remains **0/day**. Zero prospect contacts,
zero provider calls, zero purchases, zero deployments, zero DNS or credential
changes, zero money movement.

## Remaining blockers

### Software

Canon regeneration is the only one, and it is closed last by design: regenerating
against a head that then moves re-breaks it.

### External, human-atomic — at most three, in dependency order

1. **One AI Gateway API key plus its four pricing-evidence variables.**
   Vercel dashboard → AI Gateway → API Keys, then the project's environment
   variables. ~10 minutes, free to create. Evidence: `npm run providers:doctor`
   reports the gateway `credentialPresent: true` and `pricingEvidencePresent: true`.
   Without pricing evidence the lane refuses rather than reporting an invented cost.

2. **One free-tier email provider account, with its activation receipt recorded.**
   Highest capacity first — Sender.net, SendPulse, OneSignal. ~20 minutes, free.
   Evidence: `npm run outreach:free-first:doctor` reports that provider
   `FRESH` and a non-zero `liveUsableCapacity30d`.

3. **A Lemon Squeezy store and `LEMONSQUEEZY_WEBHOOK_SECRET`.**
   ~25 minutes. Evidence: `npm run payment:doctor` leaves
   `SANDBOX_CONFIG_MISSING`.

### Not removable by anyone

Provider acceptance for cold-B2B transport (no reviewed free ESP permits it;
self-hosted Postal is the only lawful path and needs outbound SMTP permission,
PTR/rDNS, SPF/DKIM/DMARC/TLS alignment and seed placement). Customer reality —
a real buyer, a real payment, a real acceptance. Elapsed time for founder-absence
evidence and for sender reputation. Vercel API scope: `list_deployments` returns
403 and `get_project` 404 for both projects, which is provider scope, not a
source failure, and no deployment truth should be read from that path until it
is restored.

## What is not claimed

Not `PRE-CUSTOMER ENGINEERING COMPLETE`. Canon regeneration is outstanding, and
the Postal collision with PR #317 is an open decision rather than a resolved
one — two independent implementations occupy the same six paths and the same
migration number, and they cannot both land.

Not `ALL REMOVABLE BOTTLENECKS CLOSED`, for the same reason.

## Next exact command

```bash
npm ci --no-audit --no-fund
npm run brain              # must print "UberBond brain ready", not a failure
node scripts/founder-absence-doctor.mjs | python3 -m json.tool | grep -A3 softwareGaps
```

Then, in order: regenerate canon (`npm run readiness`, then reconcile
`docs/CURRENT_SYSTEM_STATE.md` and `docs/CURRENT_HANDOFF.json` to the measured
figures, as the final commit); decide the Postal collision against PR #317
using `artifacts/ragnarok/night-donor-reconciliation-2026-09-02.json`; and open
one controlled PR.
