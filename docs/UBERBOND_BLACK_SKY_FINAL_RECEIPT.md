# UBERBOND BLACK SKY — final receipt

Post-closure extermination, privacy minimization, and the bridge to reality.

This mission began after SUMMIT 100 returned an internal-closure verdict. That
verdict was treated as a hypothesis to destroy, not as immunity. It did not
entirely survive.

## Commits

| | |
|---|---|
| Start SHA, as given in the mission | `29ec13146c0b72f64a3fcb1f1ef9d023dc5f11cd` |
| Actual start SHA, verified by fetch | `29ec13146c0b72f64a3fcb1f1ef9d023dc5f11cd` (main had not moved) |
| Final main SHA | `879241f` |
| Commits | 16, of which 6 are merged agent work |

## Issues and pull requests

| Item | Outcome |
|---|---|
| #122 — raw provider/customer payload in durable orders | **Closed.** Reproduced, fixed, mutation-pinned |
| #125 — outreach normalizer retains full raw webhook | **Closed.** Reproduced, fixed, mutation-pinned |
| #121 — canon artifacts lag main | **Closed.** Regenerated, and a freshness guard added |
| PR #124 — payment payload minimization | **Merged.** Its own PRIV-01 registration test failed as submitted; registration added |
| PR #126 — outreach payload minimization | **Merged.** Correct as submitted; carried no mutation, so two were added |
| #73–#80 | Left open. Owner mission-command issues, not defects |

## Defects

Numbering continues from the previous two missions, which reached 25.

**P0 found: 0. P0 fixed: 0.**

**P1 found: 3. P1 fixed: 3.**

**26. The clearing receipt witnessed identity but not money.**

Found while verifying PR #124 rather than by the reported issue.
`payment-renewal-truth` compares amount and currency across three witnesses and
treats an absent field as silence rather than disagreement, so already-persisted
receipts keep reconciling. `logPaymentDecision` is the only producer of
`payment_classification` rows in the system, and it wrote neither field. The
receipt was permanently silent, and the triple witness was a double witness on
money.

The missing one is the only witness written by a different code path at a
different moment — the only one that survives a tamper of the other two. Corrupt
the order and the ledger to agree with each other at 100x:

```
before   net $4,900.00   PROVIDER_CLEARED_PAYMENT_PROVEN   contradictions: []
after    net     $0.00   REVIEW_REQUIRED   provider-payment-witness-amount-mismatch
```

MONEY-09 covered the reader and had been killed by its mutation the entire time.
Mutating a reader cannot find an input that is never written.

**27. The money writer was outside the sovereignty boundary.**

`payments.mjs` decides what "cleared" means and `payment-renewal-truth.mjs`
decides what may be reconciled from it. Both were protected. `revenue.mjs` —
which writes the order row, the revenue row and the classification receipt those
two then read — was not.

A one-step bypass, not a two-step one. The autonomous path could not alter what
clearing means, and could put `raw: payload` back into durable state, or drop
`amountCents` from the receipt and re-blind the third witness. Both are already
mutations in the war (PRIV-01, MONEY-12) precisely because they are the moves
worth making.

**28. An evidence reference did not have to point at anything.**

Every evidence check in `service-fulfillment` was a prefix test and nothing more:

```
qa:        -> QA passed
artifact:  -> delivery recorded
customer:  -> customer accepted, economicTruth.acceptedDelivery = true
```

`customer:   ` worked too. A reference with no referent is the acceptance
equivalent of an unwitnessed revenue row — correct shape, no content — and
acceptance is the single gate between "we delivered" and "the customer agreed we
delivered".

The rule added is that the reference points at something, not that the something
is well chosen. `customer:x` is still accepted, deliberately: a false identifier
is fraud, which no shape check catches; an empty one is a bug, which this one
does.

**P2 found: 3. P2 fixed: 2, recorded: 1.**

- **Base64-wrapped credentials** passed every scanner. Fixed (SEC-06).
- **Multi-currency reporting** refused to total and offered nothing instead.
  Fixed — `economics.byCurrency`, no conversion invented.
