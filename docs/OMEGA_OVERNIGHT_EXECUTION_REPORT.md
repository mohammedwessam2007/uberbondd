# Omega overnight execution report

Branch: `agent/gpt-autonomous-roundtrip-20260820` (draft PR #40)
Started at: `ffa41ba`
Ended at: `364d3b7`
Not merged to main. No production consequence. No external effect.

## What this session actually did

Merged `main` into this branch, then attacked the agent mesh until it broke —
five times, two of them P0.

It also contains a mistake I made and then had to undo; that is written up in
full below rather than quietly reverted.

## Defects found, all by running rather than reading

| # | Severity | Defect |
|---|---|---|
| 1 | **P0** | A terminal execution record could be **resurrected**. "Latest" was decided by a wall-clock stamp, so two writes in one millisecond were unordered and the transition guard could compare against the *older* record. Measured: `MODEL_RESULT_READY` → `RESULT_SUBMITTED` → stale `MODEL_RESULT_READY` reopened the task, and `loadLatestAgentExecution` returned `MODEL_RESULT_READY`. The terminal state was lost, not merely bypassed. |
| 2 | **P0** | A compute budget could **roll back to less spend**. Same mistake, and here the state is money. Measured: true state 700 cents committed / 300 available loaded back as **0 committed / 1000 available**. Seven hundred cents of spend vanished and the capacity reappeared — on restart, exactly when nothing is watching. |
| 3 | **P1** | **Safe retry did not exist.** A reservation released without spending anything (rate limit, cancelled before dispatch) permanently blocked its own task from reserving again. The budget showed full capacity and the task could never use it. |
| 4 | **P1** | A task declaring **no** consequence class was **accepted**. The guard fired only when a class was present and wrong. Undeclared tasks reached `READY_TO_EXECUTE` and reserved compute. Unknown consequential state must fail closed. |
| 5 | **P2** | A crash-recovery replay was rejected because its **keys arrived in a different order**. `JSON.stringify` comparison made key order part of identity, so the guard refused the replay on precisely the path terminal idempotency exists to serve. |

Defects 1, 2 and 5 are the same underlying error in three places: **"latest"
defined as "most recently stamped" rather than "furthest along a monotonic
quantity."** That pattern is now recorded in the failure matrix so the next
instance is recognised rather than rediscovered.

## Every fix was verified by breaking it

No fix is claimed without reverting it and watching the matching test fail.

| Fix | Reverted → |
|---|---|
| Stage-rank ordering | soak tests 1 and 3 fail |
| Budget spend ordering | rollback test fails |
| Retry after release | 3 of 6 conservation tests fail |
| Consequence class required | 3 of 5 gate tests fail |
| Canonical record comparison | reordered-replay test fails |

## Verification actually run

```
npm run check:syntax      pass (150 modules, was 125)
npm run test:deterministic 1540 tests, 1498 pass, 0 fail, 42 skipped
npm audit                  0 vulnerabilities
```

Before this session the merged tree was 1350 tests with 2 failures.

**A correction.** I first reported that 171 of those tests "had never
executed". That was wrong. `tests/agent-relay.test.mjs` imports 19 of the
mesh suites, and that file *is* in `test:deterministic`, so they were running
all along. My build-wiring guard counted only `package.json` references, so it
called them orphans; acting on it made those 19 files execute **twice** and
inflated the suite to 1521 — a number that looked like progress and was
double-counting.

Reverted. The verified position is that **zero** test files are orphaned. The
guard now follows the import graph, and a second guard catches the inverse
mistake — a file both named by a script and imported by another script's file.
Both were checked by deliberately reintroducing each failure.

## Soak

`tests/agent-mesh-soak.test.mjs`: 1,000 tasks through the real state machines
with crashes injected at four durable boundaries, plus a concurrency race and a
direct resurrection attempt. It asserts each boundary was genuinely hit — a
soak that never crashed proves nothing about crash recovery. Fakes only; no
provider called, no network touched, no money moved.

## Adversarial sweeps

The stop condition was two consecutive sweeps finding no new P0/P1.

- **Sweep 1** — malicious model, hostile payloads: deep-nested secrets, secrets
  in arrays, private-key blocks, null-prototype objects, homoglyph keys, NaN /
  Infinity / negative / float / string budget values, wrong-typed consequence
  classes, unknown statuses, oversized records. Two findings, both examined and
  neither a defect: one was my probe's incomplete task fixture, the other is
  bounded numeric coercion that cannot create capacity.
- **Sweep 2** — hostile scheduler and stale store, aimed squarely at the guards
  added this session: later-written stale writes, conflicting terminal statuses,
  budget ties where only tokens moved, four shapes of sequence rewind, and every
  reserve/release/commit interleaving. **No new defect.**

Both sweeps are now `tests/agent-mesh-adversarial-sweep.test.mjs` so they run
forever rather than living in one session's scratch directory.

## What is deliberately still red

- **The HTTP ingress is deployed nowhere.** Exercised over loopback against the
  real GitHub API, which covers every line except the hosting.
- **GitHub Actions is blocked at the account level.** Every run since `fe51c3c`
  dies in 3–10 seconds with 404 job logs. Nothing in this code caused it and
  nothing in this code can fix it.
- **No provider has ever been called.** The OpenAI and Anthropic adapters exist
  and are disabled by default.

## Commercial reality

Externally verified, as of this report:

```
cleared customer revenue        0
real paying customers           0
accepted customer deliveries    0
repeat payments                 0
retained customers              0
live acquisition experiments    0
```

None of tonight's work moves any of those. It makes the machine harder to fool,
which is a precondition for trusting it with money later — not a substitute for
having earned any.

## External effect ledger

```
customer messages     0
purchases             0
deployments           0
DNS changes           0
credential changes    0
production mutations  0
live customer effects 0
live payment effects  0
```
