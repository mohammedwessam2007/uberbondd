# UberBond Ragnarok Closure — Execution Packet

Status: **ORCHESTRATED, PARTIALLY EXECUTED**
Written: 2026-09-01
Branch: `claude/uberbond-ragnarok-closure-pek0g6`
Base `main` at orchestration time: `4417895367d24614edddcd641247767e041b800a`

## What this file is

This is a **dependency-ordered, self-contained execution packet**. It exists because the
orchestrating session hit a model-credit wall mid-flight and the work had to survive as
repository-native state rather than chat context.

An executing session — any model, cheaper or otherwise — should be able to open this file,
follow it top to bottom, and finish the mission without re-deriving the analysis. Every
contract, defect, file path, test requirement, mutation string, and verification command
below was derived from reading the actual current tree, not from memory.

**Read `AGENTS.md`, `UBERBOND_CANON.md` and `CLAUDE.md` first anyway.** This packet is
subordinate to them. Where this packet and current executable truth disagree, current
executable truth wins and this packet is wrong.

---

## 0. Environment truth the executor must know before anything else

### 0.1 `node_modules` is not present in a fresh container

A fresh session in this environment starts with **zero installed dependencies**. Running
`npm run test:deterministic` before installing produces **133 phantom failures** whose real
cause is `Cannot find package 'pg'` and `Cedar WASM package is not available`. These are not
source defects and must never be reported as such.

```bash
npm ci --no-audit --no-fund     # ~4s, installs 21 packages
ls -d node_modules/pg node_modules/@cedar-policy/cedar-wasm node_modules/playwright
```

Only after that does any gate produce evidence.

### 0.2 Git worktrees share `node_modules` only via symlink

If you create a worktree to inspect another branch, symlink `node_modules` into it or every
suite that touches PostgreSQL/Cedar will fail for infrastructure reasons.

### 0.3 Commands that were blocked by the permission classifier in the orchestrating session

- `git cherry-pick` — blocked. Use `git merge --no-ff <branch>` instead; it preserves the
  same commits and history.
- Do not attempt to work around a denial; re-express the intent with an allowed command.

### 0.4 Vercel access is currently scoped out

`list_deployments` returns **403 Forbidden** and `get_project` returns **404** for both
`prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` (uberbondd) and `prj_ZMfDCuUva2kdMv6HnqGvIE5vihTz`
(uberbondd-lite-private) under team `team_A9LnjIuS5PU0rNetsHMu1N0r`. `list_projects` returns
an empty array. This is a **provider-scope non-evidence** condition, not a deployment
failure. Do not report deployment state from this path. The only currently readable
deployment truth is the GitHub commit-status API on a PR (see §2.4).

---

## 1. Exact state at the time this packet was written

### 1.1 Branch content

`claude/uberbond-ragnarok-closure-pek0g6` = `main` (`4417895`) **plus**:

1. Merge commit `a6ded0f8` — merges `origin/gpt/free-first-outreach-router-20260901`
   (PR #277 head `7d2d7302285c739ca650e4b365e7b35f64281554`, 5 commits, 877 insertions,
   5 files). Contents: `src/free-first-outreach-router.mjs`,
   `artifacts/outreach/free-first-provider-registry-2026-09-01.json`,
   `src/omnia-v9/integrations/providers/postal-effect-adapter.mjs`,
   `tests/free-first-outreach-router.test.mjs`, `tests/postal-effect-adapter.test.mjs`.
2. Canonical-ledger repair in `src/free-first-outreach-router.mjs` (see §2.2).
3. `src/provider-activation-receipt.mjs` — 473 lines, parses clean, **no tests yet**
   (see §4.C).

### 1.2 Verified gate results on this branch (measured, with dependencies installed)

| Gate | Command | Result |
|---|---|---|
| Syntax | `npm run check:syntax` | **669 files parse** |
| Deterministic | `npm run test:deterministic` | 3072 tests, 3015 pass, **5 fail**, 52 skipped |
| Relay safety | `npm run test:relay-safety` | 150/150 |
| Wallbreaker | `npm run test:wallbreaker` | 16/16 |
| Capability Genome | `npm run test:capability-genome` | 84/84 |
| External capabilities | `npm run test:external-capabilities` | 13/13 |
| Event Horizon | `npm run test:event-horizon` | 11/11 |
| Dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Focused free-first + Postal | `node --test tests/free-first-outreach-router.test.mjs tests/postal-effect-adapter.test.mjs` | 15/15 |

Doctors, all green: `npm run brain`, `npm run capabilities:doctor`
(`PROJECT_CAPABILITY_LAYER_READY__HOST_RUNTIMES_MEASURED_SEPARATELY`),
`npm run capabilities:genome:doctor` (`CAPABILITY_GENOME_FOUNDATION_HEALTHY`),
`npm run event-horizon:doctor` (`EVENT_HORIZON_HEALTHY`).

### 1.3 The 5 deterministic failures and what each one is

All five are **canon-drift consequences of the PR #277 merge**, not pre-existing `main`
failures. `main` at `4417895` is green. They are the executor's to close.

