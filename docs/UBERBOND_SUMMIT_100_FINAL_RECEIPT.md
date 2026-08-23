# UBERBOND_SUMMIT_100_FINAL_RECEIPT

Every number here was produced by running the command on the final tree.

| | |
|---|---|
| **Start main** | `8e13bc0cd232375b0aad898ea1cea634834c63dc` |
| **Final main** | see §Final gates — reconciled and pushed |
| **PRs merged** | #112 (fulfillment time gate) |
| **PRs closed** | #110 superseded (its substance is in main); #108 merged in the prior mission |
| **Issues closed** | #111 (escalation episodes) |
| **Issues open** | #73–#80 — GPT Work research, each with a stated reason |
| **P0 found** | 0 |
| **P1 found** | 4 |
| **P2 found** | 0 |
| **P3 found** | 0 |
| **Files added** | 9 |
| **Files deleted** | 0 |
| **Duplicate modules removed** | 0 modules; 2 duplicate *implementations* collapsed onto canonical ones |

---

## P1 findings

Four, each reproduced against the real module before being fixed, each pinned by
a test that asserts the reason code rather than the refusal, and each added to
the mutation inventory.

**13. Forward time travel through the fulfillment clock.** PR #112 made
contractual time a real gate and closed backward time travel. `next.updatedAt`
is set from the event's own timestamp and nothing bounded it from above:

```
SUPPORT_ENDED at 3000-01-01, 30-day support window, 90-day renewal
  =>  ALLOW -> RENEWAL_DUE
```

Renewal due 974 years early because the caller said so — retention proven by
fast-forwarding contractual time, the one thing the clock exists to prevent. It
also froze the record: state time became year 3000, so every subsequent real
event failed `event-time-regression` forever. Two bounds now: `at` may not run
ahead of the trusted clock by more than the repository's five-minute skew
allowance, and a ten-year absolute horizon catches a caller who supplies both.

**14. Escalation suppression that could never expire.** `activeFingerprints`
meant "every fingerprint ever raised". Probed with silent, silent, silent,
healthy, healthy, silent, silent:

```
SCHEDULER_SILENT durable rows: 1     (two real outages)
```

The second outage was never escalated. Suppression that cannot expire is
indistinguishable from not detecting the problem, and worse than the
duplicate-flood it replaced because a flood is visible. Episodes are now a fold
over rows this module already writes: an escalation opens one, a resolution
closes one, and recurrence pages again.

**15. The omitted-key zero-effect hole, in two more modules.** `{}` accepted as
proof of zero external effects was fixed in `cloud-agent-relay.mjs` in an earlier
session. Four implementations existed:

```
cloud-agent-relay.mjs      canonicalZeroEffectLedger   correct
relay-shadow-binding.mjs   Number(ledger[key] ?? NaN)  correct
chatgpt-relay-client.mjs   Number(value[key] || 0)     accepted {}
github-relay.mjs           Number(effects[key] || 0)   accepted {}
```

`github-relay.mjs` is the sharper one: its own header says the two transports
"cannot drift apart in what they consider safe" because they import the same
`ZERO_EFFECTS`. They shared the constant and re-declared the comparison, and the
comparison drifted. A receipt claiming nothing was accepted as a receipt proving
nothing happened.

**16. A session cookie was not a credential.** The scanner caught eleven shapes
and missed one — `Cookie: session=...`, the same kind of thing as the `Bearer`
token it did catch, arriving through a different header. Bare JWTs were missed
too. A worker pasting a request header into its output wrote a live session
credential into durable task history.

## Also closed

**Store parity.** `unknown collection` and `unknown filter` returned `[]` on the
JSON path and threw on PostgreSQL, making a typo a silent empty result in
development and a loud error in production. An empty list from a suppression
lookup reads as "nobody is suppressed". The previous session recorded this
rather than changing it; running the full suite against the change was the
archaeology, and the only failures were the two tests pinning the divergence.

## Two corrections to my own work

**A near-miss.** The first probe of the four zero-effect implementations found
only `chatgpt-relay-client.mjs`, by reading. The test I wrote afterwards found
`github-relay.mjs`, which I had not looked at. The test was better than the
reading.

