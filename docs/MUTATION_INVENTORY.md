# Mutation inventory

Wave 19's exit gate. A guard that nothing tests is decoration, and the only way
to know a test is holding a guard up is to break the guard and watch the test
die.

Run it:

```
npm run test:mutation-war                    # 54 mutations
OMNIA_V9_TEST_DATABASE_URL=... npm run test:mutation-war   # all 55
```

Each mutation is a literal source edit applied to a copy of the tree, with the
suites that must fail named alongside it. The runner refuses to count a mutant
that does not parse: a suite failing because the file broke proves nothing about
the guard, and one of these mutations was caught doing exactly that on its first
draft.

**Exit condition: every entry kills at least one test.** Not a percentage.
Mutating arbitrary lines produces mostly equivalent mutants and a number nobody
can act on; mutating the specific invariants this system's safety rests on
produces a list an operator can read.

**Current: 55 mutations, 55 killed, 0 survived.**

| ID | Guard | File | Killed by |
|---|---|---|---|
| `AUTH-01` | Outbound authority is read from durable storage | `src/deliverability-guard.mjs` | `outbound-stale-authorization.test.mjs` |
| `AUTH-02` | A revoked campaign approval denies | `src/deliverability-guard.mjs` | `outbound-stale-authorization.test.mjs`<br>`deliverability-guard.test.mjs` |
| `AUTH-03` | An expired campaign approval denies | `src/deliverability-guard.mjs` | `deliverability-guard.test.mjs`<br>`pipeline-deliverability-guard.test.mjs` |
| `AUTH-04` | An unreadable authority fails closed | `src/deliverability-guard.mjs` | `outbound-stale-authorization.test.mjs` |
| `MONEY-01` | A payment needs three witnesses | `src/payment-renewal-truth.mjs` | `payment-renewal-truth.test.mjs`<br>`payment-truth-double-count.test.mjs` |
| `MONEY-02` | One provider event is one revenue row | `src/payment-renewal-truth.mjs` | `payment-truth-double-count.test.mjs` |
| `MONEY-03` | Refunds reduce net revenue | `src/payment-renewal-truth.mjs` | `payment-truth-reversal.test.mjs` |
| `MONEY-04` | An unwitnessed reversal is not applied | `src/payment-renewal-truth.mjs` | `payment-truth-reversal.test.mjs` |
| `MONEY-05` | A lead flagged paid is not payment proof | `src/payment-renewal-truth.mjs` | `payment-renewal-truth.test.mjs`<br>`payment-recovery-war.test.mjs` |
| `MONEY-06` | Payment witnesses must agree on amount and currency, not only identity | `src/payment-renewal-truth.mjs` | `payment-witness-integrity-mutation.test.mjs` |
| `MONEY-07` | Reversal witnesses must agree on content too | `src/payment-renewal-truth.mjs` | `payment-truth-reversal.test.mjs` |
| `MONEY-08` | Cents from different currencies are not a total | `src/payment-renewal-truth.mjs` | `payment-currency-truth.test.mjs` |
| `MONEY-09` | The clearing receipt witnesses the money, not only the identity | `src/payment-renewal-truth.mjs` | `payment-currency-truth.test.mjs` |
| `MONEY-14` | Each currency is totalled from its own rows only | `src/payment-renewal-truth.mjs` | `payment-currency-truth.test.mjs` |
| `MONEY-15` | A refund reduces its own currency and no other | `src/payment-renewal-truth.mjs` | `payment-currency-truth.test.mjs` |
| `MONEY-10` | A failed lead lookup may not widen the scope to every lead | `src/payment-renewal-truth.mjs` | `payment-truth-lead-scope.test.mjs` |
| `MONEY-11` | A lead nobody can find is unknown, not zero | `src/payment-renewal-truth.mjs` | `payment-truth-lead-scope.test.mjs` |
| `MONEY-12` | The clearing receipt records the money it classified | `src/revenue.mjs` | `payment-receipt-witnesses-money.test.mjs` |
| `MONEY-13` | The clearing receipt records the currency it classified | `src/revenue.mjs` | `payment-receipt-witnesses-money.test.mjs` |
| `PRIV-02` | The outreach normalizer does not retain the provider object | `src/outreach-provider-events.mjs` | `outreach-provider-events.test.mjs` |
| `PRIV-03` | A legacy raw field cannot re-enter the reply body | `src/outreach-provider-events.mjs` | `outreach-provider-events.test.mjs` |
| `PRIV-01` | The decoded provider payload is not durable business state | `src/revenue.mjs` | `provider-payload-minimization.test.mjs`<br>`provider-payload-minimization-source-guard.test.mjs` |
| `RECOV-01` | Recovery may not overwrite a newer reservation status | `src/reservation-recovery.mjs` | `reservation-recovery-race.test.mjs` |
| `ACCEPT-01` | Only external customer evidence accepts a delivery | `src/service-fulfillment.mjs` | `service-fulfillment.test.mjs`<br>`superseded-fulfillment-invariants.test.mjs` |
| `ACCEPT-02` | Support cannot end before its window elapses | `src/service-fulfillment.mjs` | `service-fulfillment.test.mjs`<br>`recovery-war-boundaries.test.mjs` |
| `ACCEPT-03` | A renewal cannot be due before its date | `src/service-fulfillment.mjs` | `service-fulfillment.test.mjs` |
| `TIME-01` | Contractual time cannot be fast-forwarded | `src/service-fulfillment.mjs` | `fulfillment-forward-time.test.mjs` |
| `TIME-02` | Event time cannot move backward | `src/service-fulfillment.mjs` | `service-fulfillment.test.mjs` |
| `EVID-01` | An unknown evidence class is refused, not downgraded | `src/market-signal.mjs` | `market-signal.test.mjs` |
| `EVID-02` | Evidence class is clamped to what the source can support | `src/prospect-evidence-reconciliation.mjs` | `evidence-class-laundering.test.mjs` |
| `AGENT-01` | A child inherits every parent constraint | `src/agent-autonomy-loop.mjs` | `autonomy-constraint-monotonicity-property.test.mjs` |
| `AGENT-02` | A zero-effect claim must be complete | `src/cloud-agent-relay.mjs` | `effect-state-vocabulary.test.mjs`<br>`worker-result-terminal-truth.test.mjs` |
| `AGENT-03` | Unknown effects are not zero effects | `src/effect-ledgers.mjs` | `effect-state-vocabulary.test.mjs` |
| `AGENT-04` | Changed artifacts with no tests run is not DONE | `src/agent-worker-result-truth.mjs` | `worker-result-terminal-truth.test.mjs` |
| `AGENT-05` | A terminal claim needs a supported truth table | `src/agent-worker-result-truth.mjs` | `worker-result-terminal-truth.test.mjs` |
| `AGENT-06` | The relay client defers to the canonical zero-effect check | `src/chatgpt-relay-client.mjs` | `zero-effect-agreement.test.mjs` |
| `AGENT-07` | The GitHub transport defers to the same check | `src/github-relay.mjs` | `zero-effect-agreement.test.mjs`<br>`github-relay.test.mjs` |
| `SOV-01` | Sovereignty files cannot be edited by the agent path | `src/agent-code-change-contract.mjs` | `sovereignty-self-modification.test.mjs` |
| `SOV-02` | The protection list contains itself | `src/agent-code-change-contract.mjs` | `sovereignty-self-modification.test.mjs` |
| `SOV-03` | The proofs of the guards are inside the boundary too | `src/agent-code-change-contract.mjs` | `sovereignty-proof-closure.test.mjs` |
| `ESC-01` | A resolved condition recurring is a new episode | `src/operator-escalation.mjs` | `operator-escalation-episodes.test.mjs` |
| `ESC-02` | An undeliverable escalation is itself escalated | `src/operator-escalation.mjs` | `operator-escalation-transport.test.mjs` |
| `ESC-03` | A transport that throws is UNKNOWN, not FAILED | `src/operator-escalation-transport.mjs` | `operator-escalation-transport.test.mjs`<br>`recovery-war-boundaries.test.mjs` |
| `ESC-04` | Absence readiness requires escalation deliverability | `src/founder-absence-readiness.mjs` | `founder-absence-deliverability.test.mjs` |
| `SEC-01` | A session cookie is a credential | `src/secret-patterns.mjs` | `secret-cookie-jwt.test.mjs` |
| `SEC-02` | A bare JWT is a credential | `src/secret-patterns.mjs` | `secret-cookie-jwt.test.mjs` |
| `SEC-03` | Today's default GitHub token format is a credential | `src/secret-patterns.mjs` | `secret-format-coverage.test.mjs` |
| `SEC-04` | A credential-named key with a long value is a credential | `src/secret-patterns.mjs` | `secret-format-coverage.test.mjs` |
| `SEC-05` | The blocker is at least as strong as the redactor | `src/secret-patterns.mjs` | `secret-format-coverage.test.mjs` |
| `SEC-06` | A base64-wrapped credential is still a credential | `src/secret-patterns.mjs` | `secret-format-coverage.test.mjs` |
| `REACH-01` | A gate must be registered, not invented | `tests/reachability-ratchet.test.mjs` | `reachability-ratchet.test.mjs` |
| `SCAN-01` | A truncated read is never a successful read | `src/durable-audit-scan.mjs` | `durable-audit-scan-ceiling.test.mjs` |
| `ROUTE-01` | Routing groups by target agent and cannot starve a queue | `src/agent-model-routing-config.mjs` | `agent-mesh-routing-starvation.test.mjs` |
| `STORE-02` | The JSON store refuses what PostgreSQL refuses | `src/store.mjs` | `store-lookup-allowlist.test.mjs` |
| `STORE-01` | Collection and column lookups are real allowlists | `src/store.mjs` | `store-lookup-allowlist.test.mjs` |

---

## Why these guards and not others

The inventory covers the invariants whose failure would let this system do
something it must not: reach a person without current authority, claim money it
does not have, call a delivery accepted without the customer, treat unknown as
zero, widen its own authority, or go quiet about a problem the owner needs to
know. Everything else in the repository is ordinary code, and a mutation score
over ordinary code measures test volume rather than safety.

## What this does not prove

It proves each named guard is load-bearing. It does not prove the inventory is
complete — a guard nobody thought to list is a guard nobody mutated. The
inventory grows when a new guard is added, and `SOV-02` exists specifically
because the protection list is the kind of thing that can be quietly emptied.
