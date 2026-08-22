# Kilimanjaro architecture closure — 2026-08-22

## Verdict

**`INTERNAL_ARCHITECTURE_COMPLETE_EXTERNAL_PROOF_DOMINATES`**

Every internal gap that could be closed safely with the repository, tools and
authority available has been closed and proven by execution. What remains is
not architecture: it is a provider credential, a payment identity, a customer,
and the passage of time. None of those can be engineered.

That verdict is narrower than "Kilimanjaro ready" and deliberately so. The
system has survived zero hours of unattended operation, because the scheduler
has never been run. It cannot honestly claim otherwise, and the readiness
module now refuses to let it.

---

## Commercial truth

| | |
|---|---|
| **Real customers** | **0** |
| **Cleared revenue** | **$0.00** |
| **Accepted deliveries** | **0** |
| **Retained customers** | **0** |

Zero, stated plainly and not buried. No creator claim, pipeline amount, or
model assertion is counted as revenue anywhere in this report.

---

## SHAs and scope

| | |
|---|---|
| Start main SHA | `07d8ce85472365c9fca1b704e8b0ad91244d8f1e` |
| Final branch | `claude/uberbond-kilimanjaro-closure-o43pyu` |
| Commits | 76 (7 merged branches + 7 authored) |
| Files added | 51 |
| Files modified | 17 |
| Files deleted | 0 |
| Net | +10,374 / −280 |

`main` was **not** advanced. See *Why nothing was merged to main* below.

---

## Branches reconciled

| PR / branch | Disposition | Reason |
|---|---|---|
| #91 monotonic constraint inheritance | **MERGED** into branch | Real fix; a worker could drop parent constraints on follow-ups |
| #92 strict worker-result terminal truth | **MERGED + REPAIRED** | Correct idea; **was red on its own head** (see P0 below) |
| #93 schedule occurrence identity | **MERGED** | Clean |
| #94 scheduler fairness | **MERGED** | Clean |
| #95 durable mesh cycle receipts | **MERGED** | Clean |
| #96 founder-absence duration proof | **MERGED + EXTENDED** | Gated only the top rung; the rungs below it were free |
| #97 receipt-derived founder absence | **MERGED** | Clean; the concurrent-duplicate-insert fix is real |
| #90 nervous system | **SUPERSEDED** | Its causal spine was the weaker of two; feeder branches landed instead |
| `gpt/causal-attribution-spine` | **MERGED** | The stronger spine — cycle, time-reversal and identity-conflict detection |
| `gpt/inbound-feedback-reconcile` | **MERGED** | Per-module tests #90 had collapsed into one file |
| #72 AI automation bundle | **MERGED** | Clean; `CREATOR_CLAIM` boundary intact |

---

## Defects found and fixed

### P0 — the autonomy pump could never have completed a task

PR #92 wires the relay's canonical worker-result contract in front of every
terminal transition. That contract's secret scanner exempted
`externalEffectLedger` and `externalEffects` from credential-shaped-key
matching — but not `businessEffectLedger`, which carries a key called
`credentialChanges`. Every canonical worker result was therefore rejected as
secret-bearing, and the receipt told whoever read it to go hunting for a
leaked credential that did not exist.

PR #92 was **red on its own head** — its own tests failed before any merge.
Its description said otherwise.

Fixed by single-sourcing the ledger shapes (three copies under two names) and
narrowing the exemption: a field is waved past only while it *looks* like a
ledger — known keys, numeric values — so a bearer token hidden in
`externalEffectLedger.messages` is now caught, which it previously was not.

### P1 — evidence-class laundering

`PROVIDER_OBSERVED` was a string the caller passed in, so `evidence:
'PROVIDER_OBSERVED'` beside a hand-written message object minted a `DIRECT`
edge in the causal graph: a fabricated reply carrying exactly the weight of one
Gmail delivered. Typing a string is not an observation. The class is now
reachable only with an attestation the reader mints for the specific message it
fetched, keyed to a per-process secret.

### P1 — a credential-bearing connection string reached durable history