**Assertions about prose.** That same test failed twice on its own comments: it
matched source text for the defective spelling, and my comments quote the
defective spelling while explaining it. A source-text assertion that matches
prose is an assertion about prose. It strips comments now.

## Push protection

GitHub refused a commit containing a Slack-token fixture and offered an unblock
URL. Taking it would have defeated a working control to make a test convenient.
The fixtures are assembled at run time from pieces instead, so no
credential-shaped literal is committed at all — which also removed the need for
a scanner exemption. A repository containing no such literals is a stronger
property than one containing them under a declared exception.

## Recovery matrix — Wave 18 exit gate

Published at [`docs/RECOVERY_MATRIX.md`](RECOVERY_MATRIX.md). Every persistence
boundary where a crash could produce a second irreversible effect, with its
classification and the test that holds it there. `BLIND_REPEAT_IRREVERSIBLE_EFFECT`
appears nowhere.

Newly covered: every payment boundary, every fulfillment delivery boundary, the
escalation dispatch boundary, and the mission-seed leg of the scheduler. Prior
coverage of the outbound and external-effect paths is credited rather than
duplicated.

The matrix also names what it does **not** cover — a store that loses a committed
write, a torn transaction, and real provider behaviour under crash — because a
matrix implying otherwise is worse than one that says so.

## Mutation inventory — Wave 19 exit gate

Published at [`docs/MUTATION_INVENTORY.md`](MUTATION_INVENTORY.md), executable
via `npm run test:mutation-war`.

**36 mutations, 36 killed, 0 survived.**

Not a percentage. Mutating arbitrary lines produces mostly equivalent mutants
and a number nobody can act on; mutating the invariants this system's safety
rests on produces a list an operator can read. The runner refuses to count a
mutant that does not parse — the first draft of `AGENT-04` was a syntax error,
the suite duly failed, and reporting that as KILLED would have been a lie about
a guard nobody had tested.

## Red-team sweeps

Five sweeps. Sweeps 1, 2 and 3 each found a P1 and reset the counter. Sweeps 4
and 5 came back clean, giving the two consecutive clean sweeps §37 requires.

Sweep 4 and 5 coverage: nine prompt injections against the outbound authority
gate (instruction override, fake SYSTEM line, evidence-fence escape, SQL,
template syntax, ANSI escapes, embedded NUL, `__proto__`, `constructor`) — all
DENY, table intact. Cross-entity payment witness borrowing — proves nothing.
Forty concurrent racers, twenty-five consecutive rounds on real PostgreSQL —
exactly one winner every time. Idempotency at 1, 2, 10 and 100 applications —
one durable row; distinct work not deduped. Seventeen attempts to manufacture
`KILIMANJARO_READY` — all refused. Synthetic-to-external promotion — refused on
every path. Zero duplicate exported names. Zero unclassified dead modules, zero
stale classifications. Unreadable store dimensions reported unreadable, never
zero.

## Final gates

| Gate | Result |
|---|---|
| `npm run check:syntax` | **463** files parse |
| `npm run test:deterministic` | **2194** total, **2148** pass, **0** fail, **46** skip |
| `npm run test:relay-safety` | **150** total, **150** pass, **0** fail |
| `npm run test:postgres-real` | **122** total, **122** pass, **0** fail, **0** skip — PostgreSQL 18.4 |
| `npm run test:mutation-war` | **36** mutations, **36** killed, **0** survived |
| `npm audit` | 0 info, 0 low, 0 moderate, 0 high, 0 critical |

The 46 deterministic skips are the real-PostgreSQL suites that run excludes by
design; all 122 executed and passed against a real server.

**Reachability:** 103 of 151 `src` modules production-reachable, 3 operator-only,
45 with no entry point — every one classified against a registered gate.
`NEEDS_TRIAGE` empty, no unclassified dead module, no stale classification.

## Architecture score

0 absent · 1 designed · 2 implemented · 3 deterministic proof · 4 integration
proof · 5 real infrastructure proof · 6 repeated live proof · 7 economic proof

