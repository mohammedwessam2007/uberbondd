# Work packet CP-01: Verified Website Inquiry Audit

| Field | Value |
|---|---|
| Packet | CP-01, 2026-10-22 |
| Mission | UBERBOND MACHIAVELLI: Commercialization Command (founder PDF, 2026-10-22) |
| Base | `main` at `3a7a0b7a5ece796e617c0c363118d4b1618bf9c1` (merge of PR #1533) |
| Branch | `feat/commercialization-verified-inquiry-audit-20261022` |
| Implementation worker | Chat on Steroids |
| Architect and final reviewer | Claude Code |
| Not in scope | GPT Work's payout onboarding, provider research and invoicing (PR #1535) |

Read `AGENTS.md`, `docs/MACHIAVELLI_WEALTH_ENGINE.md` and this packet before you change anything. This packet is the whole brief. If something here conflicts with current `main`, stop and report it. Do not guess.

## 1. What already exists (reuse it, do not rebuild it)

| Concern | Module | State |
|---|---|---|
| Finding discovery | `src/inquiry-path-probe.mjs`, `src/inquiry-path-coherence.mjs` | Read-only. Checks robots.txt first, requires a public address for every hop, caps bodies at 2 MB and redirects at 5. |
| Browser witness | `src/inquiry-path-runtime-witness.mjs` | Playwright. Re-reads `tel:` links after page scripts run. Blocks service workers and WebSockets. |
| Sellable findings and re-verification | `src/inquiry-findings.mjs`, `src/self-verifying-findings.mjs` | A finding is sold only if an independent sale-time probe reproduces it. |
| Charge reservations (new, this branch) | `src/charge-reservations.mjs` | Process store and PostgreSQL store, each declaring its guarantee. |
| Apify billing adapter (new, this branch) | `src/apify-ppe-billing.mjs` | Maps apify 3.7.2 pay-per-event behaviour onto the sale's charge contract. |
| Apify Actor | `actors/verified-inquiry-defects/` | `main.mjs`, `Dockerfile`, `.actor/`, `README.md` |
| Money truth | `src/revenue-reality-ledger.mjs` | Five tiers, hash-chained, never summed across tiers. |
| Rehearsal | `scripts/verified-defects-rehearsal.mjs` | Recording ledger only; no payment provider. |
| Offer and outreach | `00_OUTREACH_NOW.md`, `docs/OFFER_QUARTET_OCT_2026_10_OF_10.md`, PR #1535 | Agency Revenue Leak Proof Pack; PR #1535 adds a $99 one-site pilot and three outreach drafts (not sent). |

## 2. Reproduced defects and their status

Claude repaired these on this branch because they are payment-critical. **Do not reopen these designs without a written dispute to Claude.**

| ID | Defect | Reproduced | Repair | Evidence |
|---|---|---|---|---|
| A | Two concurrent runs starting from one persisted charged-key snapshot both billed the same buyer, finding and day. | Yes, on main: billed 2× | Each charge first takes an atomic reservation (`INSERT … ON CONFLICT DO NOTHING` on a primary key). Charging is refused unless the store declares `ATOMIC_CROSS_RUN`. The Actor stops before probing when pay-per-event has no reservation database. | 12 concurrent runs → exactly 1 charge on PostgreSQL 16. A non-atomic mutation billed 6×. |
| B | When the charge was refused, the dataset item still carried a `chargeEvent` id while the receipt said zero charges. | Yes, on main | The item carries only the billing state known at delivery (`PENDING_PROVIDER_CONFIRMATION` or `NOT_CHARGED`). Final states (`CONFIRMED`, `REFUSED`, `UNKNOWN`) live only in `SALE_RECEIPT`. | Regression test |
| C | A charge callback that threw crashed the sale after delivery and left no receipt. | Found in audit | A throw or unrecognised response is `UNKNOWN`: the reservation is kept, never retried, and charging stops for the rest of the run. | Tests |
| D | `Actor.charge` returns `chargedCount = 1` without billing anything when the event is not in the run's pricing (apify 3.7.2 source). The Actor counted that as billed. | Read in SDK source | The configured `verified-finding` price is read from `getPricingInfo()`. An unpriced or fractional-cent event makes the Actor fail before probing. The receipt uses the real price, not the nominal `1`. | Tests with an SDK-faithful fake |
| E | With less than one event's budget left, the SDK bills one event over the limit on purpose so the platform kills the run. Because the Actor delivers before it charges, the buyer would receive the item and be billed over their limit. | Read in SDK source | `canCharge()` checks the remaining budget before each chargeable delivery. | Test |
| F | The synthetic `apify-default-dataset-item` event, if priced, bills the user for every dataset row, including findings delivered free. | Apify docs, read 2026-10-22 | A priced dataset-item event makes the Actor fail before probing. | Test |
| G | `npm install apify@3` in the Dockerfile was unpinned. | Read | Pinned to `apify@3.7.2`, the version whose source was audited. | Dockerfile |

Receipts:

- `artifacts/commercialization/billing-defects-reproduced-before-fix-2026-10-22.txt`
- `artifacts/commercialization/billing-repair-test-receipt-2026-10-22.txt`

## 3. Work items for Chat on Steroids

Do the items in this order. Each item lists its own acceptance criteria.

### W1. Reproducible Actor package

- Create `actors/verified-inquiry-defects/package.json` and a lockfile. Pin exact versions: `apify@3.7.2`, `pg`, and the `playwright` version that matches the base image `apify/actor-node-playwright-chrome:22`. Today the Dockerfile installs every root dependency of the whole repository.
- Copy into the image only the `src/` modules the Actor imports. Generate that list by following the imports from `main.mjs`, not by hand.
- Build the image locally with `docker build -f actors/verified-inquiry-defects/Dockerfile .` if Docker is available. Validate `.actor/actor.json` and `input_schema.json` with the Apify CLI (`apify validate-schema` or the current equivalent).
- Acceptance:
  - two clean builds produce the same `npm ls --all` output;
  - the image runs `node main.mjs` against a local `apify run` with `isPayPerEvent=false` and writes a `SALE_RECEIPT`;
  - no unpinned version range remains in the Actor package.

### W2. Runtime budgets (slow, hostile and deceptive sites)

- Add a per-site wall-clock budget (proposed 90 s) and a per-run budget, both enforced with `AbortSignal`, including inside the Playwright witness.
- A site that exceeds its budget becomes `UNOBSERVABLE`. Never charge it.
- Add `maxSites` to the input schema, with an enforced default.
- In the witness, refuse non-`http(s)` request schemes other than `data:` and `blob:` (today `route.continue()` lets every other scheme through).
- Record for every site: wall-clock ms, pages fetched, witness used (yes/no) and peak RSS. W5 needs these numbers.
- Tests:
  - a fake site that never finishes its response body;
  - a redirect loop;
  - a page whose script rewrites the `tel:` link after load;
  - a site whose robots.txt returns 503.
  
  All four must end within budget and with no charge.

### W3. Customer deliverable: the Verified Website Inquiry Audit report

Render a human report (Markdown and HTML) from one run's dataset plus `SALE_RECEIPT`. The report needs all ten properties below; for each, cite the test or sample that proves it.

1. **Simple input:** a list of approved public website URLs and nothing else. State that the customer confirms they are authorised to request checks of those sites.
2. **Limits and runtime:** pages per site, maximum sites, expected minutes per 10 sites (measured in W5), and what is never done (no calls, no form submissions, no logins).
3. **A readable sample report**, built from public sites in W6.
4. **Evidence per finding** with the observation timestamp, the page URL and the exact excerpt (for example ``<a href="tel:5123050070">(512) 305-1070</a>``).
5. **Reproduction and disproof steps** per finding, doable by a non-technical person in 30 seconds without trusting the tool.
6. **No lost-revenue claims.** Assert observations only; mark commercial impact as `UNKNOWN`. The coherence engine's `ASK_DONT_ASSERT` items appear only as questions.
7. **Price and accepted-delivery definition**, in the report footer (see §5).
8. **Correct duplicate, retry and charge handling:** the report shows `billing.status` truthfully and never claims payment.
9. **Support and refund process** (see §5).
10. **Three separate sections:** reported defects, accepted delivery, cleared funds. The report shows only the first; it states that the other two are recorded elsewhere and are not implied.

Also show clean sites and unobservable sites. An empty result is a result.

### W4. Port the open money-integrity repairs from PR #1532

Five of PR #1532's integrity tests still fail on `main` (checked 2026-10-22 by running its test file against main's modules):

1. Cleared and collected tiers need an independent trusted verifier. Today a digest computed from a locally built object is accepted.
2. Summaries mixing USD and EGP must not add minor units across currencies.
3. A blocked activity must not be laundered through a plausible payout rail. Today `classifyRail('crypto trading revenue via PayPal')` returns `RAIL_PLAUSIBLE`.
4. The allocator must rank risk-adjusted profit per founder hour. Today it picks $200 for 20 hours over $50 for 1 hour.
5. The paper chain must expose `forwardChronologyProven: false` for a locally regenerated chain.

Port the smallest change that makes each of those tests pass on top of current `main`, together with the tests themselves. Do not merge the stale branch. Keep every current main test green. Claude reviews this item line by line, because it guards financial evidence.

### W5. Economics measurement

Model to use (Apify pay-per-event docs, read 2026-10-22):

`contribution = 0.80 × paid-event revenue − attributable platform costs − other variable costs`

- Only revenue and costs from users on paid plans count.
- 1 compute unit (CU) = 1 GB-hour, priced at $0.20 on Free/Starter, $0.16 on Scale and $0.13 on Business. Which rate is deducted from a developer's pay-per-event revenue is not stated: model $0.20 as the pessimistic bound.
- A "Pay per event + usage" option passes compute to the user. It takes 14 days to enable. Model it as an alternative.
- The synthetic `apify-actor-start` event defaults to $0.00005.

Measure, with controlled local runs and the W2 instrumentation:

- CU per site, split into clean sites, sites with a finding and unreachable sites, with the witness on and off. Run at 2 GB and at 4 GB memory.
- Run startup overhead.
- Finding prevalence on a frozen list of at least 40 public home-service websites. Choose the list before running, write down how it was chosen, and do not choose sites known to be broken.

Model the margin three ways:

- per paid event;
- per website, including clean sites that cost compute and earn nothing;
- per customer, for two channels:
  - (a) the direct fixed-price pilot from PR #1535: $99, paid by PayPal at 4.40% + $0.30 under PayPal's published Egypt schedule, plus founder minutes for review, delivery and support;
  - (b) the Store pay-per-event listing at candidate prices.

Rules:

- Write the pessimistic, median and optimistic cases. Keep the tournament's negative median for generic defect claims (`artifacts/machiavelli/profit-tournament.json`, rank 2: −40 / −20 / 250 USD per month) next to the new numbers. Never delete or overwrite it.
- Select the smallest pricing experiment consistent with the measured costs. Every price stays a hypothesis until a buyer accepts it.
- If both channels fail, say so and name the next existing candidate from the tournament. Do not force a launch.
- Output: `artifacts/commercialization/unit-economics-2026-10.json` plus a short `docs/commercialization/UNIT_ECONOMICS.md`.

### W6. Independent quality evaluation

Target: 20 genuinely supported findings, or a documented shortfall.

- **Circularity is forbidden.** The sale-time re-probe uses the same engine, so it does not count as independent. For each asserted finding, verify it by:
  1. reading the raw HTML separately (`curl` plus an independent parser such as `cheerio`, not `extractInquirySurface`), and
  2. a person reading the live page in an ordinary browser, recording the date and time.
- Required fixtures, exercised for real:
  - call-tracking numbers: the CallRail or Invoca swap must become a question, not a defect;
  - legitimate redirects;
  - `tel:` links modified by JavaScript;
  - unavailable websites: DNS failure, a 5xx, a timeout.
- Measure:
  - precision of asserted defects;
  - false-positive rate;
  - reproduction success by a third party following the written steps;
  - website access failures;
  - cost per scanned website and cost per valid finding, both from W5;
  - latency;
  - abstentions, with a reason for each;
  - buyer-visible clarity: one person who did not build the tool reproduces three findings from the report alone.
- Output: `artifacts/commercialization/quality-eval-2026-10.json` and the sample report from W3.

### W7. Store-readiness package

Prepare the following. Publish nothing.

- Listing copy derived from the Actor README.
- A pricing configuration spec:
  - `verified-finding` at the price W5 selects;
  - `apify-default-dataset-item` removed or priced at $0;
  - a decision on `apify-actor-start`;
  - one paragraph on "Pay per event + usage".
- A sample input and a sample run.
- Release instructions.
- The reservation-database setup procedure:
  - set `CHARGE_RESERVATION_DATABASE_URL` as a secret Actor environment variable;
  - the table is created by `ensureSchema()`;
  - the store holds no personal data — only a hashed buyer/finding/day key and the run id;
  - reconcile `unresolved()` rows weekly against the provider run records.

### W8. Acquisition experiment

Do not create a second experiment. Adopt PR #1535's `UB-FIRST-CASH-20261022-01` (three prospects, one message each, zero follow-ups, nothing sent without founder approval). Add only what it lacks:

- reply and rejection tracking in the existing outreach and suppression systems;
- the financial kill criteria from W5 numbers;
- the W3 sample report as the evidence packet.

Segment question: web agencies, digital marketing agencies, or another evidenced buyer. Answer it from evidence you can cite, such as agency service pages that sell website QA or call tracking. Do not answer from opinion.

## 4. Non-regression requirements

- `node --test tests/verified-defects-billing.test.mjs tests/self-verifying-findings.test.mjs` stays green: 22 tests.
- Run it with `UBERBOND_TEST_POSTGRES_URL` set against a disposable PostgreSQL so the concurrency test runs rather than skips. Report whether it ran.
- `npm run test:deterministic` stays at zero failures, or each failure is shown to fail identically on `main`.
- Never weaken a revenue-proof, billing, robots, SSRF or suppression gate to make a test pass. Never change an existing assertion to a weaker one. If a test must change shape, keep or strengthen what it proves, and say so in the PR body.
- Never put a charge id, "paid" or "charged: true" into a buyer-facing record before provider confirmation.
- Never describe a `CONFIRMED` charge event as collected or cleared money.

## 5. Product terms to put in the report and listing (hypotheses until a buyer accepts)

- **Price.** Direct pilot: $99 for one buyer-nominated site, up to 10 public pages (PR #1535). Store: per verified finding, at the price W5 selects.
- **Accepted delivery.** The buyer explicitly confirms that the agreed report was received and meets the stated scope. Silence is not acceptance. One correction pass for factual errors is included.
- **Support and refunds.**
  - Direct pilot: a finding the buyer disproves using the report's own disproof steps is removed, and its share is refunded or not invoiced.
  - Store: Apify's charges follow its own platform terms; the Actor's promise is limited to what its code enforces (never charge the same finding twice on the same day, never charge an unreproduced finding).
  - The support channel must be named before launch, and it must not be a private address committed to Git.
- **Stages of revenue.** Reported defects, accepted paid delivery and cleared funds are three different records. Use `src/revenue-reality-ledger.mjs` tiers. Nothing above `SIMULATED` exists today.

## 6. External effects

| Permitted without asking | Prohibited without explicit founder authorisation |
|---|---|
| Read-only fetches of public websites through the existing probe (robots-respecting, rate-limited, no form submissions, no calls) | Publishing or changing any Apify listing, Actor or price |
| Local Docker builds and local `apify run` | Creating cloud databases or accounts, or adding secrets, including the reservation database |
| A disposable local PostgreSQL | Any outreach, message, form submission or phone call |
| Pushing to this branch and opening or updating a **draft** PR | Merging to `main`, deploying, or production changes |
| Web reads of official provider documentation | Spending, KYC, payout or tax declarations (founder and GPT Work only) |

## 7. Evidence Claude needs back

- Commit SHAs and the PR link.
- Exact test commands with full pass/fail counts.
- Whether the PostgreSQL test ran or was skipped.
- Docker build logs (or "Docker unavailable").
- `npm ls` for the Actor package.
- The W5 JSON and the W6 JSON.
- The sample report file.
- For every number: whether it was measured, derived or assumed, with its source.
- A list of anything not done, and why.

## 8. Decisions reserved for Claude or the founder

- **Reservation database hosting.** The Store pay-per-event channel cannot charge without it. Proposed: a zero-spend managed PostgreSQL. Creating it needs founder authorisation. The direct $99 pilot does not need it: it runs delivery-only.
- **Final price selection** after W5. Claude reviews; the founder approves.
- **Any change to the billing state model, reservation lifecycle or Apify adapter** goes to Claude as a written design dispute.

## 9. Rejected alternatives (kept so nobody re-proposes them)

- **Apify key-value store with read-modify-write:** not atomic; this is defect A.
- **Request queue `uniqueKey` deduplication as a lock:** atomicity under concurrent adds is not documented. Unverified, so not relied on.
- **"Oldest running run wins" through the runs API:** depends on the listing being consistent, which is undocumented. Not a guarantee.
- **Apify `idempotency-key` on charge:** scoped to one run, so it does not prevent a second run's charge.

## 10. 890 crossover

- The sold mechanism keeps its ancestry: `founder-moonshot-0058` (Error Economy), `0146` (Knowledge Packet), `0306` (Proof-of-Value Primitive), `0513` (verification creates markets) and `0013` (Observability Engine).
- Reservation atomicity itself: NO_MATERIAL_890_CROSSOVER_OBSERVED. It is ordinary transactional engineering.
- All other ideas remain unchanged in the immutable corpus.
