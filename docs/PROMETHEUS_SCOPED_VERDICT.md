# Project Prometheus — Scoped, Honest Response

## Why this isn't the 52-file package

The mission asked for a 52-artifact deliverable package (`UBERBOND_PROJECT_PROMETHEUS_...zip`)
including ≥300 "materially distinct money mechanisms," each classified against an
evidence hierarchy running up to `VERIFIED_FACT`, sourced from dozens of live
adapters into YouTube, TikTok, Instagram, X, Reddit, App Store, patents, funding
databases, and more.

I didn't build that, and I want to be direct about why rather than quietly
producing a smaller thing and calling it done:

- **I have no live adapters into those platforms.** This session's tool access
  is a real git repository, a local MCP bridge, and general research tools —
  not TikTok/Instagram/X APIs, patent databases, or funding trackers. Writing
  "VERIFIED_FACT" or "TIER_4_VERIFIED_TRANSACTIONS" next to 300 rows of
  mechanism data I did not actually go verify would be fabrication wearing the
  mission's own evidence-tier vocabulary as a costume — the exact failure mode
  the mission itself warns against ("no mythology," "never confuse TIER 0
  with TIER 5").
- **The mission's own IMPLEMENTATION RULE contradicts the 52-file ask.** Buried
  under the scale, it says plainly: *"Do not implement 300 business models...
  identify the 5–10 shared capabilities that unlock the maximum number of
  valuable models... MAXIMUM FIVE INITIAL BUILDS. No more."* That's the real,
  actionable instruction, and it's what this wave actually executes.
- **"OMNIA V9"** is referenced throughout the mission as an already-existing
  governance layer. I grep'd the entire repository for `OMNIA` and `V9` (case
  insensitive) — zero matches. It does not exist in this codebase under that
  name. What *does* exist and functions as that governance layer, built and
  tested across this session's prior waves, is: `evaluateDeliverabilityGuard()`
  (outbound admission gate), `classifyPaymentEvent()` (payment truth), and
  `reservation-recovery.mjs` (safe recovery of stuck external actions) — all
  in `src/`. I'm treating that as the real V9, not inventing a new one.

What follows is the honest version: a real audit of what UberBond currently
is, a small number of clearly-labeled candidate directions (not 300 verified
ones), the 5 shared capabilities the mission's own rule asks for, and one of
them actually built, tested, and proven this wave.

---

## Current UberBond Reality

Classification vocabulary per the mission: `VERIFIED_IMPLEMENTED`,
`IMPLEMENTED_NOT_LIVE_PROVEN`, `PARTIAL`, `MOCK`, `RESEARCH_ONLY`,
`HISTORICAL`, `OBSOLETE`, `MISSING`.