| Area | Score | Ceiling reason |
|---|---|---|
| Evidence truth | 4 | |
| Authority | 4 | |
| Persistence | 5 | real PostgreSQL |
| Recovery | 5 | real PostgreSQL, crash injection |
| Concurrency | 5 | real PostgreSQL, stressed |
| Idempotency | 5 | real PostgreSQL |
| Scheduling | 3 | never observed live |
| Agent mesh | 3 | never observed live |
| Model routing | 3 | no provider credential |
| Sandbox | 2 | no external isolation attestation |
| Prospect intelligence | 3 | no discovery adapter |
| Outbound | 3 | no outbound authorization |
| Inbound | 2 | no Gmail grant |
| Suppression | 4 | |
| Payment truth | 5 | real PostgreSQL; no provider |
| Fulfillment | 3 | no customer |
| Acceptance | 2 | no customer |
| Retention | 2 | no customer |
| Escalation | 3 | no human-reachable transport |
| Economic learning | 2 | no commercial events |
| Security | 4 | |
| Reachability | 4 | |
| Self-improvement governance | 4 | |

Nothing scores 6 or 7. Live and economic proof are absent, and no internal score
compensates for that.

## Commercial truth

```
VERIFIED CUSTOMERS  : 0
CLEARED NET REVENUE : $0.00
ACCEPTED DELIVERIES : 0
RETAINED CUSTOMERS  : 0
```

Verified, not assumed: reconciled from an empty store through the real payment
spine, which reports `NO_CLEARED_PAYMENT_PROVEN` with every stage `NOT_PROVEN`
and zero contradictions. `data/db.sample.json` carries zero orders and zero
revenue events.

No prospect contacted, no message sent, no call placed, no form submitted, no
advertisement created, no money spent, no DNS or payment-provider setting
changed, no KYC, no production promotion, no customer system mutated.

## External gates

| Gate | Blocks |
|---|---|
| No provider credential | every real model call |
| No isolation attestation | autonomous engineering |
| No scheduler firing | every time-based tier |
| No human-reachable transport | the owner learning anything |
| No Gmail readonly grant | inbound sensing |
| No discovery adapter | prospect intelligence |
| No outbound authorization | every message |
| No payment provider | any cleared revenue |
| No customer | acceptance, retention, renewal |
| No elapsed time | multi-day absence tiers |

## Owner actions — three

1. **One provider credential and an authorised spend cap.** Unlocks the first
   real model call, and with it the cognitive loop against real providers.
2. **An isolation attestation file** (`CLAUDE_CODE_SANDBOX_ISOLATION_FILE`) from
   whatever enforces the network boundary. A Node process cannot make the
   network unreachable to its own children; signing that receipt itself is the
   self-attestation this codebase exists to refuse.
3. **Activate the scheduler** on `scripts/agent-mesh-tick.mjs` with
   `AGENT_MESH_OCCURRENCE_KEY` per delivery. Starts the clock on every
   time-based tier.

## First real payment — minimum remaining sequence

1. Payment-provider account and KYC completed by the owner.
2. Checkout activated for one bounded offer.
3. A real buyer identity.
4. A real provider-cleared payment event reaching durable storage.
5. A recorded delivery requirement.
6. External customer acceptance evidence.

Steps 4 through 6 are what the payment and fulfillment spines already read; none
of them can be produced from inside this repository.

## Final verdict

### `EVEREST_INTERNAL_CLOSED__REALITY_PROOF_PENDING`

Against §46:

- [x] 0 known locally solvable P0
- [x] 0 known locally solvable P1
- [x] Wave 18 recovery war complete, matrix published
- [x] Wave 19 mutation war complete, inventory published, 36/36 killed
- [x] #111 closed — the sovereignty protection on `operator-escalation.mjs` was
      not weakened; no entry added, removed or changed, and
      `tests/sovereignty-self-modification.test.mjs` still passes
- [x] #112 resolved — merged, and the half it left open is closed
- [x] two consecutive clean independent P0/P1 sweeps (4 and 5)
- [x] full exact-head gates green
- [x] real PostgreSQL gates green
- [x] reachability classifications current
- [x] no unknown architecture blocker

Every remaining blocker is a customer, a provider, a credential, a payment rail,
a human-reachable transport, live production observation, or elapsed real time.

Sixteen defects have been found across two missions in code that was green each
time. That is the honest reason this verdict is about *internal* closure and not
about correctness: a seventeenth may exist. What has changed is that the guards
are now known to be load-bearing, the crash boundaries are enumerated, and both
facts are executable rather than asserted.

**Stop building. Hand the rest to reality.**
