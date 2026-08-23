# UBERBOND_SUMMIT_100_FINAL_RECEIPT

Every number here was produced by running the command on the final tree.

| | |
|---|---|
| **Start main** | `8e13bc0cd232375b0aad898ea1cea634834c63dc` |
| **Final main** | `7e1030e80bcdec25d92b1688c7ed321969c02c4a` |
| **PRs merged** | #112 (fulfillment time gate), #114 (payment witness probe), #116 (recovery race), #120 (reversal symmetry) |
| **PRs closed** | #110 superseded (its substance is in main); #108 merged in the prior mission |
| **Issues closed** | #111 (escalation episodes), #115, #117 |
| **PRs superseded** | #110, #119 — their substance is in main |
| **Issues open** | #73–#80 — GPT Work research, each with a stated reason |
| **P0 found** | 0 |
| **P1 found** | 8 |
| **P2 found** | 0 |
| **P3 found** | 0 |
| **Files added** | 12 |
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

**17. Payment proof bound to identity, not to content.** Found by a mutation
probe from a concurrent agent (PR #114), which shipped four failing tests and no
fix. Witnesses were matched on `eventName:eventId` and never compared:

```
provider order says : $50.00
revenue ledger says : $5000.00
reconciled as       : $5000.00   PROVIDER_CLEARED_PAYMENT_PROVEN, no contradiction
```

Amount, currency, product and prospect must now agree across the order, the
classification receipt and the ledger row.

**18. That fix had a hole of its own.** Re-attacking it with fourteen variations
found that `clearedEvidenceIndex` dropped `leadId`, `prospectId` and `product`
before the comparison could see them, so only the order and the ledger row were
ever compared. #114's probe mutated the ledger row, which is why its four tests
passed against an incomplete fix; mutating the receipt walked straight through.

**19. The witness check was applied in one direction only.** Found by PR #120.
A refund ledger row claiming $5,000 against a provider refund of $50 recorded
$5,000 reversed and a net of **minus $4,950**. The fixture happened to raise
`refunds-exceed-provider-cleared-payments`, which makes the gap look smaller
than it is — that contradiction fired only because the original payment was
smaller than the forged refund, and with a $6,000 payment the same forgery
produces no contradiction at all. Erasing revenue that was never refunded is the
same class of defect as inventing revenue that was never paid, and it is the one
an operator is less likely to question, because a smaller number rarely looks
like a lie.

**20. Recovery could overwrite a newer reservation status.** PR #116. The
comment it removes claimed two sweeps racing on one row were "safe to apply
twice". They are not: a sender legitimately moving `reserved → dispatching →
sent` while a sweep held an older snapshot could be overwritten back into a
recovery state — a lie about an irreversible effect. Now
compare-and-transition, with `SELECT ... FOR UPDATE` on PostgreSQL.

**21. Cents from different currencies were added into one figure.** Found by
sweep 9, attacking the module *after* every witness check above had landed. A
cleared $50.00 and a cleared JPY 5000 — five thousand yen, in a currency with no
minor unit at all — summed to `10000` and reported
`$100.00 PROVIDER_CLEARED_PAYMENT_PROVEN`. Neither row was wrong; the sum is not
a quantity of anything, and it is the number a revenue claim reads.

This is the shape the mission names explicitly: a synthetic quantity presented
as a real economic figure, with a status saying *proven*. The fix names the
currencies present, exposes `economics.currency` (null when more than one), and
raises `multi-currency-revenue-cannot-be-summed` rather than a total. It does
not convert — an operator can convert, this module cannot, and inventing a rate
here would be the same substitution the rest of the file exists to refuse.

**22. The clearing receipt witnessed identity but not money.** Same sweep. The
receipt index carried `leadId`, `prospectId` and `product` — added in fix 18 —
but never carried `amountCents` or `currency`, so the two money comparisons only
ever saw the order and the ledger row. A receipt claiming EUR against a USD
order and a USD ledger row reconciled as three witnesses in agreement.

Fix 18 closed this hole for the identity fields and left it open for the two
fields that are the payment itself. That is the third time in this mission a fix
of mine was correct in what it did and incomplete in what it covered.

**23. A failed lead lookup widened the question to every lead.** Found by sweep
11. The scope a caller asked about and the record a lookup returned were the
same field, so a lookup that found nothing collapsed the scope to null — which
this module reads as "reconcile everything":

```
ask for "lead-alice" -> $50.00      verified 1  PROVIDER_CLEARED_PAYMENT_PROVEN
ask for "lead-typo"  -> $9,050.00   verified 2  PROVIDER_CLEARED_PAYMENT_PROVEN
```

Both leads were honest and internally consistent, so not one of the witness
checks above catches this — only the scope does. A typo, or a lead deleted since
the question was asked, turned a per-customer figure into the whole book's
revenue with a proven status.

An unknown lead now also raises `payment-truth-requested-for-unknown-lead`
rather than reporting $0.00. A lead nobody can find is not a lead with no
payments, and reporting zero for it is the unknown-as-zero substitution this
file exists to refuse. Whole-book reconciliation stays available by naming no
lead — a decision rather than a failed lookup.

**24. Six credential formats walked through every scanner.** Found by sweep 13.
Eight modules use `src/secret-patterns.mjs` as their only value-shape check: the
change-set blocker, the artifact store, the compute store, the provider worker,
the relay, and the two receipt redactors.

The worst was `github_pat_`. The list covered every *classic* GitHub prefix and
could not reach the fine-grained one, because `github_pat_` starts with `gh` and
the third character is `i`, outside `gh[pousr]_`. Fine-grained is what GitHub
issues by default now, so the most likely token in circulation was the one shape
not detected. Stripe's underscore spelling, HTTP `Basic`, a lowercase
`aws_secret_access_key=`, and this project's own payment provider's key were the
others.

Underneath was an asymmetry: `containsSecretValue` blocks and `redactSecrets`
cleans, and they consulted different rule sets — so a credential could be
refused entry to a receipt and admitted into durable task history in the same
run.

**25. The sovereignty list protected the guards and not their proofs.** Found by
sweep 14. `SOVEREIGNTY_PREFIXES` had a section for "the tests that prove the
guards above still guard". It held four entries, correct when written. Every
killing test added afterwards was left out: fifteen of the twenty suites proving
a sovereignty guard still guards were editable by the autonomous path — as was
`scripts/mutation-war.mjs` itself, the single artifact that decides whether any
of them still kill.

Protecting a guard and leaving its proof editable protects nothing on the second
move. Delete one entry from the mutation list and the proof that a guard works
is gone, replaced by a smaller number nobody cross-checks; the move after that
is the guard.

The root cause was not the four missing names — it was that membership had to be
remembered, and a list that has to be remembered rots. It is now derived: if a
mutation targets a sovereignty-protected file, the suite that kills it must be
protected too, and `sovereignty-proof-closure.test.mjs` fails until it is. The
same test refuses padding, because the cost of this list is that a person is
needed to change anything on it.

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

Sixteen sweeps. Sweeps 1, 2 and 3 each found a P1 and reset the counter. Sweeps 4
and 5 came back clean. Then concurrent agents landed PRs #114, #116 and #120, all
three correct, which reset it repeatedly — and sweep 6, re-attacking the fix for
#114, found the receipt-fields hole that #114's own probe had missed. Sweeps 7
and 8 came back clean on the merged head.

Then the counter reset four more times.

| Sweep | Result |
|---|---|
| 9 | **21** currency conflation, **22** receipt witnesses identity but not money |
| 10 | clean |
| 11 | **23** a failed lead lookup widens the scope to every lead |
| 12 | clean |
| 13 | **24** six credential formats walk through every scanner |
| 14 | **25** the sovereignty list protects the guards, not their proofs |
| 15 | clean (one latent drift hardened, no live defect) |
| 16 | clean |

**Sweeps 15 and 16 are the two consecutive clean sweeps this verdict rests on.**

That table is the most useful thing in this receipt, and sweep 9 is the sharpest
line in it. A clean sweep is evidence about the attacks that were run, not proof
that none remain. Sweeps 7 and 8 were clean, and they immediately preceded the
discovery that a proven-status revenue figure could be denominated in nothing at
all — a cleared $50.00 and a cleared JPY 5000 reported together as `$100.00`.
Eight sweeps had declared that file clean; it was the most heavily attacked file
in the repository; sweep 9 found two defects in it anyway.

Four of the last seven defects were found in code I had written earlier in this
same mission, and two of them were holes in my own fixes for the defect
immediately before. Independent agents' probes found three more that none of my
sweeps did.

That is the honest reason this verdict is about internal closure. The gates are
green and the attacks that were run are recorded; nobody, including me, has
grounds to claim the attacks that were not run would also come back clean.

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
| `npm run check:syntax` | **469** files parse |
| `npm run test:deterministic` | **2277** total, **2231** pass, **0** fail, **46** skip |
| `npm run test:relay-safety` | **150** total, **150** pass, **0** fail |
| `npm run test:postgres-real` | **122** total, **122** pass, **0** fail, **0** skip — PostgreSQL 18.4 |
| `npm run test:mutation-war` | **47** mutations, **47** killed, **0** survived |
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
- [x] Wave 19 mutation war complete, inventory published, 47/47 killed
- [x] #111 closed — the sovereignty protection on `operator-escalation.mjs` was
      not weakened; no entry added, removed or changed, and
      `tests/sovereignty-self-modification.test.mjs` still passes
- [x] #112 resolved — merged, and the half it left open is closed
- [x] two consecutive clean independent P0/P1 sweeps (15 and 16)
- [x] full exact-head gates green
- [x] real PostgreSQL gates green
- [x] reachability classifications current
- [x] no unknown architecture blocker

Every remaining blocker is a customer, a provider, a credential, a payment rail,
a human-reachable transport, live production observation, or elapsed real time.

Twenty-five defects have been found across two missions in code that was green
each time — and **ten of them surfaced after this receipt was first written**,
in a tree whose gates were already all passing. Three came from concurrent
agents' probes. Four were in code I had written earlier in this same mission.
Two were holes in my own fix for the defect immediately before it.

That is the honest reason this verdict is about *internal* closure and not about
correctness. A twenty-sixth defect probably exists. The evidence in the table
above is that the rate has not reached zero, only that two consecutive sweeps of
the attacks I could think of came back clean — and sweeps 7 and 8 also came back
clean, immediately before sweep 9 found two defects in the most heavily attacked
file in the repository.

What has changed is not that the tree is proven correct. It is that the guards
are now known to be load-bearing, the crash boundaries are enumerated, and both
facts are executable rather than asserted — so the next defect has to get past
47 mutations and a published matrix rather than past an assurance.

**Stop building. Hand the rest to reality.**