- **Store referential integrity diverges.** PostgreSQL carries 12+ foreign keys;
  the JSON store enforces none. **Recorded, not fixed** — the direction is safe
  (production is the strict side, so an orphan surfaces loudly before touching
  money) and replicating the cascade semantics is a subsystem, not a validator.
  Pinned so it cannot be "aligned" by dropping the production constraints.

**P3 found: 1.** A hand-rolled zero-effect ledger in eight modules would silently
omit a ninth canonical key if one were added. Latent, not live; hardened last
mission, re-verified this one.

## Data minimization

Full matrix: `docs/DATA_MINIMIZATION_MATRIX.md`. Every row measured by feeding a
hostile payload through the real code path and inspecting what persisted.

| Surface | Before | After |
|---|---|---|
| Payment provider (`orders`) | 10 of 10 sensitive values retained, 1,973 bytes | **0 of 10, 309 bytes** |
| Outreach provider (normalized event) | 10 of 10 retained, 7,949 bytes | **0 of 10, 597 bytes** |
| Gmail inbound | already correct | **0 of 11**, verified not assumed |

**Raw payload surfaces found: 2. Raw payload surfaces removed: 2.**

A mechanical scan of every `store.add` / `store.log` / `store.upsert` call site
for an object-valued field sourced from an external identifier rather than a
bounding helper returns **zero** — it returned two before this mission.

The payment retention happened *before* classification, so events the system
then rejected as `INVALID_OR_UNSUPPORTED` still kept the customer's address.

The outreach `raw` field's only consumer — `event.raw?.reply_text_snippet` —
was provably dead: `replyBody` already lists `reply_text_snippet` among its own
candidates, so removing `raw` entirely leaves the reply body byte-identical. It
existed only to justify the retention.

Gmail inbound declares `rawBodyPersisted: false`. That is a claim, so it was
tested rather than trusted: 0 of 11 sensitive values reached the event, sender
identity survives as a key-dependent HMAC, and prompt injection in the body
(`authority: FULL`, `status: DELIVERED_VERIFIED`) could not move authority off
`NONE`.

## Secret formats tested

**26 shapes. 26 blocked. 20 benign strings, 0 flagged.**

Fine-grained GitHub PAT · classic GitHub PAT · GitHub OAuth · OpenAI-style ·
Stripe `sk_live_` · Stripe `rk_live_` · Anthropic-style · Bearer · Basic · JWT ·
cookie session · OAuth refresh · AWS access key id · AWS secret under a
lowercase name · database URL · PEM private key · Vercel token · generic
`API_KEY` · lowercase credential name · mixed-case credential name · multiline
assignment · JSON-encoded · nested-object · URL query token · `user:password@`
URL · **base64-wrapped**.

The last was the only miss on first attack. Base64 of a token and base64 of an
image are the same alphabet, so long runs are decoded and the existing patterns
are asked about the result — nothing new is recognized. Precision comes from the
two conditions (printable ASCII, matches an existing pattern), not the alphabet:
base64 of prose, of business JSON, of raw binary bytes, a 64-character hex
string and a long identifier run all stay clean.

## Mutation inventory

**58 mutations. 58 killed. 0 survived.**

Added this mission: `PRIV-01` (raw payment payload), `PRIV-02` (raw outreach
payload), `PRIV-03` (the legacy raw fallback — the more interesting of the two,
because it is what would quietly re-open the hole after the field itself was
removed), `MONEY-12`/`MONEY-13` (receipt records its money), `MONEY-14`/`MONEY-15`
(per-currency totals), `SEC-06` (base64-wrapped credential), `ACCEPT-04`/`-05`/`-06`
(evidence must point at something).

`ACCEPT-04` **survived its first run, correctly.** My refactor had left
`validEvidenceRef` with no callers at all, so the mutation was sabotaging dead
code and nothing could notice. The function was deleted and the mutation
retargeted to a live guard. The gate caught my dead code, which is what it is
for.

`SEC-05` did the same thing last mission for a different reason: the branch it
disabled was reachable only through `DATABASE_URL` / `VERCEL_TOKEN` /
`GITHUB_TOKEN` assignments, and the suite had no such case.

## Clean sweep table (§44)