`hasSecret` gates what is persisted and did not know what a connection string
looks like, so `postgres://admin:hunter2@db.internal/prod` in a worker result
was stored verbatim. The sandbox verifier's redactor *did* know and stripped
the same string from receipt excerpts — two lists, one shorter, which is the
only outcome two lists ever have.

### P1 — the sandbox did not contain

The first provisioner masked paths under the sandbox root and the host home,
and left the host repository itself visible. A red-team probe read the real
`.env` and wrote a file into the real working tree. Found by attacking it, not
by reviewing it.

### P1 — the gate double-counted its own passes

Test discovery excluded a file from the runner list when another file imported
it, but recognised only a bare `import './a.test.mjs'`. A **named** import was
invisible, so the file was handed to `node --test` *and* loaded by its
importer, and every test in it counted twice. Verified by writing exactly that
and watching one test report as two.

### P1 — a capability checklist could certify a seven-day absence

Eleven booleans set to `VERIFIED_LIVE` reported `MULTI_DAY_REHEARSAL_READY`
with zero durable cycles behind it. #96/#97 gated the top rung on duration and
left the rungs below it free.

### P2 — 42 real-PostgreSQL tests had never been run

Behind an env var, skipping silently. They run now and all 42 pass.

### P2 — a 128-line outbound safety policy nothing imports

`src/omnia-v9/integrations/outreach-consequence-admission.mjs`. Not wired, not
tested, not documented. Recorded and ratcheted rather than deleted — removing a
safety policy is the send path owner's call.

### P1 — four places trusted a claim for being well-formed

Found by attacking this session's own output on the assumption whoever wrote
it was not careful enough. All four are the same defect wearing different
clothes:

| Where | What a bare object bought |
|---|---|
| Inbound evidence class | A `DIRECT` causal edge from a fabricated reply |
| Prospect evidence bundle | `ELIGIBLE_FOR_EXPERIMENT` from a hand-written object |
| Prospect score | A decision driven by a score nothing computed |
| **Commercial receipt** | **A $5,000 economic anchor from a literal** |

The last one is the worst: `safeEconomicProof` verified truth level, outcome
type, a positive integer amount, a three-letter currency and a provider event
id — and every check passed on an object typed by hand. The apparatus that
exists specifically to stop revenue being invented was verifying that the
invention was well-formed. Worse, the fixtures asserting economic truth were
themselves hand-written receipts, which is why it was never caught.

An `outcomeId` is a digest of the policy version and the event id, so it
recomputes: a forger must now produce a receipt the compiler would have
produced, not one that resembles it.

### P1 — the sandbox destroyer was a delete primitive

It required the target's basename to start with `uberbond-sandbox-` and
checked nothing else, so any directory anywhere with that name was
destroyable, including inside the working tree.

### P1 — a source could claim evidence it could not have

`sourceType` and `evidenceClass` were independent strings, so a search-engine
snippet could be filed as `FIRST_PARTY_DECLARED` and inherit both its
confidence ceiling and its right to outrank the company's own team page.

**Totals: 1 P0, 8 P1, 2 P2. All fixed or explicitly recorded.**

A sweep of every other `.ok`-based admission on an economic or authority
boundary found no further instances of the well-formed-equals-trusted defect:
the omnia-v9 reconciler cross-checks durable rows by digest, tenant and
idempotency key, and the relay bundle verifier is content-addressed by blob
SHA.

---

## Proof

| Proof | Result |
|---|---|
| Syntax | 411 files parse |
| Deterministic suite | 1920 tests, 1878 pass, **0 fail**, 42 skipped |
| **Real PostgreSQL gate** | 13 suites, **129 tests, 129 pass, 0 fail, 0 skipped** |
| Relay safety | 150 / 150 |
| `npm audit` | 0 vulnerabilities |
| Crash proof | Full cognitive loop killed and reloaded between all six stages |
| Concurrency proof | Real PostgreSQL, two backends racing, advisory locks, trigger-enforced provenance |
| Soak | 1000-task mesh soak (pre-existing), plus 1000-scenario crash/restart property run against real PostgreSQL |
| Security proof | 17 sandbox escape attempts contained, asserted against host state |
| Sandbox proof | **Real-wire** — Linux user/mount/network namespaces, egress proven blocked by probe |
| Prompt injection | 6 injections recorded as content, granting nothing |
| Hostile worker | 8 attack classes refused |
| Hostile provider | 6 malformed shapes + 5 partial results reach no terminal state |