| Capability | Status | Evidence |
|---|---|---|
| Website evidence capture (Playwright crawl, screenshots, JSON-LD/robots-meta/perf capture) | VERIFIED_IMPLEMENTED | `src/browser-crawler.mjs`; `tests/browser.test.mjs` (1/1, passes once pointed at this container's pre-installed Chromium — see Test Results) |
| Deterministic audit rule engine (26 checks incl. 2 added this wave) | VERIFIED_IMPLEMENTED | `src/audit-rules.mjs`; `tests/core.test.mjs` |
| Prospect scoring (`scoreProspect`) | VERIFIED_IMPLEMENTED | `src/audit-rules.mjs:113-127` |
| Outbound safety (Deliverability Guard, admission + final recheck, volume/quota unification, reservation recovery) | VERIFIED_IMPLEMENTED | `src/deliverability-guard.mjs`, `src/pipeline.mjs`, `src/reservation-recovery.mjs`; 100+ passing tests across prior waves |
| Payment truth (Lemon Squeezy classifier, refund-as-negative-event accounting) | VERIFIED_IMPLEMENTED | `src/payments.mjs`, `src/revenue.mjs`; `tests/payment-truth.test.mjs` (26/26) |
| Offer compiler + founder command center | VERIFIED_IMPLEMENTED | `src/offer-compiler.mjs`, `src/founder-command-center.mjs` |
| **Opportunity Registry (Business Genome + scoring tournament + promotion ladder)** | **VERIFIED_IMPLEMENTED (new this wave)** | `src/opportunity-registry.mjs`; `tests/opportunity-registry.test.mjs` (32/32) |
| **Agent-readiness / machine-readability findings** | **VERIFIED_IMPLEMENTED (new this wave)** | `src/audit-rules.mjs` (`no-structured-data`, `invalid-structured-data`); `tests/core.test.mjs` |
| Claude Code ↔ UberBond MCP bridge | VERIFIED_IMPLEMENTED | `.mcp.json`, `scripts/uberbond-mcp.mjs`; live-tested this session |
| JsonStore (transactions, idempotency, caps) | VERIFIED_IMPLEMENTED | `src/store.mjs`; large existing suite |
| DurableQueue (leases, retries, stale recovery, dead-letter) | VERIFIED_IMPLEMENTED | `src/queue.mjs` — audited turn 6, 7/10 mission "task universe" properties already present |
| `PostgresStore` class (as opposed to migration SQL) | **IMPLEMENTED_NOT_LIVE_PROVEN** | Code exists (`src/store.mjs:499+`); zero tests exercise it against a live/embedded Postgres — disclosed gap since turn 5, still open |
| Live outbound sending | IMPLEMENTED_NOT_LIVE_PROVEN | Structurally always `dryRun`/disabled by every session boundary; never actually sent |
| Checkout / real payment collection | **MISSING (the actual blocker)** | Checkout URLs empty in current config; founder command center already surfaces this as the #1 owner action |
| AI-enhanced audit issues (LLM-proposed findings) | PARTIAL | `src/ai.mjs`; best-effort, try/catch-wrapped, never the primary path |
| Discovery / prospecting (Overpass-based) | PARTIAL | Config exists (`discovery.*`); unclear how much has actually run against real data |
| GitHub Actions hosted CI | MISSING (blocked) | Workflow triggers, jobs complete in ~3s with no logs — consistent with account billing lock, not this repo's code |
| Vercel deployment (repo root) | MISSING (misconfigured target) | Diagnosed turn 6: no root `vercel.json`, Docker-oriented deploy configs instead; `lite/` has its own working Vercel project |
| Everything in Acts I–C of this mission (300-mechanism atlas, 26 planetary-radar adapters, agent factory, capital allocator, company factory, etc.) | **RESEARCH_ONLY / MISSING** | None of it exists in this codebase in any form before this wave |
| "OMNIA V9" as a named module | **HISTORICAL / does not exist** | Confirmed via repo-wide grep; the real equivalent is the Guard/payment-truth/recovery trio above |

---

## A small, honestly-tiered opportunity scan (not 300)

Claim classifications used below follow the mission's own vocabulary. Nothing
here is tagged `VERIFIED_FACT` unless it's a fact about *this repository*,
because no live external research was performed this wave.

| Candidate | Category | Claim tier | Note |
|---|---|---|---|
| Agent-readiness / machine-readability audit (built this wave) | Agentic commerce (Civ. 30–31) | `VERIFIED_FACT` re: current implementation; `INFERENCE` re: future demand | JSON-LD is a real, general web-standard mechanism (schema.org); "AI agents increasingly rely on structured data for discovery" is my trained-knowledge inference, not a live-verified market study |
| White-label audit backend for local-marketing agencies | White-label (Civ. 06) | `HYPOTHESIS` | Reuses 100% of the existing audit pipeline (`incrementalBuildDistance` = 0 for the core engine); no partner outreach or evidence exists yet |
| Free machine-readability checker as a lead magnet (Free Tool Factory, Act XXIV) | Free-to-paid loop | `HYPOTHESIS` | Natural extension: expose the two new checks as a standalone free tool; would need a public route, not built this wave |
| Recurring monitoring subscription growth | Subscription (Civ. 25) | `HYPOTHESIS` | Already fully coded (`monitoringPrice`, `monitoringIntervalDays`); zero real subscribers exist to validate retention |
| Faceless niche media / content engine | Faceless media (Civ. 12) | `HYPOTHESIS`, scored low | Illustrative candidate scored below — high founder burden, fragile to AI-driven content abundance, no data moat |

Illustrative run of the new scoring engine on three of the above (real code
output, `date: 2026-08-17`, weights default):

```
agent-readiness-audit:              composite=70  confidence=0.67  sufficiency=STRONG
lookalike-white-label-agency-backend: composite=69  confidence=0.00  sufficiency=WEAK
faceless-media-vertical:            composite=33  confidence=0.00  sufficiency=WEAK
```

This is the mechanism working correctly, not a market verdict: the two
`HYPOTHESIS`-only candidates get real composite scores but **zero confidence**,
because the engine refuses to let untagged/weak-evidence claims buy
confidence — exactly the anti-fabrication behavior the mission's own Economic
Truth Engine section asks for.

---

## Top 5 shared capabilities (the mission's own IMPLEMENTATION RULE)

1. **Opportunity Graph / Business Genome / Scoring Tournament / Promotion
   Ladder** — `DONE this wave`. `src/opportunity-registry.mjs`.
2. **Machine-readability / agent-acceptance evidence layer** — `STARTED this
   wave` (2 of many possible checks: JSON-LD presence + validity). Natural
   next checks: `robots.txt` disallow-all detection, sitemap presence,
   `Product`/`Offer` schema depth — all reuse the same integration point.
3. **Commercial memory query layer** — the raw data already exists
   (`store.log()` / `auditLog`), but there's no summarizing/querying
   capability over it yet beyond the founder command center's narrow slices.
4. **Distribution allocator** — genuinely `MISSING`. Structurally blocked:
   every prior wave's boundaries keep outbound disabled by design, and I am
   not lifting that unilaterally. This capability cannot be honestly built
   without an owner decision to enable a real, permitted distribution
   channel first.
5. **`PostgresStore` live-proof harness** — the disclosed reliability gap
   from turn 5, still open. Legitimate next infrastructure wave.

## Things to kill / not build right now

- Any of the ~26 planetary-radar platform adapters (YouTube/TikTok/Instagram/
  X/etc.) — no compliant access path exists in this session; scraping social
  platforms for "signal radar" risks violating their terms.
- Agent Factory / autonomous agent workforce — no proven revenue yet to
  justify the operational complexity.
- Autonomous Capital Allocator with real spending authority — forbidden by
  every session boundary; a governed decision *scaffold* could exist someday,
  actual capital movement never should without the founder.
- Company Factory (spinning up separate ventures) — the mission's own gate
  requires existing economic evidence for a *different* buyer/brand/economics;
  none exists for anything outside the current wedge.
- The literal 300-mechanism Atlas — see the honesty section above.

---

## Adversarial council (brief, grounded — not padded)

- **The Bootstrapper**: "You built more scoring infrastructure instead of
  configuring the one checkout URL that's blocking the first real dollar."
  Correct, and disclosed as the #1 owner action below.
- **The Assassin**: "Is the Opportunity Registry real leverage or just a
  fancier spreadsheet nobody will use?" Fair challenge — its value is
  conditional on someone actually feeding it real, sourced candidates over
  time. Built it deliberately cheap (pure functions, no new DB table, no
  migration) so the cost of being wrong about this is near zero.
- **The Security Engineer**: New checks read already-captured data
  (`home.jsonLd`), make zero network calls, zero new dependencies. Blast
  radius: none.
- **The CTO**: Confirmed the two new checks needed no new capture code and no
  changes to `pipeline.mjs`/`scoreProspect` — `deterministicAudit` is
  generic over whatever the checks array returns. Cheapest possible
  extension point, as claimed.
- **The Lawyer**: No scraping, no fake reviews, no new data collection beyond
  what the crawler already captures on pages the business itself controls.

## Required final verdict

**`CURRENT_UBERBOND_MODEL_REMAINS_SUPERIOR`**

No evidence gathered this wave overturns the wedge audited in turn 6
(evidence-backed website audits → paid diagnostic → strategy review →
monitoring). This wave adds one small, tested, compounding capability
(Opportunity Registry) and one small, tested, on-wedge product surface
(agent-readiness findings) rather than any evidence a different model
dominates.

---

## Final response (the mission's 28-item list, honestly filled)

1. **Primary business**: Automated, evidence-backed website/digital-opportunity
   audit for SMBs, escalating self-serve to strategy review and monitoring.
2. **Category**: Productized service / vertical micro-SaaS hybrid.
3. **Buyer**: SMB owners in evidence-clear niches (clinics, dental, med-spa,
   professional services) with a weak or confusing web presence.
4. **Product**: Free single finding → $49 full audit → $299 strategy review →
   $99/mo monitoring.
5. **Recurring mechanism**: Monitoring subscription (interval re-audit, score
   trend, change alerts) — coded, unproven (zero real subscribers).
6. **Pricing hypothesis**: Owner-set values in `cfg.revenue` — `ESTIMATE`
   tier, not market-validated; no real transaction has ever cleared.
7. **Primary distribution**: Self-serve public intake (inbound only).
8. **Secondary distribution**: None real yet — `MISSING`, not `UNKNOWN`.
9. **Best partner route**: White-label backend for local-marketing agencies —
   `HYPOTHESIS`, unbuilt, zero build-distance for the core engine.
10. **Strongest data moat**: None yet; the accumulating audit-evidence corpus
    is the only candidate and is currently thin.
11. **Strongest technological moat**: The deterministic, evidence-cited audit
    engine plus the idempotent payment/outbound safety layer — real, tested,
    non-trivial to casually replicate correctly.
12. **Strongest commercial moat**: None proven — zero real customers.
13. **Fastest cash engine**: The existing $49 self-serve audit, *if* checkout
    is configured — it currently is not. This is the actual bottleneck.
14. **Highest-margin engine**: Monitoring subscription (near-zero marginal
    cost once automated).
15. **Most automated engine**: The audit pipeline (crawl → deterministic
    rules → score → report), zero human steps.
16. **Most scalable engine**: Same pipeline, bounded only by crawl
    concurrency/compute cost.
17. **Most resilient 2030 engine**: Agent-readiness/machine-readability
    auditing (built this wave) — structurally grows as AI-agent-mediated
    discovery grows, unlike classic SEO tactics that commoditize.
18. **Top 5 shared capabilities**: see list above.
19. **Maximum five first builds**: (1) Opportunity Registry — done this wave;
    (2) expand machine-readability checks (robots.txt, sitemap, Offer
    schema) — started; (3) commercial-memory query layer; (4) distribution
    allocator — blocked on an owner decision to permit a real channel;
    (5) `PostgresStore` live-proof harness.
20. **Things to kill**: see list above.
21. **First validation experiment**: Configure the real full-audit checkout
    URL (code already handles it end-to-end) and observe whether any
    self-serve visitor completes a real $49 purchase within a defined
    window.
22. **First payment path**: Lemon Squeezy hosted checkout link → webhook →
    `classifyPaymentEvent` → `unlockLead` — fully built and tested, just
    unconfigured.
23. **90-day path**: (a) configure checkout, (b) get the first real payment
    or learn why not, (c) expand machine-readability checks, (d) build the
    `PostgresStore` proof harness, (e) revisit whether real research tooling
    (with actual API/data access) is worth acquiring before attempting any
    literal "Prometheus" market atlas.
24. **1-year path**: contingent entirely on (23)'s outcome — this is a
    genuine `OWNER_REQUIRED` branch point, not something to pre-script.
25. **Exact founder actions**: (1) configure the full-audit / strategy /
    monitoring checkout URLs; (2) decide whether to actually acquire live
    research tooling before any real "Prometheus" atlas is attempted;
    (3) review this wave's diff before it's pushed.
26. **Unresolved external dependencies**: Vercel deployment target
    (dashboard access), GitHub Actions billing lock, `PostgresStore` live
    proof, any real external market research requiring tools this session
    doesn't have.
27. **Completion percentage**: Against the literal 52-file/300-mechanism ask:
    effectively 0% (deliberately, see honesty section). Against the
    mission's own IMPLEMENTATION RULE (identify 5 shared capabilities, ship
    from them): 1 of 5 shipped and tested this wave.
28. **ZIP link**: Not produced. A zip of fabricated "verified" market data
    would be a worse deliverable than no zip — the real artifacts are this
    document plus the tested code in this commit.
