# UberBond — Kilimanjaro Architecture Closure Report

**Date:** 2026-08-22 → 2026-08-23
**Branch:** `claude/uberbond-kilimanjaro-closure-hha0oo`

---

## Verdict

**INTERNAL_ARCHITECTURE_COMPLETE_EXTERNAL_PROOF_DOMINATES**

Every gap in scope that software could close is closed and proven by a test
that fails when the property is removed. What remains needs a provider
credential, a payment identity, a real counterparty, or the passage of time.
None of those can be manufactured from inside a repository.

One qualification on that verdict, stated up front rather than buried: nothing
in this system pages a human when it dies. For a system meant to run while the
founder is on a mountain, that is a real operational gap, and no test closes it.

---

## Commercial truth

| | |
|---|---|
| **Real customers** | **0** |
| **Cleared revenue** | **$0.00** |
| **Accepted deliveries** | **0** |
| **Retained customers** | **0** |
| **External effects this session** | **0** — no message, no provider call, no deployment, no spend |

The ten automation services carry $14,750/mo in prices. Those are
`CREATOR_CLAIM` — a figure from a social-media post — and the code refuses to
let them become market prices, buyer signals, or revenue.

---

## Start and end

| | |
|---|---|
| Start main | `07d8ce85472365c9fca1b704e8b0ad91244d8f1e` |
| Final head | `9039d18` (branch, not merged to main) |
| Commits | 95 |
| Files added | 59 (18 src, 33 tests, docs, scripts) |
| Files deleted | 0 |

**Main was not touched.** All work is on the designated branch. Merging to main
is an owner decision, not one I took on my own authority.

---

## Test evidence

| Gate | Baseline on main | Final |
|---|---|---|
| `check:syntax` | 360 files | **412 files** |
| `test:deterministic` | 1603 / 1561 pass / 0 fail / 42 skip | **1885 / 1843 pass / 0 fail / 42 skip** |
| `test:relay-safety` | 150 / 150 pass | **150 / 150 pass** |
| `test:postgres-real` | never executed | **107 / 107 pass / 0 skip** |
| `npm audit` | 0 vulnerabilities | **0 vulnerabilities** |

The 42 still skipped in the deterministic run are the real-PostgreSQL suites,
which that run excludes by design. They are no longer unproven: a real
PostgreSQL 18.4 was started from the binaries already in `devDependencies` and
all 107 passed.

---

## PRs reconciled

All merged into the branch after per-step gates, not batched.

| PR | Disposition |
|---|---|
| #91 monotonic constraints | Merged, **defect found and fixed** |
| #92 worker-result terminal truth | Merged, **was red on main**, repaired and extended |
| #93 occurrence identity | Merged |
| #94 scheduler fairness | Merged, **defect found and fixed** |
| #95 durable cycle receipts | Merged |
| #96 duration/freshness proof | Merged via #97 |
| #97 receipt-derived readiness | Merged, **superseded #95's tip**, gap found and fixed |
| #98 prospect evidence | Merged, **four suppression escapes found and fixed** |
| #90 inbound + attribution | Merged |
| #72 SKU / delivery / bundle | Merged |

On the #95/#97 overlap: #97 branched from an earlier commit of #95, then both
hardened the same file independently. #97's version is a strict superset, so it
won the conflict — and #95's hardening tests were kept and run against it, which
is what proves the superset claim rather than asserting it.

---

## Defects found and repaired

**P0 — 0.** Nothing found that was already causing loss or double-spend.

**P1 — 7.**