| # | Test | File | Cause | Fix |
|---|---|---|---|---|
| 1 | `a copy of the canonical ledger under any other name is still a copy` | `tests/effect-state-vocabulary.test.mjs` | `free-first-outreach-router.mjs` declared its own 8-key `ZERO_EFFECTS` | **DONE** — §2.2 |
| 2 | `every unreachable src module is classified with a reason` | `tests/reachability-ratchet.test.mjs` | 3 new `src` modules have no entry point and no classification | §2.3 |
| 3 | `the reachability split is reported…` | `tests/reachability-ratchet.test.mjs` | canon says 269 src modules; 272 exist | §6 canon regeneration |
| 4 | `the present-tense canon describes the source the tree actually has` | `tests/canon-freshness.test.mjs` | canon names `60f7f6e`, head has moved | §6 |
| 5 | `the figures in the present-tense canon are the figures that are true` | `tests/canon-freshness.test.mjs` | same | §6 |

**Failures 3–5 can only be closed at the very end**, after all source work lands, because
regenerating canon against a head that then changes re-breaks them. Do §2.3 now; do §6 last.

---

## 2. LANE A — PR #277 hostile review (findings and required repairs)

The byte-level review is **complete**. Results below; the executor implements the repairs.

### 2.1 Hygiene: clean

All 5 files: valid UTF-8, zero control bytes, newline-terminated, `git diff --check` clean,
registry JSON parses, no literal secrets in the diff. The 16-provider registry reproduces
the researched 75,100 messages / 30 days exactly, and cold-B2B capacity is **0** across the
whole pool. `businessEffectAuthority: 'NONE'` on every result. `organizationAccountLimit`
must equal 1, so account-farming is structurally refused.

**Verdict: the PR is sound in intent and safe to build on. It is not yet complete.**

### 2.2 DEFECT (repaired) — canonical ledger copied under a local name

`src/free-first-outreach-router.mjs` declared `const ZERO_EFFECTS = Object.freeze({...})`
with the canonical 8-key set. Fifteen byte-identical copies drifted independently once
before; the guard exists precisely for this. **Repaired**: the local const is deleted and
the module now imports `ZERO_EXTERNAL_EFFECTS` from `./effect-ledgers.mjs`. All 8 focused
router tests still pass.

### 2.3 REQUIRED NOW — classify the three new unreachable modules

`config/reachability-classification.json`, `modules` object. Add exactly these three, each
with a `category` from the file's `categories` and a `reason` longer than 20 characters.
`AWAITING_ACTIVATION` **must** name a `gate` that exists in the file's `gates` object
(`NO_OUTBOUND_AUTHORIZATION` is the right one for all three; read its description first and
confirm it still says what this packet claims).

```
src/free-first-outreach-router.mjs
src/omnia-v9/integrations/providers/postal-effect-adapter.mjs
src/provider-activation-receipt.mjs
```

Suggested entries (adjust the prose, never the discipline):

- `free-first-outreach-router.mjs` → `AWAITING_ACTIVATION`, gate `NO_OUTBOUND_AUTHORIZATION`.
  Reason: it selects which zero-cost provider *may* carry a message purpose; reaching it from
  a production entry point before outbound authorization exists would put a routing decision
  in front of a send nobody has approved.
- `postal-effect-adapter.mjs` → `AWAITING_ACTIVATION`, gate `NO_OUTBOUND_AUTHORIZATION`.
  Reason: a real external-effect adapter for a self-hosted mail server, deliberately not
  registered in any dispatcher until outbound SMTP permission, PTR/rDNS, SPF/DKIM/DMARC/TLS
  alignment and seed placement are all proven.
- `provider-activation-receipt.mjs` → `AWAITING_ACTIVATION`, gate `NO_OUTBOUND_AUTHORIZATION`.
  Reason: it converts external account-activation receipts into LIVE routing state; nothing
  may consume it until at least one provider account actually exists.

Verify: `node --test tests/reachability-ratchet.test.mjs` → failure #2 gone (failure #3
persists until §6).

### 2.4 Deployment status on PR #277 head `7d2d7302`

From the GitHub commit-status API (the only readable path, see §0.4):

- `Vercel – uberbondd-lite-private`: **success**, deployment completed.
- `Vercel – uberbondd`: **failure**, `dpl_9aQ3Gnj4aaxZ3KVb4H6QHvvEt6vx`.

The full project has been failing since before this PR (its production deployment was
already `ERROR` at `5cb18b85`). Do not attribute it to #277 without reading the build log.
Record it as an inherited red, and if the build log is unreachable through the available
tools, say exactly that rather than guessing.

### 2.5 Postal adapter defects found (repairs specified in Lane B, §4.B)

These are real and each one is a merge blocker for calling the Postal lane finished:

1. **HTTP 409 is treated as a definite rejection.** `DEFINITE_REJECTION_STATUSES` contains
   409. A conflict does not prove the provider did not accept the message. 409 must be
   `UNCERTAIN`. Keep `400, 401, 403, 404, 422`.
2. **No dispatch timeout.** `fetchImpl` is called with no `AbortSignal`. A hung socket
   blocks the execution forever with no classification.
3. **`reconcile()` throws when `executionId` is absent.** `external-effect-recovery.mjs`
   calls `adapter.reconcile({ businessKey, providerEffectIdentity, expectedTo })` — **no
   `executionId`**. As written, the Postal adapter throws `INVALID_INPUT` and aborts the
   whole recovery batch. The tag is derivable from the Message-ID; make it work from
   `providerEffectIdentity` alone, and treat a supplied-but-disagreeing `executionId` as
   `AMBIGUOUS`.
