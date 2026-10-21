# Inquiry Path Coherence Engine

Status: **IMPLEMENTED + FIELD-CALIBRATED ON PUBLIC SITES (2026-10-21) / ZERO OUTBOUND / ZERO REVENUE**
Source: `src/inquiry-path-coherence.mjs`, `src/inquiry-path-probe.mjs`, `src/inquiry-path-runtime-witness.mjs`, `scripts/inquiry-path-probe.mjs`, `tests/inquiry-path-coherence.test.mjs`
Field receipt: `artifacts/receipts/inquiry-path-coherence-field-2026-10-21.json`
Directive: Phoenix Omega commercial ignition, phases 4 (truthful prospect evidence) and 6 (deliverable that passes quality tests).

## Why this exists

The V5 outbound genome says the first touch must carry *verified problem evidence* and a *genuinely useful custom artifact*, and must abstain when there is none. On 2026-10-21 the five held agency candidates had `independentClientLeadPathFailureProven: false`, and nothing in the repository could produce that proof. The historical `audit-rules.mjs` judges SEO and design. Those are opinions a buyer can wave away, and none of them shows a lost booked job.

This engine checks something narrower and harder to dismiss: **does the website contradict itself about how a customer reaches the business?**

## What was invented

1. **Self-contradiction surface.** A home-service site publishes its phone number through several channels: header text, the `tel:` target behind each call button, schema.org JSON-LD for search engines and AI agents, and its stated hours. The engine compares the channels against each other. A call button labelled with one number that dials another is a fact, not a judgement call.
2. **Thirty-second disproof.** Every finding carries the exact step the owner can take on their own phone to prove it wrong. If a finding cannot be disproved that way, the engine does not let it be stated as fact. The prospect does not have to trust us.
3. **Two-witness confirmation.** Call-tracking scripts (CallRail and similar) rewrite numbers in the browser, so a mismatch in the HTML alone is only a question. The runtime witness loads the page in a phone-sized headless Chromium, lets the site's scripts run, and reads the buttons again. A mismatch seen by both witnesses is upgraded to `MAY_STATE_AS_OBSERVED_FACT`. One that vanishes at runtime is dropped and recorded in `resolvedAtRuntime`.
4. **Keystroke-typo signature.** Tracking pools issue unrelated numbers. When the label and the dial target differ by one digit, or by two swapped neighbouring digits, the engine treats it as a typo. That conclusion survives the call-tracking caveat.
5. **Observability honesty.** Redirect stubs, bot challenges and empty app shells produce `NOT_OBSERVABLE_FROM_STATIC_HTML`, never a clean result. Zero readable pages is not a clean bill of health.
6. **Machine-facing loss diagnosis.** When a JSON-LD block is valid JSON followed by stray characters, the engine reports exactly what search engines and AI agents discard (business type, phone, address, hours) and gives a one-line repair, for example: delete the stray `}` at line 188.

## Finding classes and first-touch rule

| Class | Meaning | First touch |
|---|---|---|
| CONTRADICTION | two published channels disagree | may be stated only when assertable (confidence at least 0.85, no runtime caveat) |
| MALFORMATION | a channel cannot work as written | same |
| ABSENCE | an expected inquiry affordance is missing | same |
| OBSERVATION | worth confirming; may be intentional | always `ASK_DONT_ASSERT` |

Verdict `NOT_OBSERVABLE_FROM_STATIC_HTML` or `NO_INCOHERENCE_OBSERVED` means no defect-based first touch. That is the V5 `DO_NOT_SEND` abstention for evidence.

## Read-only guarantees (enforced in code, counted in receipts)

GET only. robots.txt is honoured. Same-origin pages only, at most 5. Fixed delay between requests and a 2 MB response cap. No form submission and no clicks. Form-action hosts are DNS-resolved and never requested. The runtime witness routes every request through `assertPublicUrl`. Each receipt has a `readOnlyLedger`, and its `formSubmissions`, `messages` and `spendCents` are zero by construction.

## Field result, 2026-10-21 (public web, read-only)

- **Five held agency candidates:** four had no incoherence on their own sites, and one had an observation only (a heavy form). That is a real result. Their *own* sites are not the leverage point. The Agency Revenue Leak Proof Pack has to run on their **clients'** sites.
- **Clients named publicly by Outwork'em (ubw-agency-001):**
  - Desert State Roofing was coherent on both of its hosts.
  - Comfort One's robots.txt disallows all agents, so it was respected and not inspected.
  - The other two clients had no verifiable live domain.
  - Current evidence therefore supports **no** defect-based first touch to that agency. This is the engine doing its job: it stops a weak email.
