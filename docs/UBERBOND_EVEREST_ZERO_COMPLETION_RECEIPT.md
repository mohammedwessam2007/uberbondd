# UBERBOND_EVEREST_ZERO_COMPLETION_RECEIPT

Reconciled from `main` at `3a7ef18`. Every number below was produced by running
the command on that tree. Nothing here is estimated.

---

## A. Reality baseline

§1 required re-fetching main before changing anything. The observed SHA in the
mission (`c8a5e9f`) was already stale: main had advanced to `b25737a` via #109,
which fixed a real defect I had missed — `payment-renewal-truth.mjs` read flat
audit entries while `Store.log` persists `{type, detail}`, so the reconciler was
blind to canonically-written receipts.

Concurrent branches found and dispositioned:

| Branch | Disposition |
|---|---|
| `gpt/fix-payment-truth-store-envelope` | Already merged as #109. Kept. |
| `gpt/load-bearing-model-routing-20260823` (#108) | Merged, then corrected — see §D.8. |
| `gpt/reconcile-reachability-triage-107` (#110) | Substance adopted, tests replaced — see §D.3. |

## B. Wave status

**Closed with proof:** 1 (reachability), 2 (scan ceiling), 3 (effect states),
4 (escalation transport), 5 (absence falsification), 6 (supplier routing),
7 (payment truth), 10 (outreach authority), 14 (sovereignty), 15 (duplicates),
16 (security), 17 (concurrency, real Postgres), 20 (test quality),
21 (readiness regeneration), 22 (issue archaeology), 23 (adapter inventory),
24 (first-payment readiness).

**Partially closed:** 8 and 9 — the payment→delivery→acceptance→renewal spine is
correct in every stage it can prove, and terminates at `NO_PAYMENT_PROVIDER`.
11, 12, 13 — inbound, lifecycle and owner burden advanced through the escalation
and refund work rather than as separate waves.

**Not closed:** 18 (recovery war beyond the existing crash-injection suites),
19 (systematic mutation testing beyond the sovereignty guards).

## C. Commercial truth

| | |
|---|---|
| **Verified customers** | **0** |
| **Cleared revenue** | **$0.00** |
| **Accepted deliveries** | **0** |
| **Retained customers** | **0** |

Against an empty store the payment spine reports `NO_CLEARED_PAYMENT_PROVEN`,
every stage `NOT_PROVEN`, zero contradictions, and a claim boundary that refuses
each claim by name. That is the correct output for a system that has never taken
a payment, and it is the output it gives.

## D. Defects found by attacking

Twelve. Each was reproduced against the real module before being fixed, and each
is pinned by a test that asserts the reason code rather than merely the refusal.

**1. The scan ceiling answered confidently and wrongly.** Four modules held a
private `MAX_SCAN` passed straight through as `store.list({ limit })`.
`_listDirect` applies no ordering unless asked, so `limit: 2000` returns the
*oldest* 2000. With 2100 filler snapshots and one new run,
`listLatestAutonomyRuns` returned `ok: true, status: 'LISTED'` with the new run
absent. Removed architecturally: fold-as-you-go to exhaustion, memory bounded by
distinct keys, and a walk that cannot finish fails closed.

**2. Starvation returned at scale.** The fairness ledger read the oldest 2000
selections, so with 2100 filler rows the scheduler re-served 2 of the 3 runs it
had just served — the exact bug the ledger exists to prevent.

**3. The ratchet accepted any invented gate name.** `gate:
"TODO_FIGURE_THIS_OUT_LATER"` passed all seven tests, making
`AWAITING_ACTIVATION` a resting state reachable by typing anything. Gates now
live in a registry with a stated release condition.

**4. Zero and unknown were the same value.** A worker that crashed mid-dispatch
and one that genuinely did nothing both shipped `providerCalls: 0`, and both
counted as proof that nothing reached the outside world.

**5. The pager repeated itself.** The suppression the escalation kernel was built
with was never fed: ten ticks against one unchanging condition wrote thirty
durable rows for three problems — seventy-two duplicate pages a day at hourly
cadence.

**6. Nothing escalated the inability to escalate.** `transport: 'UNCONFIGURED'`
was a literal in a report nobody was paged about.

**7. `KILIMANJARO_READY` at 100% with nobody reachable.** A proof satisfying
every dimension — 900 ticks over 31 days, zero unauthorized effects, zero dead
letters, zero abandoned cycles, every capability externally verified — returned
ready while nothing in the repository could reach a person.
`ownerEscalationQueue` was satisfiable by the queue existing.

**8. Enabling model routing starved three of four queues.** PR #108 applied a
single-winner router across a worker list where each worker drains a different
agent's queue. Four workers, four target agents, fresh benchmarks:
`ok: true, status: 'ADVANCED', routingStatus: 'ROUTED'`, one queue serviced.

**9. A revoked approval passed the final recheck.** The gate immediately before
an irreversible message re-read suppression, sender health, settings and the
account from the store — and evaluated *authority* from the in-memory campaign
the batch loop had loaded. Approval revoked in the database mid-batch produced
`ALLOW_LOCAL_PREPARATION` with zero deny reasons.

**10. A refunded payment reported as cleared revenue.** $50 paid, $50 refunded:
`PROVIDER_CLEARED_PAYMENT_PROVEN`, `ok: true`, `contradictions: []`,
`providerClearedRevenue: $50.00`.

**11. Self-improvement could edit its own limits.** A well-formed change set with
a bland rationale was ACCEPTED for every file defining the system's limits,
including the file defining the protection list.

**12. Store guards were truthiness checks wearing allowlist clothes.**
`MAP[key]` and `def.columns[property]` walk the prototype chain, so
`'constructor'`, `'__proto__'` and `'toString'` passed `if (!def) throw` and
reached SQL string interpolation.

## E. Two corrections to my own work

Recorded because the reasoning is the point.

**A near-miss on #11.** The first sovereignty probe reported BLOCKED for all
twelve files. It would have been easy to record that as a pass. The refusal was
`change-0-rationale-required` — my fixture had omitted a field. Adding it turned
every BLOCKED into ACCEPTED. An incidental refusal is not a guarantee.

**A weakening I introduced and removed.** My first per-agent routing draft
exempted single-candidate groups from `fresh-evidence-backed-route-required`,
reasoning that with one candidate there is nothing to prefer. Two of PR #108's
tests failed on it, correctly. That gate is not about preference: routing is
opt-in, and opting in asserts that fresh evidence exists. The exemption would
have quietly weakened a deliberate gate to solve a reporting problem.

## F. Fixtures corrected rather than worked around

Five tests were asserting the defect, not the property:

- A fake store ignoring `offset`, which both real stores implement.
- Guard and pipeline fixtures passing campaigns that existed only in memory —
  a state production cannot be in, since `campaignFor` loads from the store.
- An authority-expiry test that mutated the in-memory campaign object and read
  it back, so it passed while the guard trusted the sender's own memory.
- A routing fixture building workers with no `targetAgent`, which `validWorker`
  rejects.
- A rehearsal test pinning `agent-mesh-control-plane-1.3.0` after #108 moved it
  to 1.4.0, so no receipt qualified and its assertions were never reached. Now
  imported rather than spelled out.
- A market-signal test named for the untagged evidence path while passing a
  bogus tag, conflating "said nothing" with "said something unrecognisable".

## G. Verified gates

| Gate | Result |
|---|---|
| `npm run check:syntax` | 456 files parse |
| `npm run test:deterministic` | 2148 tests, 2103 pass, **0 fail**, 45 skipped |
| `npm run test:relay-safety` | 150/150 |
| `npm run test:postgres-real` | **114/114, 0 skipped**, PostgreSQL 18.4 |
| `npm audit` | 0 vulnerabilities, all severities |

The 45 skipped in the deterministic run are the real-Postgres suites that run
deliberately excludes; all 114 executed and passed against a real server.

Reachability: **103 of 151** `src` modules production-reachable (was 98), 3
operator-only, **45 with no entry point** — every one classified against a
registered gate. `NEEDS_TRIAGE` is empty.

## H. Business-ready but disabled

What one owner action would unlock, grouped by the condition that releases it:

| Gate | Modules | Released by |
|---|---|---|
| `NO_OUTBOUND_AUTHORIZATION` | 9 | Explicit current owner authorization, bound to a named channel and audience |
| `SANDBOX_PROVISIONER_EXTERNAL_BLOCK` | 8 | An operator-supplied isolation attestation |
| `NO_DISCOVERY_ADAPTER` | 4 | An adapter whose output clears the evidence-class clamp |
| `NO_GMAIL_READONLY_GRANT` | 3 | A read-only grant plus one real inbound message |
| `NO_ENRICHMENT_PROVIDER` | 3 | An authorized provider with a funded bounded budget |
| `NO_CUSTOMER` | 3 | One verified customer with a recorded requirement |
| `NO_PAYMENT_PROVIDER` | 1 | A connected provider and one real event |
| `NO_COMMERCIAL_EVENTS` | 1 | Any real commercial event reaching storage |
| `MESH_LIVE_OBSERVATION_REQUIRED` | 1 | Observed production scheduler cycles, owner-reviewed |
| `NO_AI_ACCESS_EXTERNAL_AUTHORIZATION` | 1 | Separate authorization for account creation |
| `VERCEL_DEPLOYMENT_GATED` | 9 | **Nothing — permanent by design.** Operator tooling that should stay out of the production import graph. |

## I. Owner actions — three

1. **One provider credential and an authorised spend cap.** Unlocks the first
   real model call, and with it the cognitive loop against real providers.
2. **An isolation attestation file** (`CLAUDE_CODE_SANDBOX_ISOLATION_FILE`) from
   whatever enforces the network boundary. A Node process cannot make the
   network unreachable to its own children; signing that receipt itself is the
   self-attestation this codebase exists to refuse.
3. **Activate the scheduler** on `scripts/agent-mesh-tick.mjs` with
   `AGENT_MESH_OCCURRENCE_KEY` per delivery. Starts the clock on every
   time-based tier.

A human-reachable escalation transport would be a fourth. It is deliberately
folded into (1) rather than listed, because the cap is three.

## J. Verdict

### `EVEREST_PARTIALLY_CLOSED`

Not `EVEREST_INTERNAL_CLOSED__REALITY_PROOF_PENDING`. Waves 18 and 19 are not
done, and 8, 9, 11, 12 and 13 are advanced rather than closed. Twelve defects in
one session is also evidence about the rate at which this tree yields them: the
honest reading is that the thirteenth exists and has not been found yet, not
that the list is exhausted.

Not `EVEREST_DISPUTE_REQUIRED`. Nothing in the mission contradicted observed
reality. Where the mission's own SHA was stale, §1 said so and the fetch settled
it.

Not `EVEREST_UNSAFE_TO_CONTINUE`. The boundary held throughout: no prospect
contacted, no message sent, no call placed, no form submitted, no advertisement
created, no money spent, no DNS or payment-provider setting changed, no KYC, no
production promotion, no customer system mutated. Two of this session's fixes —
authority read from durable storage, and the sovereignty tier — narrowed what
the system may do to itself and to others.

**What would move the verdict:** waves 18 and 19, then a real transport for
escalation. Everything else on the list is volume rather than risk.