4. **Reconciliation rows carry no provenance requirement.** Any injected row shaped
   correctly can produce `RECONCILED_ACCEPTED`. Require
   `provenance === 'AUTHENTICATED_POSTAL_WEBHOOK'`; anything else is `AMBIGUOUS`.
5. **`BOUNCED` maps to `RECONCILED_REJECTED`.** A bounce *proves the message was sent*. In
   `external-effect-state-machine.mjs`, `RECONCILED_REJECTED` is terminal and does **not**
   release the business key — which is correct — but the semantics are still wrong: a bounce
   is acceptance-with-negative-delivery, not provider rejection. Map `BOUNCED` to
   `RECONCILED_ACCEPTED` with `detail.negativeDeliveryEvidence: true`.
6. **`recipientCap` is normalized but never enforced.** The registry records it; nothing
   compares an audience to it. (Fixed in Lane C, §4.C.)
7. **LIVE `providerStates` are free-form caller booleans.** Anyone can pass
   `{configured:true, active:true, domainAuthenticated:true, providerHealthy:true}` and get a
   LIVE route. They must be *derived* from validated activation receipts. (Lane C.)

---

## 3. Blocker ledger — classification of everything discovered

`SOFTWARE` = removable here. `EXTERNAL_HUMAN_ATOMIC` = one owner action.
`PROVIDER_ACCEPTANCE` / `CUSTOMER_REALITY` / `ELAPSED_TIME` = not removable by code.

| Blocker | Class | Owner | Removed by |
|---|---|---|---|
| Canonical ledger copy | SOFTWARE | executor | §2.2 **DONE** |
| 3 unclassified modules | SOFTWARE | executor | §2.3 |
| Canon drift (SHA + counts) | SOFTWARE | executor | §6 |
| Postal 409 / timeout / reconcile-arity / provenance / bounce | SOFTWARE | Lane B | §4.B |
| No Postal webhook evidence ledger | SOFTWARE | Lane B | §4.B |
| `recipientCap` unenforced | SOFTWARE | Lane C | §4.C |
| LIVE state not receipt-derived | SOFTWARE | Lane C | §4.C |
| No payment-rail doctor | SOFTWARE | Lane D | §4.D |
| No PAID→COMPLETE sprint machine | SOFTWARE | Lane D | §4.D |
| No first-cash canary packet | SOFTWARE | Lane D | §4.D |
| No founder-absence blocker classifier | SOFTWARE | Lane E | §4.E |
| No domain-purpose plan | SOFTWARE | Lane E | §4.E |
| No AI-gateway executor | SOFTWARE | Lane G | §4.G |
| Zero configured model providers | EXTERNAL_HUMAN_ATOMIC | owner | one API key + 4 pricing-evidence vars |
| Zero payment provider account | EXTERNAL_HUMAN_ATOMIC | owner | Lemon Squeezy store + webhook secret |
| Zero activated email provider accounts | EXTERNAL_HUMAN_ATOMIC | owner | GitHub issue #278 |
| No sending domain DNS configured | EXTERNAL_HUMAN_ATOMIC | owner | SPF/DKIM/DMARC records |
| Vercel API scope 403/404 | PROVIDER_ACCEPTANCE | owner | re-authorize the Vercel connector |
| Branch deletion returns 403 | PROVIDER_ACCEPTANCE | owner | token scope; 76 dead branches stay |
| OmniRoute install denied by host | PROVIDER_ACCEPTANCE | host | not routed around |
| Cold-B2B transport: 0/day proven | PROVIDER_ACCEPTANCE | providers | no free ESP permits it; Postal is the only lawful path and needs §4.B + DNS + reputation |
| 0 customers / $0 / 0 deliveries / 0 retained | CUSTOMER_REALITY | market | a real buyer |
| Founder-absence elapsed proof | ELAPSED_TIME | clock | real unattended days |

---

## 4. Lane briefs

**Rules for every lane.** Node 22 ESM `.mjs`. Tests are `tests/*.test.mjs` using
`node:test` + `node:assert/strict` and are **auto-discovered** by `scripts/run-tests.mjs`
— never edit a suite list. No network I/O in tests: inject `fetch`/resolvers. Never print
or persist env values, only presence booleans. Every returned object carries
`policyVersion`, `businessEffectAuthority: 'NONE'` and a zero effect ledger **imported from
`src/effect-ledgers.mjs`** (never redeclared — see §2.2). Capability never creates
authority.

Lanes B, C, D, E, G touch disjoint files and may run in parallel. **Lane A §2.3 and Lane F
§6 are serial**: §2.3 first, §6 last.

### 4.B — Postal webhook evidence, ledger, reconciliation

**Owns:** `src/omnia-v9/integrations/providers/postal-effect-adapter.mjs` (modify),
`postal-webhook-evidence.mjs`, `postal-webhook-ledger.mjs`, `email-effect-primitives.mjs`
(all new, same directory), `api/webhooks/postal.mjs`,
`migrations/104_postal_webhook_events.sql`, and its own tests.