- **Eight public home-service sites (calibration only, not prospects):**
  - Two had an assertable defect:
    - a multi-location plumbing company whose call buttons dial numbers other than the ones printed on them. Four distinct pairs were confirmed by both witnesses after CallRail ran, including one with a one-digit difference;
    - a large HVAC/plumbing/electrical company whose entire LocalBusiness JSON-LD block is discarded because of one extra `}`.
  - One had an observation only.
  - Two had no incoherence.
  - Three were not observable: robots disallow, a dead domain, and a redirect stub.
- **Calibration falsified the first engine version five times.** The receipt lists each correction. The most important: Texas contractors must publish licensing-board phone numbers, and v1 counted those as the business's own lines.
- Aggregate ledger: 52 page GETs, 15 robots.txt GETs, 5 DNS lookups, 0 form submissions, 0 messages, $0.

## Anonymized sample deliverable (what a buyer receives per client site)

> **Inquiry Path Coherence Snapshot: Central Texas multi-location plumbing company**
> Observed 2026-10-21 · 5 public pages · read-only
>
> **Result:** At least one verifiable break in the inquiry path was observed.
>
> **1. Contradiction: a call button labelled (512) 30X-1070 dials (512) 30X-0070 (one digit different).**
> A visitor who taps the button reaches a different line than the one printed on it. The two numbers differ by one keystroke, which is the signature of a typing error, not call tracking. Confirmed twice: in the HTML the server sent, and again in a phone-sized browser after the page's own scripts ran.
> **Prove it wrong in 30 seconds:** on a phone, open the home page and tap the location's call button. If the dialer shows the printed number, this finding is wrong.
> Evidence: home, contact, discounts and emergency-plumbing pages, each with page SHA-256.
>
> Limits: server-delivered and runtime HTML only. Not a test call, not proof of lost revenue.

The real, unredacted snapshot for each calibration site lives only in the field receipt. Calibration businesses were not contacted and are not prospects.

## How it plugs into the existing first-cash machine (no new system)

`SELECT (held agency candidate) -> identify 1-3 client sites the agency itself publishes in its case studies -> PROVE (this engine, --runtime) -> keep only MAY_STATE findings -> PRE-WORK (snapshot = the artifact) -> V5 micro-ask "Want me to send it?" -> existing outbound gates (sender readiness, suppression, jurisdiction, owner cohort approval) -> existing payment truth -> Agency Revenue Leak Proof Pack fulfillment (this engine per client site + human QA)`

Example first touch. It is drafted only. **It is not sent and not authorized.** It may be used only for an agency whose case study names the client, after every outbound gate passes:

> Subject: {Client}'s call button
>
> Hi {Agency} team. Your {Client} case study sent me to their site. On a phone, the "{label}" button dials {target}, not the number printed on it (one digit off). I recorded the page and the steps to check it in 30 seconds. Want me to send it?

## 890 crossover

These are mechanism donors at the level of analogy, not claims of realization:

- `founder-moonshot-0054` (THE IDEA IMMUNE SYSTEM): adversarial falsification, applied here as the mandatory thirty-second disproof and the calibration loop that falsified v1.
- `founder-moonshot-0146` (THE KNOWLEDGE PACKET): every finding carries evidence, provenance (page hash), falsifiers and limits.
- `founder-moonshot-0016` (THE ANOMALY CIVILIZATION): contradictions are treated as first-class targets.

Nothing in this module retires or narrows any other corpus idea.

## Truth boundary

This module creates evidence capability only. It adds no contact authority, sender readiness, payment readiness, customer, reply or revenue. Commercial truth on 2026-10-21: 0 prospects contacted, 0 messages, 0 replies, 0 paid orders, $0 cleared. `businessEffectAuthority: NONE`.

## Next real-world actions (ordered by value)

1. For each remaining held agency (004 and 005), find client sites the agency publicly names in its case studies, verify identity, and run `npm run inquiry:probe -- --website <client> --out <dir> --runtime`. Keep only agencies with at least one two-witness finding.
   - Launch Point (002) and Barlo (003) publicly name no clients as of 2026-10-21. For them the only truthful artifact is the anonymized sample above, with the micro-ask "Want me to run this on three of your client sites before you decide?" That is proof-before-pitch with no claimed defect.
2. Feed those snapshots into the existing V5 cohort and governed outbound gate the moment one owned sender passes independent readiness. Warming started 2026-10-21 (day 0), so no sender is ready today.
3. Use the snapshot as the per-site deliverable of the $1,500 / 3-site Agency Revenue Leak Proof Pack. The price is unchanged and remains a hypothesis.
