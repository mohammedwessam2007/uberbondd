# UberBond Proposal Acceptance Engine — Research Basis (2026-09-02)

## Goal
Maximize proposal acceptance probability without fabricating proof, manipulating buyers, or producing generic AI-sounding copy. No system can guarantee the highest approval rate; UberBond should instead continuously improve measured win rate from real closed-won/closed-lost outcomes.

## Evidence-backed principles

1. **Short, buyer-specific proposals beat bloated company brochures.** HubSpot recommends 1–2 pages, directing the proposal to the correct stakeholder, simple language, separating deliverables from pricing, pricing options, testimonials, and cross-device readability.
2. **Discovery precedes proposal generation.** PandaDoc recommends gathering client goals, timeline, budget range, and decision makers before drafting, then tailoring executive summary, scope, pricing, terms, and next steps.
3. **Reduce approval friction.** eSignature, clear next steps, mobile readability, integrated payment/signing, and concise pricing reduce buyer effort.
4. **Price must be contextualized by value.** Gong reports higher win rates when pricing is discussed after value in the conversation and materially worse outcomes when the decision maker is not involved.
5. **Stakeholder coverage matters.** Gong's published win-rate research emphasizes decision-maker involvement and multithreading rather than single-contact proposals.
6. **Learn from real proposal behavior and closed outcomes.** PandaDoc recommends tracking time-to-open, section dwell, pricing dwell, drop-off, signature completion, days-to-close, and win rate by template. Gong win/loss analytics treats closed-won vs closed-lost as the truth basis.

## UberBond design laws

- Never generate a final-send proposal when discovery evidence is materially incomplete; produce a missing-evidence checklist instead.
- Never invent testimonials, ROI, logos, customer names, benchmarks, urgency, scarcity, or quantified outcomes.
- Every claim should bind to an evidence reference or be explicitly labeled as a hypothesis/estimate.
- Optimize for buyer comprehension, not lexical sophistication.
- Start with the buyer's problem and desired outcome, not UberBond biography.
- Separate scope from price.
- Make the next action obvious and low-friction.
- Prefer concrete nouns/verbs and short sentences; avoid inflated AI filler, generic enthusiasm, excessive headings, repetitive triads, and corporate throat-clearing.
- Preserve the buyer's vocabulary where evidence supports it.
- Generate at least two materially different proposal variants only when there is a real testable hypothesis, not superficial synonym swapping.
- Learn from real accepted/rejected proposals, but do not overfit to tiny samples.
- Do not promote causal claims from opens/clicks alone.

## Minimum proposal evidence packet

- buyer/company identity
- stakeholder role and decision authority confidence
- verified problem/pain evidence
- desired outcome
- current-state evidence
- scope boundaries
- delivery timeline
- price and currency
- proof references available
- known objections/risks
- next-step mechanism
- jurisdiction/provider/commercial authority state

## Human-sounding writing checks

The engine should flag:
- generic opening compliments
- 'I hope this finds you well'
- unsupported superlatives
- excessive em dashes
- excessive colon-heavy headings
- repeated 'not just X, but Y' constructions
- generic AI phrases such as 'in today's fast-paced landscape', 'unlock', 'revolutionize', 'leverage cutting-edge', 'seamlessly', 'game-changer'
- long abstract noun chains
- paragraphs with no buyer-specific fact
- repeated sentence lengths and repetitive cadence
- unnecessary restatement of the buyer's brief

The target is not to imitate deception or conceal AI use. The target is clear, natural, buyer-centered business writing that a strong human seller would willingly send.

## Measurement

Primary metric: closed-won / (closed-won + closed-lost) for proposals that reached a real decision.

Secondary diagnostics:
- proposal-to-signature time
- revision count
- no-decision rate
- stakeholder coverage
- pricing-objection rate
- scope-confusion rate
- acceptance rate by template/offer/channel
- founder minutes per accepted proposal

Do not optimize opens, clicks, or dwell time as if they were revenue.