**Read first, in order:** `external-effect-adapter.mjs` (the 4-method contract and
`ADAPTER_OUTCOMES`), `providers/gmail-effect-adapter.mjs` (the reference adapter — its shape
is the standard), `providers/postal-effect-adapter.mjs`, `tests/postal-effect-adapter.test.mjs`,
`external-effect-recovery.mjs` (**note the `reconcile` call arity — §2.5 item 3**),
`external-effect-state-machine.mjs` (only `ABORTED_BEFORE_DISPATCH` and
`RECONCILED_NOT_SUBMITTED` release a business key), `external-effect-evidence-store.mjs`,
`migrations/011_omnia_v9_external_effect_executions.sql` (append-only trigger style),
`external-effect-dispatcher.mjs`, `src/outreach-provider-events.mjs` (vocabulary; do not
modify), `api/webhooks/billing.mjs` + `src/billing-webhook-boundary.mjs` +
`src/billing-webhook-repository.mjs` + `migrations/102_payment_reconciliation_leases.sql`
(**mirror this route/repository/migration pattern exactly**), `src/store.mjs` (how
`PostgresStore.init` applies `migrations/`), `tests/billing-backlog-postgres-real.test.mjs`
(self-skipping real-PostgreSQL pattern), `src/secret-patterns.mjs`.

**Postal protocol facts to encode.** Send: `POST {baseUrl}/api/v1/send/message`, header
`X-Server-API-Key`, body `{to:[..], from, subject, plain_body, tag, headers:{...}}`. Success
is HTTP 200 with `{status:'success', data:{message_id, messages:{'<recipient>':{id, token}}}}`.
Errors frequently arrive as **HTTP 200 with `status:'error'`** — that is `UNCERTAIN`, never
success. The per-recipient `token` is a secret: never persist, log, or return it.
Webhooks: `{event, timestamp, uuid, payload:{message:{id, token, message_id, to, from,
subject, tag}, status, details, output}}`; events `MessageSent`, `MessageDelayed`,
`MessageDeliveryFailed`, `MessageHeld`, `MessageBounced` (carries `original_message`),
`MessageLinkClicked`, `MessageLoaded`, `DomainDNSError`. Header `X-Postal-Signature` is a
base64 **RSA-SHA256** signature over the exact raw body, verified with the server's DKIM
public key (`node:crypto` `crypto.verify('sha256', body, publicKey, sig)`).

**Adapter repairs:** all seven items in §2.5 that belong to the adapter (1–5). Add a
constructor `timeoutMs` (default 15000) applied via `AbortSignal`; exactly one fetch per
dispatch, no retry loop anywhere. Optional `effectPayload.listUnsubscribe` (HTTPS only, no
credentials, no CR/LF) emits `List-Unsubscribe` and
`List-Unsubscribe-Post: List-Unsubscribe=One-Click`; unknown payload fields still refused
before I/O. Lifecycle mapping from the derived ledger state: `SENT`/`DELIVERED` →
`RECONCILED_ACCEPTED`; `DELIVERY_FAILED` → `RECONCILED_REJECTED`; `BOUNCED` →
`RECONCILED_ACCEPTED` + `negativeDeliveryEvidence:true`; `HELD`/`DELAYED`/unknown →
`UNCERTAIN`. **Never return `NOT_FOUND`** — absence of a webhook is not proof of
non-submission, and `NOT_FOUND` is exactly what releases a business key for a resend.

**`postal-webhook-evidence.mjs`** (pure, no I/O): `verifyPostalWebhookSignature`,
`normalizePostalWebhookEvent` (produces `occurrenceKey` = `postal:${uuid}` or
`postal:${sha256(rawBody)}`, lifecycle, `occurredAt` rejecting >5min future,
`subjectSha256` never the raw subject, `rawBodySha256` never the body, `authenticated`,
`quarantineReason` ∈ {null, UNAUTHENTICATED, UNKNOWN_EVENT_TYPE, MALFORMED},
`executionTagValid` against `/^v9_[a-f0-9]{48}$/`; quarantine rather than throw),
`deriveCurrentPostalState(rows)` (authenticated non-quarantined rows only; latest
`occurredAt` wins with a deterministic lifecycle rank for ties, so an older event arriving
late never rolls state backward; two different `postalMessageId` for one tag →
`contradictory: true`).

**`postal-webhook-ledger.mjs`:** `createMemoryPostalWebhookLedger()` and
`createPostgresPostalWebhookLedger(pool)` with the same interface (`append` idempotent on
`occurrenceKey` → `PERSISTED`/`DUPLICATE`, `findByTag`, `findByMessageId`,
`lookupForReconciliation`), plus `createPostalReconciliationLookup(ledger)` returning at most
**one synthesized row per distinct postal message id** so replays never look like two
messages while two genuinely different ids still surface as `AMBIGUOUS`.

**Route + migration:** `api/webhooks/postal.mjs` mirroring `billing.mjs` — env
`POSTAL_WEBHOOK_PUBLIC_KEY` and `DATABASE_URL` required (503 with reason codes), 1 MiB cap
(413), unauthenticated deliveries **persisted as quarantined rows** and answered 401,
authenticated 200. `migrations/104_postal_webhook_events.sql` in the style of 102, ending
with `INSERT INTO schema_migrations(version) VALUES ('104_postal_webhook_events') ON CONFLICT DO NOTHING;`.

