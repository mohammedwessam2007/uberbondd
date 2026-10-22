# Work packet CP-02: Omega review repairs and two zero-effect experiments

**Status:** delegated by durable packet. The UberBond cloud relay is disabled and the Chat on Steroids tunnel stopped polling at 2026-10-22T17:00Z. Nothing in this packet is running until a worker picks it up and leaves a receipt.
**Executor:** Chat on Steroids (preferred); any repository-scoped engineering worker.
**Reviewer:** Claude Code. Merge, publication, outreach and charges are founder-gated and are not part of this packet.

## One-command recovery

```bash
git fetch origin && git checkout feat/commercialization-omega-w1-w8-20261022 && git pull --ff-only \
  && git show origin/claude/machiavelli-omega-orchestration-20261022:docs/commercialization/WORK_PACKET_CP02_OMEGA_REPAIRS_AND_EXPERIMENTS_2026-10-22.md
```

The review that produced this packet is on [PR #1537](https://github.com/mohammedwessam2007/uberbondd/pull/1537#issuecomment-6351503800). The machine record is `artifacts/commercialization/omega-orchestration-2026-10-22.json` on branch `claude/machiavelli-omega-orchestration-20261022`.

## Source identities

| Ref | SHA |
|---|---|
| main | `3a7a0b7a5ece796e617c0c363118d4b1618bf9c1` |
| #1536 head | `250685ca414c392913f263d3bb6182ce74556fe0` |
| #1537 head after Claude's fix | `9bcdf54` (fast-forward on `77b5fed`) |
| orchestration branch | `claude/machiavelli-omega-orchestration-20261022`. It carries R3 `a85f627` (inquiry claim gate) and R4 `826ecb9` (rail registry). |

Fetch before writing. Two agents must not write the same branch at the same time. Never force-push.

## Hard limits for every item

- Read-only public GETs only, within the probe's existing budgets: robots honoured, GET-only and pinned IPs.
- No form submissions, calls, messages, account actions, publication, deployment, spend or merges.
- No raw third-party HTML in Git. Store URL, time and SHA-256 only.
- A financial state is never promoted from a hash, a local JSON file or a callback.
- Each item ends with a receipt: tests run, exact counts, and what did **not** happen.

## P1: integrate R3/R4 and fix the sample (small)

**Why.** Main-based fixes change expectations on #1537.

**Do.**

1. After R3/R4 reach #1537's base, update `tests/commercialization-money-integrity.test.mjs`:
   - `classifyRail('Stripe or PayPal')` must be `RAIL_BLOCKED`, and `.best` is no longer `PAYPAL_EGYPT`.
   - `'Apify Store paid Actor via Paypal'` must be `RAIL_BLOCKED`.
   - Consider adding `to` to the via-rule in `classifyRail`, so that "Apify payouts to PayPal" also blocks.
2. In `docs/commercialization/samples/HISTORICAL_INQUIRY_AUDIT_SAMPLE.{md,html}`:
   - Move the Reliant `975-3085 -> 262-4837` item from "Verified findings" to "Questions requiring human confirmation".
   - Reason to record: the same label also dials the main line `512-222-6029` on the same page, so it is a routing question (re-fetched 2026-10-22T21:19Z).
   - Make "Pages examined" equal the number of cited pages.

**Accept when.**

- Rail tests pass.
- The rendered sample has no unrelated-number item under Verified findings.
- `node --test tests/commercialization-runtime-report.test.mjs` passes.

## P2: browser-witness fidelity (W2-a, W2-b)

**File:** `src/inquiry-path-runtime-witness.mjs`, plus wording in `src/inquiry-path-coherence.mjs`.

**W2-a.**

- Today `route.fulfill` sends only `status` and `contentType`. A 3xx response therefore arrives without `Location`, the page renders blank, and `telLinks: []` silently moves a real finding into `resolvedAtRuntime`.
- Fix: forward a `location` header only after `assertPublicUrl` on the resolved target. Otherwise record the page as `UNOBSERVABLE_REDIRECT` with `telLinks: null`, never `[]`.

**W2-b.**

- Count non-GET and blocked resource requests per page in the witness result.
- When `blockedRequests > 0`, the finding must not say "as a direct visitor would see it". Say "in a phone-sized browser with N requests blocked" instead.

**Hostile tests to add:**

- a 301 to a public URL;
- a 302 to a private IP, which must be blocked and must not dissolve a finding;
- a page whose number swap needs a blocked POST, where the wording must not claim visitor equivalence.

**Accept when:** the new tests are red before the fix and green after, and a mutation that reintroduces blank-page dissolution fails them.

## P3: `isPrivateIp` hardening (W2-c, low)

**File:** `src/security.mjs`.

**Block:**

- IPv4-compatible hex forms (`::7f00:1`);
- NAT64 `64:ff9b::/96`;
- site-local `fec0::/10`;
- multicast `ff00::/8`;
- discard prefix `100::/64`.

Normalise with `net.isIPv6` and expand to 8 groups before prefix checks, instead of `startsWith` on compressed text.

**Accept when:** table-driven tests for each prefix pass and the existing security tests stay green.

## P4: trusted-verifier seam (W4-a, design first)

`verify(x) === true` can never carry a real provider check, because a real check is asynchronous. Any caller can also pass `() => true`.

**Propose (do not ship to production) an attestation recorded at append time:**

- `{ provider, providerEventId, verifiedAt, verifierId }`;
- produced by a sealed adapter;
- stored in the entry, so later summaries re-verify integrity without network calls.

Reuse the canonical `paymentTruth` / witness path (`src/lead-path-sprint-fulfillment.mjs`) and do not create a second payment-truth ledger.

**Deliver:** a design note plus failing tests that describe the contract. No live provider.

## P5: unit-economics correction (W5)

**File:** `docs/commercialization/UNIT_ECONOMICS.md` and `artifacts/commercialization/unit-economics-2026-10.json`.

**Background.** The founder's PayPal is permanently deactivated: see `docs/handoffs/WORK_LAUNCH_TODAY_CURRENT_2026-10-06.md` and the rail registry `PAYPAL_EGYPT.founderAccountState`.

**Change:**

1. Replace the PayPal 4.4% + $0.30 model with the Contra route.
   - Contra fee: UNKNOWN until the account is observed. The third-party report of a $15 flat fee on the free plan is unconfirmed.
   - SWIFT intermediary/receiving fee: $10–30 as an assumption.
2. Change the Apify PayPal payout threshold ($20) to the non-PayPal threshold ($100).
3. Keep all scenarios labelled as scenarios.

## P6: experiment E1, SMB agency-portfolio prevalence (zero effect, highest value)

**Question.** Do agency-built, single-location home-service sites carry *sellable* defects (typo-class phone mismatch, malformed tel link, form to a non-resolving host) often enough to support evidence-first acquisition?

The previous 40-site cohort was dominated by national brands, which is a biased floor.

**Steps:**

1. Collect at least 40 single-location home-service sites from public agency portfolio or case-study pages.
   - Record the agency only from the agency's own public statement.
   - Freeze the list (SHA-256) **before** scanning.
2. Run the delivery-only probe with R3 rules and `maxPagesPerSite` at most 5.
3. Corroborate every assertable item with `scripts/independent-inquiry-html.py`.
4. Mark items for one human reproduction. The worker may not claim it is human-verified.

**Preregistered:**

- Success: at least 2 of 40 sites with a corroborated sellable defect.
- Failure: 0 or 1.
- Prior: UNKNOWN.

**Outputs:** `artifacts/commercialization/e1-smb-portfolio-cohort-<date>.json` and a frozen list file.

- If the experiment succeeds, list the attributed agencies as candidate first-touch recipients. Status: `DRAFT_ONLY`, nobody contacted.
- If it fails, write the kill note for the "we find your leak" framing.

## P7: experiment E2, public-page tracking integrity (second route, zero effect)

**Question.** Can conversion-tracking breaks be observed from public pages on the E1 cohort?

Examples:

- tag absent on contact or booking pages but present elsewhere;
- multiple GA4 IDs;
- a form posting off-domain with no tracking on the thank-you path.

**Build** the smallest per-page lead-stack extension on the existing fingerprints. Add no new crawler.

**Preregistered:**

- Success: at least 4 of 40 sites with an independently corroborated, publicly observable tracking defect.
- Failure: fewer than 4.

**Output:** `artifacts/commercialization/e2-tracking-integrity-<date>.json`.

## Required receipt (all items)

- current source SHA;
- files changed;
- exact test command and counts, including skips;
- mutation evidence where a guard was added;
- external effects (expected: public GETs only, with count);
- what was not done;
- next decision.

Post it as a PR comment on #1537 and update the orchestration JSON's `experiments[*].status` only from the run receipt.

---
_Packet authored by Claude Code (review lane). It is not a running worker._