| Sweep | Persona | Main SHA | New P0 | New P1 | New P2 | Counter |
|---|---|---|---|---|---|---|
| A | distributed systems / DB failure | `3227851` | 0 | 0 | 0 | 1 |
| B | hostile security / privacy | `3227851` | 0 | 0 | 0 | 2 |
| C | skeptical CFO / payments auditor | `3227851` | 0 | 0 | 1 | 3 |
| — | *(defect 27 found in the §21 proof-closure check)* | — | 0 | **1** | 0 | **0** |
| D | state machine / lifecycle auditor | `ca3526d` | 0 | **1** | 0 | **0** |
| E | all 19 archived probes, re-run | `d338504` | 0 | 0 | 0 | 1 |
| F | "unknown is not zero" auditor | `d338504` | 0 | 0 | 0 | 2 |
| G | parity / time / recovery re-attestation | `d338504` | 0 | 0 | 1 | **3** |

**Sweeps E, F and G are the three consecutive clean P0/P1 sweeps.** `src/`,
`scripts/`, `config/` and `migrations/` are byte-identical across all three —
verified by diff, not by memory. The P2 in G is the recorded store divergence.

### On my own fixtures

Sweep D initially reported five findings. **Three were my fixtures**: I read a
failed `compileTaskIntent` (`target-agent-not-allowed`) as authority narrowing,
used an event name that does not exist, and threaded state from the wrong field.
Sweep F reported two; **both were mine** — `catch { return false }` in a URL or
timezone validator is the fail-closed answer to "is this well-formed", and
`classifyEffectLedger` takes a ledger field name and a whole ledger object, not
a canonical key and a scalar. Sweep G reported one; the first reading was mine
(a fixture with no lead behind the leadId), and a real divergence sat underneath
it.

A probe that reports a finding is a hypothesis. Six of the eleven raw findings
across these sweeps were my own errors. Every one was checked against the source
before it was called a defect, and that check is the only reason the other five
are trustworthy.

## Final exact-head gate (§48)

Main `879241f`, after `npm ci`:

| Gate | Result |
|---|---|
| `npm run check:syntax` | **476** files parse |
| `npm run test:deterministic` | **2,319** total, **2,271** pass, **0 fail**, 48 skipped |
| `npm run test:relay-safety` | **150** total, **150** pass, **0 fail**, 0 skipped |
| `npm run test:postgres-real` | **127** total, **127** pass, **0 fail**, **0 skipped** — PostgreSQL 18 |
| `npm run test:mutation-war` | **58** mutations, **58 killed**, **0 survived** |
| `npm audit` | 0 vulnerabilities |

Named suite groups — privacy, secret leakage, payment truth, recovery, outbound
authority, fulfillment, escalation, reachability ratchet, store parity,
sovereignty closure, canon freshness: **192 tests, 192 pass, 0 fail, 0 skipped.**

Reachability: no module classified `NEEDS_TRIAGE`, no unreferenced `src` module.

## Commercial truth (§42)

Measured from an empty store at the final head:

```
VERIFIED CUSTOMERS        : 0
NET CLEARED BY CURRENCY   : {}          (no currency has any)
ACCEPTED DELIVERIES       : 0
RETAINED CUSTOMERS        : 0
REFUNDS                   : 0
DISPUTES                  : 0
status                    : NO_CLEARED_PAYMENT_PROVEN
```

No prospect contacted. No message sent. No call placed. No form submitted. No
advertisement created. No money spent. No DNS or payment-provider setting
changed. No KYC. No production promotion. No customer system mutated.

These zeros are preserved as zeros because they are true.

## Scoreboard (§43)

Proof levels, not percentages. **0** absent · **1** design · **2** implemented ·
**3** deterministic proof · **4** integration proof · **5** real-wire proof ·
**6** live repeated proof · **7** economically proven.

Nothing in this repository can exceed 4. Levels 5 and above require evidence
about the outside world, and nothing inside can witness that.