**`email-effect-primitives.mjs`:** extract only what Gmail *and* Postal both need —
`EMAIL_RE`, `validateRecipientAddress`, `validateFromAddress({allowDisplayName})`,
`validateSubjectAndBody`, `validateListUnsubscribeUrl`, `deterministicV9MessageId`,
`executionDigestFromMessageId`, `DEFINITE_REJECTION_HTTP_STATUSES`. Gmail imports them and
its behaviour, error codes and messages must stay byte-equivalent — existing Gmail tests
match on those strings.

**Tests (each must fail if its guard is removed):** authenticated accepted; unauthenticated
quarantined and excluded from reconciliation; wrong key quarantined; token canary absent
from every output; raw body never persisted; replay idempotent; two postal ids → AMBIGUOUS;
wrong tag / recipient / provider id / Message-ID → AMBIGUOUS; out-of-order event does not
regress state; bounce is negative evidence and never NOT_FOUND; timeout then webhook →
RECONCILED_ACCEPTED; timeout with no evidence stays UNCERTAIN; exactly one fetch under
timeout/429/5xx/network error; **409 UNCERTAIN, 422 REJECTED**; reconcile without
`executionId` works; row without provenance → AMBIGUOUS; `listUnsubscribe` accepted for
HTTPS and refused otherwise; route 503/401/200/413/duplicate; self-skipping real-PostgreSQL
replay-safety test.

### 4.C — Provider activation receipts and LIVE routing

**Owns:** `src/provider-activation-receipt.mjs` (**exists, 473 lines, parses, untested**),
`src/free-first-outreach-router.mjs` (modify, backward compatible),
`artifacts/outreach/provider-activation-receipts-2026-09-01.json` (new),
`scripts/free-first-outreach-doctor.mjs` (new), and its tests.

**First action: audit the existing module against this contract**, then write the tests. Its
exports are `PROVIDER_ACTIVATION_RECEIPT_SCHEMA_VERSION`, `ACCOUNT_STATES`,
`COLD_B2B_RULES`, `DOMAIN_VERIFICATION_STATES`, `CREDENTIAL_RUNTIME_STATES`, `HEALTH_STATES`,
`RECEIPT_STATES`, `ACTIVE_ACCOUNT_STATES`, `stricterColdRule`, `scanReceiptForSecrets`,
`validateProviderActivationReceipt`, `isLiveReadyProviderState`,
`deriveProviderStatesFromReceipts`, `summarizeActivationReceipts`.

**Receipt shape** is GitHub issue #278's, verbatim: `providerId`, `accountState`
∈ NOT_STARTED|CREATED|EXISTING|BLOCKED_HUMAN|REJECTED|SKIPPED_LOW_ECONOMIC_FIT,
`freePlanVerified`, `freeQuotaObserved`, `coldB2BRule`, `apiAvailable`, `smtpAvailable`,
`domainVerificationState`, `credentialRuntimeState`, `trialExpiresAt`, `autoChargeRisk`,
`policyObservedAt`, `policyEvidenceUrl`, `blocker`.

**Derivation law.** `configured` only from `CONFIGURED_SECURELY`; `active` only from
CREATED/EXISTING **and** `freePlanVerified`; `domainAuthenticated` only from `VERIFIED`;
`providerHealthy` only from a fresh `HEALTHY` observation. A receipt older than
`maxReceiptAgeDays` (45) is `STALE` → all flags false. Expired trial → all false.
`autoChargeRisk` → refuse. **The effective cold rule is the stricter of registry and
receipt** (`PROHIBITED > UNKNOWN > CONSENT_REQUIRED > ALLOWED`): a receipt can never loosen
the registry. Observed quota may only *lower* the researched quota, never raise it.

**Router changes, backward compatible** (another lane imports `selectFreeRoute` with today's
signature — keep it): accept `activationReceipts` and `audienceSize`; honour
`autoChargeRisk`, `observedQuota`, and the stricter cold rule; enforce `recipientCap` against
`audienceSize` (and require `audienceSize` in LIVE mode for a capped provider); add reason
codes `provider-activation-receipt-stale|-missing|-invalid`; export
`liveUsableCapacity(...)` which must be **0** while every receipt is `NOT_STARTED`.