1. **Constraint truncation at the ceiling** (in #91 itself). A parent holding
   the full 64 constraints produced a child with 62 — two parent restrictions
   vanished silently, which is exactly the disappearance the monotonicity rule
   exists to prevent. Overflow now refuses to compile.

2. **An incomplete ledger read as a zero-effect proof.** `Number(ledger[key] || 0)`
   meant an omitted key scored the same as a signed zero, so a worker could
   assert "no external effects" by shipping `{}`. A NaN scored zero too, and an
   array passed as an object.

3. **The secret scanner did not know its own vocabulary.** A `businessEffectLedger`
   was rejected as credential-bearing because the exemption listed two of three
   ledger field names. Every result carrying one failed.

4. **Bounded scheduler starvation.** #94 ordered fairly *within* a 200-run
   window taken newest-first, and serving a run refreshed its timestamp. With
   260 active runs and five times the capacity needed, 60 were never served
   once.

5. **A crashed cycle was invisible.** A cycle that died between STARTED and
   TERMINAL was not a failed tick — it was nothing at all. Twenty clean cycles
   alongside six crashes reported `failedTicks: 0`. A mesh crashing every other
   cycle could have certified a seven-day absence.

6. **Six secret regexes with six different holes.** The relay matched `ghp_`
   only, so `ghs_`/`gho_`/`ghu_`/`ghr_` walked through. The provider worker had
   no PEM pattern at all. A scanner is only as good as its worst copy.

7. **A bounded scan answered with a stale run.** Once the 2000-row window came
   back full, "no matching row" and "the run is past the bound" became the same
   observation, and a reload handed back an older snapshot. A run simply stopped
   advancing with nothing saying why.

**P2 — 3**, all fixed: verifier command graph unprotected (`scripts/run-tests.mjs`
was editable by an untrusted change immediately before the gate that ran it);
free text quoted verbatim into durable receipts; the canary concurrency suite
passing exactly once per database.

---

## Proof levels reached

| Proof | State |
|---|---|
| Crash | Cognitive loop reloaded from the store at every step, completes across restarts |
| Concurrency | 12-way receipt races, contradictory terminal truth, duplicate reconciliation — exactly-once logical effect |
| Real Postgres | 107/107 on PostgreSQL 18.4, previously never executed |
| Soak | 800 occurrences (every fifth delivered 3×) → exactly 800 receipts; 60 runs all terminal; growth linear |
| Security | Hostile worker, hostile provider, prompt injection, secret leakage — all refused with named reasons |
| Sandbox | Filesystem isolation real and tested; network isolation refused as unattestable |
| Agent mesh | Full GPT ↔ UberBond ↔ Claude conversation, restart-safe, constraints intact |
| Founder absence | Derived from durable receipts; a rehearsal explicitly fails to certify |
| Live / economic | **None.** Nothing has been proven against the world. |

---

## What the sandbox honestly is

The provisioner does real work: ephemeral workspace, local clone pinned to a
resolved revision with `--no-hardlinks` so its object store is a copy, an
ephemeral HOME outside the editable tree, a child environment built from an
allowlist so no credential survives, git restricted to five subcommands with no
shell, and a destroy that refuses any path it did not create. A test deletes the
sandbox's `.git/objects` and the origin is untouched.

It will not claim network isolation. A Node process cannot make the production
network unreachable to its own children, so absent an external attestation it
returns `SANDBOX_PROVISIONER_EXTERNAL_BLOCK` with the unverified dimensions
listed as `null` rather than defaulted to the safe-looking value.

---

## Owner actions — three

1. **One provider credential and an authorised spend cap.**
2. **An isolation attestation file** from whatever enforces the network boundary.
3. **Activate the scheduler** on `scripts/agent-mesh-tick.mjs`, one
   `AGENT_MESH_OCCURRENCE_KEY` per delivery, zero business effects.

Not asked for, deliberately: no Vercel deployment was triggered, nothing was
purchased or upgraded, no PR was opened, and main was not merged.

---

## What I would not claim

- Not `KILIMANJARO_READY`. That needs seven days of real cycles. The rehearsal
  asserts its own insufficiency rather than leaving it implied.
- Not `LIVE_CANARY_READY`. No credential, no pricing evidence, no canary budget.
- Not "no defects remain". Two hostile sweeps found nothing new, which lowers
  the odds; it does not make them zero.
- The 2000-row snapshot ceiling is bounded and reported, not cured. Curing it
  needs a schema change for per-run reads.

**Internal architecture complete. Reality now owns the remaining gates.**