### A detour worth recording

Ten Postgres suites failed against one shared database, and the failures read
exactly like product races — double-spend, conflicting authorization, duplicate
external effects. They were not. Rows one suite leaves behind are rows the next
trips over, and serial execution made it *worse* because state accumulated
instead of interleaving. Per-suite databases is what isolates them. Partway
through I also chased failures caused by the Postgres server having died under
a stray timeout of my own. Reproduce before believing a failure.

---

## Subsystem state

| Subsystem | Level | Note |
|---|---|---|
| Truth / evidence | 3 | Single-sourced, enforced |
| Queue / durable state | **5** | Real PostgreSQL |
| Relay | 3 | No live round trip |
| Agent mesh | 4 | End-to-end across restarts, fake providers |
| Constraint authority | 3 | Proven across deep chains |
| Result truth | 3 | Thin results cannot terminate |
| Scheduler identity / fairness / receipts | 3 | |
| Founder absence | 3 | **Proven tier: `LOCAL_REHEARSAL`** |
| Sandbox | **5** | Real OS namespaces |
| Compute budget | 3 | One path; second superseded and test-locked |
| Provider integration | 2 | No credential |
| Prospect intelligence / enrichment / verification | 3 | Provider-neutral, no adapter bound |
| Suppression dominance | 3 | Cannot be resurrected by enrichment |
| Inbound / attribution | 3 | Read-only; attestation-bound |
| Payments | 2 | No identity, no KYC |
| Fulfilment / acceptance | 3 | Customer-origin evidence still caller-asserted |
| Distribution / capital allocation | 2 | Nothing to allocate against |
| Self-upgrade | 3 | Sandbox real; no model has run in it |
| Security | 3 | |

Scale: 0 absent · 1 design · 2 implemented · 3 deterministic proof ·
4 integration proof · 5 real-wire · 6 live repeated · 7 economically proven.

**Nothing in this system is above 5. Nothing is at 6 or 7, and nothing pretends to be.**

---

## Why nothing was merged to main

Two reasons, and they agree.

The engineering one: merging #91–#97 as they stand puts a red commit on main.
#92 fails its own tests on its own head, and the repairs live on this branch.

The authority one: this session's operating instructions confine development
and pushes to `claude/uberbond-kilimanjaro-closure-o43pyu`, and merging
somebody's PR is an outward-facing action nobody authorized in this session.

So the integrated, green, hardened tree is on the branch, `main` is untouched
at `07d8ce8`, and the merge is the owner's call. **Do not merge #91–#97
individually — merge this branch, which contains all seven plus the repairs
that make them pass.**

---

## Owner actions — three, one optional

1. **Provider API key + spend cap in cents.** Unlocks the live agent-mesh tier
   and real self-upgrade runs. Software cannot mint an API key.
2. **Payment provider identity + KYC.** Unlocks every economic tier. KYC is a
   legal identity check on a person.
3. **Scheduler activation** *(optional)*. Prepared, not activated — turning on
   a scheduler in a real environment is a deployment decision. Without it the
   founder-absence tier stays `LOCAL_REHEARSAL` forever; with it, it climbs
   unattended with no further owner involvement.

---

## External effect ledger for this session

| Effect | Count |
|---|---|
| Messages sent | 0 |
| Provider calls made | 0 |
| Purchases | 0 |
| Deployments | 0 |
| DNS changes | 0 |
| Credential changes | 0 |
| Production mutations | 0 |
| Business spend | $0.00 |

---

## What is honestly left

**Internal architecture is complete. Reality now owns the remaining gates.**

A real provider canary. A real payment. A real customer. Real multi-day
passage of time. Adding more architecture will not move any of them, and the
right next commit to this repository is a small one made *after* one of those
four things has happened.