**Artifact:** one `NOT_STARTED` receipt per registry provider, `coldB2BRule` copied from the
registry, `policyEvidenceUrl` = the provider's first HTTPS evidence ref, `blocker:
'ACCOUNT_ACTIVATION_NOT_STARTED (issue #278)'`. Every row must validate.

**Doctor:** prints `researchCapacity30d` (**must equal 75100**), `liveUsableCapacity30d`
(**0 today**), `coldCapableTransportProven: false`, receipt summary, provider states, ≤3
human blockers each with action/screen/minutes/cost/evidence, commercial-truth zeros.

### 4.D — Payment rail, sprint fulfilment, first-cash packet

**Owns:** `src/payment-rail-doctor.mjs`, `src/lead-path-sprint-fulfillment.mjs`,
`src/first-cash-canary-packet.mjs`, matching `scripts/`, matching tests,
`artifacts/first-cash/first-cash-canary-packet-2026-09-01.json`.

**Ground truth from the tree:** the **only** implemented payment rail is **Lemon Squeezy**
(`src/payments.mjs` `verifyLemonSignature`, `checkoutUrl`, `normalizeLemonEvent`;
`api/webhooks/billing.mjs`; `src/billing-webhook-repository.mjs`). **There is no PayPal code
on `main`** — historical docs mention a sandbox rail that does not exist. Report that as
`PAYPAL_RAIL_NOT_IMPLEMENTED`; do not build a second ledger.

Reconciliation chain, already complete and reachable via job `payment.reconciliation.tick`:
signed webhook → signature admission → durable inbox → planner → claim lease → provider
verification → canonical receipt → `RECONCILED`. Without a configured provider verifier the
worker **claims nothing at all**, deliberately.

**Doctor states** (exactly one): `READY_FOR_SANDBOX`, `SANDBOX_CONFIG_MISSING`,
`SANDBOX_VERIFICATION_FAILED`, `LIVE_KYC_REQUIRED`, `LIVE_CREDENTIAL_MISSING`, `LIVE_READY`.
**`LIVE_READY` must be unreachable from env presence alone** — it requires a durable
verification receipt with a real `providerEventId` observed within 7 days *and* a fresh
owner KYC attestation with evidence refs.

**Sprint machine:** `PAID → INPUT_READY → ANALYSIS_RUNNING → QA_REQUIRED → QA_PASSED →
DELIVERY_READY → DELIVERED → (CUSTOMER_ACCEPTED | CUSTOMER_REJECTED | CUSTOMER_SILENT) →
SUPPORT_WINDOW → COMPLETE`, implemented as a thin layer **composing**
`src/service-fulfillment.mjs` — map onto its existing `FULFILLMENT_STATUSES`, do not fork a
second fulfilment engine. `PAID` requires `EXTERNAL_PAYMENT` evidence; `CUSTOMER_ACCEPTED`
requires `EXTERNAL_CUSTOMER` evidence, so internal QA can never produce acceptance.
`runSyntheticFulfillmentCanary` walks every state and **must** report
`commercialDeliveryCount: 0`; a synthetic event claiming `EXTERNAL_CUSTOMER` is still
refused because origin wins.

**First-cash packet:** one machine-consumable JSON answering all 19 questions of the mission
brief (CAN WE CONTACT / WHO / WHY / WHICH SENDER / WHICH PROVIDER / WHICH POLICY EVIDENCE /
WHICH AUTHORITY / WHAT OFFER / WHAT PRICE / WHAT PAYMENT LINK / HOW RECONCILED / HOW
DELIVERED / HOW ACCEPTED / ON REPLY / ON BOUNCE / ON COMPLAINT / ON UNCERTAIN SEND / AFTER
FIVE CONVERSATIONS), each `{question, answer, status, evidenceClass, reasonCodes, module}`.
Offer: **USD 450 fixed-scope white-label Lead-Path Revenue Leak Evidence Sprint**, buyer =
US or otherwise legally approved agencies serving HVAC/plumbing/electrical. Canary doctrine:
**at most 5 qualified conversations**, then KILL/RETHINK — a sixth may never read
`CONTINUE`. Top-level `canContact` must be a pure function of the gates and **false** today;
prove by test that flipping any single gate leaves it false.

### 4.E — Founder-absence blockers, domain-purpose plan

**Owns:** `src/founder-absence-blocker-doctor.mjs`, `src/domain-purpose-plan.mjs`, matching
`scripts/`, matching tests. **Nothing was written before the credit wall — start clean.**

**Read:** `src/founder-absence-readiness.mjs` (reuse its observation-proof semantics, do not
re-derive them), `src/agent-model-executor-factory.mjs` `describeProviderReadiness`,
`src/config.mjs` (all env names), `src/dns-verification.mjs` (injectable resolver;
GREEN/YELLOW/RED/BLOCKED; **never guesses a DKIM selector**),
`src/sending-domain-registry.mjs`, `src/domain-mailbox-gate.mjs`,
`docs/CURRENT_HANDOFF.json` blockers array.

**Classifier states:** `CODE_READY`, `CREDENTIAL_BLOCKED`, `ACCOUNT_BLOCKED`,
`PAYMENT_BLOCKED`, `DISTRIBUTION_BLOCKED`, `DELIVERABILITY_BLOCKED`,
`ELAPSED_EVIDENCE_PENDING`. Overall = first blocking class in that dependency order.
`CODE_READY` may **never** be reported while any credential/account/payment blocker exists,
and elapsed evidence may never be satisfied without an observation proof whose span and
source commit actually match. `ownerActionQueue` ≤ 3, each with action, screen, minutes,
cost, evidence-of-completion. `softwareGaps` must be **empty** when no removable software
blocker remains — that emptiness is this mission's own exit condition.

**Domain plan:** UberBond owns exactly **uberbond.agency** and **uberbond.cloud**. Refuse any
other root (`domain-not-owned`); invent no domains; purchase nothing. Purposes: APP_PRODUCT,
OUTBOUND, INBOUND_REPLIES, TRACKING, TRANSACTIONAL, TESTING, on separated hosts. Expected
DKIM selectors, SPF includes and tracking CNAME targets come **only** from supplied provider
requirements — without them the record is `BLOCKED_PROVIDER_REQUIREMENTS_UNKNOWN`. States:
`CONFIGURED`, `DNS_PROPAGATING`, `VERIFIED`, `MISCONFIGURED`, `UNKNOWN`. **Generated expected
records must never yield `VERIFIED`** — only observed evidence can, fresh within 24 hours,
with PTR for self-hosted outbound and TLS always. Stale GREEN degrades to `UNKNOWN`.

### 4.G — Vercel AI Gateway executor and hostile failover tests

**Owns:** `src/vercel-ai-gateway-executor.mjs`, `src/agent-model-executor-factory.mjs`
(extend only), `src/model-provider-doctor.mjs`, matching `scripts/`, and
`tests/vercel-ai-gateway-executor.test.mjs`, `tests/model-provider-doctor.test.mjs`,
`tests/agent-model-failover-hostile.test.mjs`. **Nothing was written — start clean.**

**Copy the executor contract exactly** from `src/openai-agent-executor.mjs` and
`src/anthropic-agent-executor.mjs` — same result fields, status vocabulary and failure
classes, because `classifyRouteFailure` in `src/agent-model-failover.mjs` consumes them.

Gateway: `POST https://ai-gateway.vercel.sh/v1/chat/completions`, `Authorization: Bearer
<AI_GATEWAY_API_KEY>`, model string `'<provider>/<model>'`, OpenAI-shaped response. 429 →
quota; 401/403 → credential rejected (**terminal**, never toured across providers); 5xx →
provider failure; timeout/abort/malformed → uncertain, **no retry inside the executor**.

Every provider stays DISABLED without **both** a credential **and** pricing evidence
(`pricingFrom` prefix `AI_GATEWAY`: `_INPUT_USD_PER_MILLION`, `_OUTPUT_USD_PER_MILLION`,
`_PRICING_SOURCE`, `_PRICING_VERIFIED_AT`) — a missing credential is a refusal, not free
compute. Enforce a pre-call cost ceiling. **Never claim `servedModel` equals
`requestedModel` without response evidence**: record `identityVerification:
'OBSERVED'|'UNVERIFIED'`. The key must never appear in any result, error or receipt.

**Owner law to encode:** routing around an exhausted or unavailable provider is
pre-authorized and needs no further approval; quota evasion, account farming, identity
rotation, provider-term violation and concealing which model served are forbidden; when all
configured providers are exhausted return the terminal `ALL_ROUTES_EXHAUSTED` (this
codebase's name for CAPACITY_BLOCKED) and **never loop**.

Hostile suite must cover, against the real `executeWithFailover` with stub executors:
exhausted / rate-limited / outage / malformed / timeout (uncertain is **not** retried on
another provider unless the task declares idempotency — assert both branches) / cost ceiling
/ capability mismatch / all exhausted / 401 terminal / receipt preserves the serving
identity.

---

## 5. Mutation-war registration (serial, integrator only)

`scripts/mutation-war.mjs` is **owned by the integrator alone** — parallel edits corrupt it.
Each lane reports its mutations; the integrator appends them to the `MUTATIONS` array.

Shape: `{ id, guard, file, find, replace, suites: [...] }`. The `find` string must be copied
**verbatim from the final source** and be **unique in the file** — an ambiguous anchor
reports `ANCHOR_AMBIGUOUS` and a missing one `ANCHOR_NOT_FOUND`, neither of which is a
killed mutation. Prefix by lane: `POSTAL-0N`, `FREE-0N`, `CASH-0N`, `ABSENCE-0N`/`DOMAIN-0N`,
`GATEWAY-0N`.

Minimum set this mission requires killed:

- UNKNOWN provider purpose fails closed
- monthly quota cannot be ignored
- a stale activation receipt cannot derive `configured: true`
- a receipt cannot loosen the registry's cold rule
- observed quota cannot raise the researched quota
- an unauthenticated Postal webhook cannot reconcile as accepted
- an uncertain dispatch cannot become rejected or successful by exception type
- zero reconciliation matches cannot authorize a resend
- 409 is not a definite rejection
- a row without provenance cannot reconcile
- synthetic acceptance cannot count as commercial delivery
- `canContact` cannot be true while the cold-B2B route is blocked
- `LIVE_READY` cannot derive from env presence alone
- generated expected DNS records cannot yield `VERIFIED`
- `CODE_READY` cannot be reported while a credential blocker exists

Run: `node scripts/mutation-war.mjs <ID>` for one, `npm run test:mutation-war` for all
(needs `CHROMIUM_PATH` and `OMNIA_V9_TEST_DATABASE_URL`, else those entries honestly report
`SKIPPED_NEEDS_*` rather than passing vacuously). Single mutation ≈ 0.5s.

---

## 6. Canon regeneration — LAST, after all source work lands

Regenerating canon against a head that then moves re-breaks failures 3–5. Do this once, at
the end, and let the regeneration commit be the final commit.

1. `npm run readiness` — regenerates `artifacts/system-readiness.json`. **Never hand-edit
   it.** A manual refresh at `d1a75d04` once collapsed hundreds of lines of capability
   evidence and had to be repaired; the archived byte-for-byte original is at
   `991efdee100616cd6d811a92194d611fa3097a14`. Do not emit a smaller artifact unless
   semantic equivalence of every capability entry is proven.
2. Update `docs/CURRENT_SYSTEM_STATE.md`: the `Reconciled from current head:` SHA, the
   **src module count** (269 → the real number; it was 272 before Lane E/G added theirs),
   the reachability split, and every gate figure in its table — with the numbers actually
   measured, not copied from this packet.
3. Update `docs/CURRENT_HANDOFF.json`: `sourceCommit`, `currentMainShaAtCheckpoint`,
   `activeBranch`, `activeMission`, `completed`, `blockers` (from §3), `nextActions`,
   `currentMeasuredSoftwareTruth` with the exact counts, and the unchanged
   `commercialTruth` zeros.
4. Re-run `npm run test:deterministic` and confirm failures 3–5 are gone and no new failure
   appeared. Then `npm run brain` to confirm the packet reads clean.

`tests/canon-freshness.test.mjs` also rejects a canon SHA that names a commit unreachable
from the current branch — so amending after regeneration breaks it. Regenerate, then commit;
never amend that commit.

---

## 7. Verification protocol before any merge

On the **exact candidate head**, in this order:

```bash
npm ci --no-audit --no-fund
npm run check:syntax
npm run test:deterministic
npm run test:relay-safety
npm run test:wallbreaker
npm run test:capability-genome
npm run test:external-capabilities
npm run test:event-horizon
npm audit --omit=dev
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:browser              # if Chromium present
OMNIA_V9_TEST_DATABASE_URL=... npm run test:postgres-real                 # if a real PostgreSQL is present
CHROMIUM_PATH=... OMNIA_V9_TEST_DATABASE_URL=... npm run test:mutation-war
```

Record **exact counts**, never "all green". A suite that skipped because a runtime was
absent is `SKIPPED`, not `PASS`. A hosted CI job that received no runner and executed zero
steps is `INFRASTRUCTURE_NON_EVIDENCE` — neither a pass nor a source failure. If a test fails,
first check whether `main` already fails it: never blame the branch for an inherited red,
and never merge a change that makes an inherited red worse.

**Merge discipline.** Refresh `main` immediately before merging. Review the exact diff.
Merge with expected-head protection. Refresh again and confirm the merge landed. Never merge
an older clean commit while newer unverified commits sit on the same branch. `git push -u
origin claude/uberbond-ragnarok-closure-pek0g6`, retrying only network errors with 2s/4s/8s/16s
backoff. **Do not open a pull request unless the owner asks for one.**

---

## 8. Authority boundary — non-negotiable

This packet grants **no business-effect authority**. Nothing in it authorizes contacting a
prospect, calling a paid provider, spending money, purchasing a domain or mailbox, changing
DNS or credentials, submitting KYC, moving money, deploying to production, or mutating a
customer system. Test messages may go only to authorized test recipients.

Commercial truth is and remains **0 real customers, $0 cleared revenue, 0 accepted paid
deliveries, 0 retained customers**. No amount of code, test, benchmark, doctor, receipt,
sandbox event or research corpus may move those four numbers. Only an independent external
buyer can.

The reviewed free-provider pool is ≈75,100 transports per 30-day month, which is
**transactional, lifecycle and opt-in capacity** — it is **not** 2,503 cold prospects a day.
Proven free cold-B2B transport across the entire reviewed pool is **0/day**. Unknown is not
allowed; consent-required without consent evidence is not allowed; a research record is not
an activated provider; an activated provider is not a healthy sender; and a healthy sender is
not authority to contact anyone.

---

## 9. Definition of done

The mission is complete when every discovered blocker sits in exactly one of:
`RESOLVED`, `VERIFIED_RESOLVED`, `EXTERNAL_HUMAN_ATOMIC`, `CUSTOMER_REALITY_REQUIRED`,
`ELAPSED_TIME_REQUIRED`, `LEGAL_OR_PHYSICAL_IMPOSSIBILITY` — and **zero** remain as `TODO`,
`FOLLOW_UP`, `IMPLEMENT_LATER`, `NEEDS_RESEARCH`, `UNKNOWN_CODE_GAP`, `UNTESTED`,
`UNDEPLOYED`, `UNWIRED`, `MISSING_DOCTOR`, `MISSING_RECONCILIATION`, `MISSING_RECOVERY`,
`MISSING_RECEIPT`, `MISSING_SCHEMA` or `MISSING_TEST`.

Concretely: §2.3 done; Lanes B, C, D, E, G merged with exact-head evidence; every mutation in
§5 killed; §6 canon regenerated and failures 3–5 closed; `founder-absence-blocker-doctor`
reporting `softwareGaps: []`; and the owner-action queue reduced to at most three atomic
human actions, each with its screen, its minutes, its cost and the evidence that proves it
was done.

Say **PRE-CUSTOMER ENGINEERING COMPLETE** only when no software, wiring, verification,
deployment, reconciliation, recovery, schema, test or executable-canon blocker remains before
the first bounded commercial experiment. Say **ALL REMOVABLE BOTTLENECKS CLOSED** only when
every remaining blocker genuinely requires human identity, provider acceptance, a legal or
customer decision, real payment, real acceptance, elapsed external evidence, or physical
reality.

Until then, report exactly what is true.