| Dimension | Level | Note |
|---|---|---|
| Architecture | 4 | No new subsystem added this mission |
| Authority | 4 | Every delegation edge and constraint union attacked |
| Evidence | 4 | Evidence must now point at something |
| **Privacy** | **4** | Two raw surfaces removed; scan returns zero |
| Recovery | 4 | Re-attested on the changed persistence shape |
| Concurrency | 4 | 16 racers, one winner, every loser a ConflictError |
| Mutation assurance | 4 | 58/58, and the gate caught my own dead code |
| Reachability | 4 | No `NEEDS_TRIAGE`, no unreferenced module |
| Agent mesh | 3 | Deterministic fakes only |
| Provider routing | 3 | No real provider has ever been called |
| Prospect intelligence | 2 | No discovery adapter |
| Outbound | 2 | Authority gate proven; no send has occurred |
| Inbound | 3 | Privacy verified; no mailbox granted |
| **Payment truth** | **4** | Three witnesses on identity *and* money |
| Fulfillment | 4 | Full lifecycle, forged acceptance refused |
| Acceptance | 4 | Externally-sourced evidence required, referent required |
| Retention | 1 | No customer, so nothing to retain |
| Escalation | 3 | Episodes correct; no transport configured |
| Self-improvement governance | 4 | Writer, reader and proofs all inside the boundary |
| Live device-off proof | **0** | Nothing has run without a device |
| Commercial proof | **0** | Zero customers, zero revenue |

## Reality gate register

Full register: `docs/REALITY_ACTIVATION_REGISTER.md` — twelve gates, each with
status, missing evidence, owner action, credential, scope, cost ceiling, effect
class, expected proof, rollback, kill condition, owner minutes, and what
UberBond does automatically once it opens.

## Owner actions — three

1. **One provider credential and an authorised spend ceiling** (~5 min).
   Cost ceiling $1.00, enforced by the compute reservation before the call.
   Smallest action, largest unlock.
2. **A sandbox isolation attestation** from the layer that enforces the network
   boundary (~15 min). The only gate that can never be closed from inside, no
   matter how much code is written.
3. **Point a scheduler at `scripts/agent-mesh-tick.mjs`** with a unique
   `AGENT_MESH_OCCURRENCE_KEY` per delivery (~10 min). Starts the clock on the
   30-day gate, which is the longest one and therefore the one worth starting
   first.

Everything after that is commercial: an account, a buyer, a payment, a delivery,
an acceptance, a renewal, and thirty days that have to actually pass.

## Final verdict

### `BLACK_SKY_INTERNAL_EXHAUSTED__REALITY_ACTIVATION_NEXT`

Against §3:

- [x] zero known locally solvable P0
- [x] zero known locally solvable P1
- [x] privacy minimization complete across consequential provider surfaces
- [x] sovereignty guard proof closure intact — and extended to the money writer
- [x] payment truth exact, in both directions and across currencies
- [x] recovery invariants re-attested on the changed persistence shape
- [x] mutation inventory covers every critical new guard
- [x] canonical readiness matches exact head, and a guard now says so
- [x] no unclassified dead code
- [x] no stale internal-closure receipt outranks current repository truth
- [x] three consecutive fresh independent clean P0/P1 sweeps after the final
      source merge
- [x] all remaining meaningful blockers are external reality

**What this verdict does not say.**

It does not say the system is bug free, formally secure, production proven or
revenue ready. It says: internally exhausted under the current test and attack
surface, external proof pending.

Twenty-eight defects have now been found across three missions, in code that was
green each time. SUMMIT 100 returned an internal-closure verdict and this mission
found three more P1s in the same tree — one of them a guard I had added myself
one mission earlier, which was covered by a mutation, killed by that mutation
every single run, and structurally unable to fire on production data because its
input was never written.

That is the sharpest thing in this receipt. A guard can be present, tested,
mutation-covered and green, and still be decorative. The only reason it was
found is that verifying someone else's fix meant reading the other half of the
chain.

A twenty-ninth defect probably exists.

What has changed is not that the tree is proven correct. It is that the guards
are known to be load-bearing, the retained data is named and bounded, the
crash boundaries are enumerated, and all of it is executable rather than
asserted — so the next defect has to get past 58 mutations, a published
minimization matrix and three independent sweeps rather than past an assurance.

**Stop building. Hand the rest to reality.**
