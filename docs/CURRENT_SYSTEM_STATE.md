# UberBond — current system state

**Updated:** 2026-08-22
**Branch:** `claude/uberbond-kilimanjaro-closure-o43pyu`
**Base main at start:** `07d8ce85472365c9fca1b704e8b0ad91244d8f1e`

This file exists so nobody has to read eighty historical reports to find out
what is true. If it disagrees with an older document, this one is right — and
if it disagrees with the test output, the test output is right and this file
needs updating.

---

## Commercial truth

| | |
|---|---|
| Real customers | **0** |
| Cleared revenue | **$0.00** |
| Accepted deliveries | **0** |
| Retained customers | **0** |

Nothing in the repository has ever taken a payment. `data/db.sample.json`
holds zero orders and zero subscriptions, and no production datastore is
attached. The ten AI-automation offers carry `CREATOR_CLAIM` pricing, which
means somebody wrote a number down — not that anyone paid it.

---

## What the gates actually say

Every number below came from running the command, on this tree, in this
session. None of it is inferred from reading code.

| Gate | Result |
|---|---|
| `npm run check:syntax` | 411 files parse |
| `npm run test:deterministic` | 1909 tests, 1867 pass, 0 fail, 42 skipped |
| `npm run test:postgres-gate` | 13 suites, 129 tests, 129 pass, 0 fail, **0 skipped** |
| `npm run test:relay-safety` | 150 tests, 150 pass, 0 fail |
| `npm audit` | 0 vulnerabilities |

The 42 skips in the deterministic suite are the real-PostgreSQL tests, and
they skip **only** when no database is configured. Given one, they run and
they pass — that is what `test:postgres-gate` is for. Before this session
nobody had ever run them.

GitHub Actions was not used: `CI_ACCOUNT_BLOCKED_OR_UNVERIFIED`. Everything
above was executed on the session runner instead. No Vercel deployment was
attempted; these are backend and library changes, deployment proof is not
required for them, and the free-plan daily limit is a platform fact rather
than evidence about the code.

---

## Architecture, as it now stands

### The reliability spine

One canonical definition of every safety-shaped thing, because the recurring
failure in this repository has been two definitions drifting apart:

- **`src/effect-ledger.mjs`** — the external and business zero-effect shapes.
  Previously three copies under two names, and the drift was live: the
  relay's secret scanner did not know `businessEffectLedger` existed, so every
  canonical worker result was rejected as secret-bearing. Wired into the
  autonomy pump, that meant no task could ever have completed.
- **`src/secret-patterns.mjs`** — what a credential looks like. Previously two
  lists, and the shorter one guarded durable storage: a connection string with
  an embedded password was redacted out of receipt excerpts while being
  written verbatim into task history.
- **`src/ai-compute-budget.mjs`** — the one reserve/invoke/commit transaction.
  A second implementation exists, is marked superseded, and a test fails if
  anything imports it.

### Authority

Child task authority is a superset of parent restrictions, always
(`inheritTaskConstraints`). A worker cannot escalate its budget, drop a
constraint, invent a coordination action, claim a business effect, or answer
for a task it was not given. A thin model result — outcome and a decision,
no tests run, no truth table, no ledger — cannot reach a terminal state.

### Time

Founder-absence readiness reports the tier the receipts support, not the tier
the checklist implies: `LOCAL_REHEARSAL` → `ONE_REAL_TICK` → `MULTI_TICK` →
`OVERNIGHT` → `ONE_DAY` → `THREE_DAY` → `SEVEN_DAY_KILIMANJARO` →
`FOURTEEN_DAY`. A tier needs both wall-clock span and tick count; 200 ticks in
an hour is 200 ticks and an hour. Any open dead letter, unrecovered failure,
or unauthorized effect collapses the tier to `LOCAL_REHEARSAL` however long
the window — a run nobody resolved was not survived, it was abandoned.

**Current proven tier: `LOCAL_REHEARSAL`.** No durable cycle history exists,
because the scheduler has not been run.

### Isolation

`src/agent-sandbox-provisioner.mjs` provisions real Linux user, mount, and
network namespaces. The capability probe is empirical: it opens a socket
inside the namespace and requires the attempt to fail. When the host cannot
isolate, the result is `SANDBOX_PROVISIONER_EXTERNAL_BLOCK` with no sandbox
and no isolation receipt, and the blocked provisioner exposes no lifecycle
functions — there is no caller mistake that ends with a model running against
the real working tree.

Seventeen escape attempts run as tests, asserting on **host** state rather
than on what the contained process believed happened. That distinction found
the first version's actual hole.

### Prospect intelligence

Provider-neutral throughout; no vendor is named in any of the four modules and
a test enforces it. One provenance ladder shared by discovery, enrichment and
verification, ordered by who is in a position to know rather than who wrote
last. Conflicts stay explicit, unknown stays unknown, an unmeasured cost
records `null` rather than zero.

Verification is eight states, not a boolean. Suppression sits above all of it:
a contact that unsubscribed stays suppressed when the strongest possible
source returns the same address as `VALID` with maximum confidence.

A model contributes a bounded component-wise opinion capped at
third-party-unverified strength and 35% of any component. Decision-shaped
fields it returns are dropped at the boundary and the attempt recorded.
Deterministic policy decides.

### Inbound and attribution

`gmail.readonly` only; the reader exposes no send-shaped method. Evidence
class is bound to an attestation the reader mints for the specific message it
fetched — asking for `PROVIDER_OBSERVED` without one fails closed to
`UNVERIFIED_INPUT`. A reply may become a `RESPONSE` or a `FAILURE` node and
never a `PAYMENT` one, however confidently it says the invoice cleared.

---

## Reachability

`npm run reachability` (or `node scripts/reachability-audit.mjs`), enforced by
`tests/reachability-audit.test.mjs`:

| Bucket | Count |
|---|---|
| Reachable from a production entry point | 78 |
| Reachable only from `scripts/` | 24 |
| Test-only — proven, not wired | 77 |
| Unreachable — nothing imports it, tests included | 1 |

Test-only is not automatically wrong: new architecture lands proven before it
lands wired, and the omnia-v9 safety kernels are deliberately kept out of any
live send path. The single unreachable module is
`src/omnia-v9/integrations/outreach-consequence-admission.mjs` — 128 lines of
outbound consequence policy that nothing calls, so nothing it claims to
enforce is enforced. Wire it or delete it; it should not sit there looking
like coverage.

---

## Open external gates

These are not software problems and no amount of further engineering closes
them.

| Gate | Why it is open |
|---|---|
| Provider canary | No API key, no spend cap, no activation grant |
| Payment truth | No payment provider identity, no KYC |
| Real customers | Nobody has bought anything |
| Multi-day absence | Time has not passed; the ladder climbs only by running |

---

## Owner actions

Three, and one of them is optional.

1. **Provider credential + spend cap.** Unlocks the live agent-mesh tier and
   real self-upgrade runs. Software cannot mint an API key.
2. **Payment provider identity + KYC.** Unlocks every economic tier. KYC is a
   legal identity check on a person.
3. **Scheduler activation** *(optional, deferrable)*. Software can run it;
   activating a scheduler in a real environment is a deployment decision, so
   it is prepared and not activated. Without it the founder-absence tier stays
   `LOCAL_REHEARSAL` forever — with it, the tier climbs unattended.

---

## External effects from this session

Zero. Nothing contacted a customer, called a model provider, deployed
anything, changed DNS or credentials, or spent money.
