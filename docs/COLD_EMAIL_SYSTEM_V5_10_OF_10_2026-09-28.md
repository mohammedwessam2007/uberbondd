# UberBond Cold Email System V5 — 10/10 Design Standard
Date: 2026-09-28

Status: design-complete against UberBond's current evidence/rubric. "10/10" here means no material design gap remains in the current rubric. It does NOT mean a universal reply-rate guarantee or proof that no future experiment can improve it.

# 0. Objective

Primary record-mode objective:
maximize P(qualified positive reply | delivered, eligible, truly-cold prospect)

Primary money-mode objective:
maximize expected cleared contribution profit / founder minute

Subject to hard gates:
- lawful/eligible recipient route
- not suppressed
- truthful sender identity
- evidence-backed claims
- healthy sender/domain/egress
- complaint/unsubscribe budgets respected
- no deception, fake urgency, fake personalization, or enforcement evasion

# 1. Why a static "perfect template" is mathematically inferior

A static template can optimize only wording.
UberBond must optimize the full probability chain:

P(QPR) ≈
P(delivery)
× P(attention)
× P(relevance)
× P(problem recognition)
× P(credibility)
× P(offer desirability)
× P(reply action)
× P(qualification | reply)

If one upstream term is near zero, copy polish cannot rescue the email.

Therefore the winning system is:
SELECT → PROVE → TIME → MATCH → PRE-WORK → COMPRESS → MICRO-ASK → ASYNC-CLOSE → LEARN

# 2. Pre-send gate: the email must earn the right to exist

A prospect enters generation only if all mandatory gates pass:

1. ICP fit
2. direct problem evidence OR strong problem-linked trigger
3. role ownership / influence
4. valid contact route
5. legal/jurisdictional eligibility
6. not suppressed
7. sender route healthy
8. offer can genuinely help
9. evidence is fresh enough
10. evidence survives retest when required

If a mandatory gate fails:
DO_NOT_SEND

Unused capacity is not a reason to lower the bar.

# 3. Opportunity score

Initial pre-data prior:

OpportunityScore =
0.24 ProblemEvidence
+ 0.16 RoleOwnership
+ 0.14 TriggerStrengthFreshness
+ 0.12 AccountValue
+ 0.10 OfferFit
+ 0.08 ContactConfidence
+ 0.06 ProofAvailability
+ 0.05 Geography/JurisdictionFit
+ 0.05 Timing

These weights are seed priors only. Replace with learned coefficients from outcomes.

# 4. Message candidate score

For each qualified prospect generate a bounded candidate set. The current executable compiler emits at least eight first-touch strategy arms when the evidence packet supports them.

Current initialization prior, reconciled with `ULTIMATE_COLD_EMAIL_EXPECTED_SUCCESS_COMPILER_V2_2026-09-28.md`:

CandidateScore =
0.18 ProblemEvidence
+ 0.14 RoleOwnership
+ 0.12 TriggerStrengthFreshness
+ 0.12 RelevanceSpecificity
+ 0.10 OfferUtility
+ 0.08 ProofSimilarity
+ 0.07 CTAEase
+ 0.06 Credibility
+ 0.05 MessageClarity
+ 0.04 SubjectFit
+ 0.02 Novelty
+ 0.02 ToneFit
- 0.10 CognitiveLoadPenalty
- 0.08 HypePenalty
- 0.08 CreepyPersonalizationPenalty
- 0.08 UnsupportedClaimPenalty
- 0.06 AskCostPenalty

The current experiment generator changes one controlled atom at a time around a baseline: subject, CTA wording, or proof-density mode. Every prospect-specific rendered message keeps an exact fingerprint, while a stable strategy-arm ID lets outcomes aggregate across prospects without pretending personalized copy is identical.

The current pre-outcome allocation is deliberately provisional: the seed-score champion receives most traffic and a bounded 15% exploration slice is distributed across all challengers. Assignment propensity is stored with the treatment receipt. This is not Thompson sampling, not a calibrated reply probability, and not permission to auto-promote a winner.

Unknown prior components remain recorded as unknown. These weights are initialization priors only, not permanent constants or causal coefficients.

# 5. The E4X first-touch compiler

## Subject
2–5 plain words.
Use problem, priority, workflow, or artifact language.
No clickbait.
No fake Re:.
No fake urgency.
No marketing adjectives.

## Sentence 1 — EVIDENCE + WHY YOU + WHY NOW
Template family:
"I [checked/traced/compared/tested] [specific object/workflow] at [company] and found [verified observation]."

Rules:
- cannot be transferable unchanged to 100 other companies
- direct problem evidence beats decorative personalization
- one strong signal beats several weak facts
- use company/strategic context more for executives
- use workflow/task context more for operators
- use trigger only if it changes relevance
- never invent a signal

## Sentence 2 — EFFECT AT BUYER ALTITUDE
Template family:
"For [role/function], that can mean [credible consequence]."

Altitude:
- C-suite: strategic cost, risk, missed objective, growth constraint
- VP/Director: functional capacity, conversion, efficiency, risk
- Manager: handoff failure, throughput, workload, process friction
- IC: exact task, time, error, recurring burden

Rules:
- no unsupported ROI
- if causality is uncertain, use hypothesis language
- buyer vocabulary, not vendor jargon

## Sentence 3 — EVIDENCE-OF-WORK + PREWORK OFFER
Template family:
"I already [mapped/tested/benchmarked] it and put [proof/output] into [custom artifact]."

Preferred artifacts:
- one-page evidence map
- annotated screenshots
- teardown/audit
- peer benchmark
- diagnostic
- repair-order list
- short custom report

Rules:
- genuinely customized
- valuable even if they never buy
- research cost scales with account value
- proof similarity beats prestige-logo proof
- no generic AI report bait

## Sentence 4 — MICRO-COMMITMENT
Default:
"Want me to send it?"

Challengers:
"Worth sending over?"
"Want the screenshots?"
"Useful if I send the one-pager?"
"Should I send the repair map?"

Rules:
- one CTA
- no calendar link on default cold first touch
- direct scheduling only after demonstrated intent
- asked effort must be smaller than offered value

# 6. Structural constraints

Default:
- 51–100 words starting prior
- <=100 words
- 3–4 sentences
- one idea
- one CTA
- phone-readable without scrolling

Delete:
- "Hope you're well"
- company biography
- feature dump
- generic compliments
- irrelevant hobbies/schools/sports
- fake empathy
- fake urgency
- unsupported revenue-loss claims
- excessive adjectives
- "quick question"
- giant signature blocks
- first-touch calendar link

# 7. Proof-density rule

The first email should contain enough proof to make the artifact believable without forcing the prospect to click a link or open an attachment.

Good:
"found 3 handoff breaks"
"quote form reaches a dead end after submission"
"booking CTA disappears on mobile"

Weak:
"noticed some opportunities"
"found several issues"
"think we can help"

Links/attachments on first touch become experimental variables, not defaults.

# 8. Signature / trust floor

Keep identity compact and truthful.

Default footer:
Mohamed Wessam
UberBond
[required legal/opt-out text by jurisdiction]

Do not pad the email with credentials unless the segment proves they improve response.
Identity must never be ambiguous or deceptive.

# 9. Current UberBond phenotype

Subject: lead handoff

I traced one of your home-service client lead paths and found three places where a booked-job lead can disappear between the form and follow-up.

I mapped the breaks and repair order into a one-page evidence sheet with screenshots.

Want me to send it?

# 10. Async-first reply-state machine

The system is designed so a buyer can move from cold prospect to paid client without a meeting.

## State: YES / SEND IT
Reply:
"Sent. If you'd like, I can also send the exact white-label scope, turnaround and fixed price here. No call needed unless you'd prefer one."

Action:
- send artifact
- do NOT ask for a meeting
- offer scope asynchronously

## State: SEND INFO
Reply:
"Absolutely. I'll keep it concise: [1-line artifact description]. If useful, I can send the exact scope, turnaround and fixed price here too."

## State: PRICE?
Reply:
"For this scope, the fixed price is [price] for [exact deliverable]. Turnaround is [time]. I can send the full scope and payment/onboarding link here if useful."

Do not force a discovery call to reveal price if the offer is truly fixed-scope.

## State: HOW DOES IT WORK?
Reply:
"[3-step explanation]. I can keep the whole thing async. If you want the exact scope and fixed price, I'll send it here."

## State: WRONG PERSON
Reply:
"Thanks. Who owns [specific function/problem] on your side?"

Do not restart a generic sequence.

## State: NOT NOW
Reply:
"Understood. I'll close the loop. If [relevant trigger/problem] becomes a priority later, happy to send the analysis then."

Suppress or defer according to explicit preference.

## State: NO / UNSUBSCRIBE
Immediate global suppression.
No persuasion.

## State: CALL?
If prospect requests a call:
- accept if economically rational
- offer async alternative once, gently:
"Happy to. If easier, I can also send the scope/price here first so the call is optional."

Never resist a buyer who genuinely prefers a call.

# 11. Async close funnel

Cold email
→ artifact permission
→ artifact delivered
→ 1–3 async qualification questions
→ exact fixed scope
→ price
→ payment link/invoice
→ onboarding form/checklist
→ delivery
→ acceptance
→ expansion offer

Meeting default: NONE

Meeting allowed when:
- buyer explicitly requests it
- scope genuinely bespoke
- multi-stakeholder alignment needed
- access/security ambiguity is material
- regulated/legal issues require synchronous clarification
- contract value or uncertainty makes a call economically rational

# 12. Founder-minute economics

For every opportunity estimate:

FounderEfficiency =
ExpectedClearedContributionProfit /
(ExpectedSynchronousFounderMinutes + λ × ExpectedAsyncFounderMinutes)

where λ < 1 if async founder minutes are less disruptive.

Prefer a slightly lower close probability if it dramatically reduces founder time and preserves total expected profit.

# 13. Follow-up sequence: novelty, not nagging

Touch 1: strongest evidence + strongest offer
Touch 2: new finding / screenshot
Touch 3: peer benchmark / comparison
Touch 4: alternate consequence / stakeholder angle
Touch 5: fresh trigger / alternative artifact
Touch 6: concise close-the-loop
Touch 7: only if marginal EV remains positive

Forbidden:
"Just bumping this"
"Any thoughts?"
"Circling back"
"Did you see my last email?"

Each touch must add information.

# 14. Sequence stop law

Stop or pause when:
- explicit no
- unsubscribe
- complaint
- wrong fit confirmed
- sender-health degradation
- marginal reply value collapses
- no fresh information remains

Re-entry requires genuinely new relevance.

# 15. Objection prevention before objection handling

The format should quietly remove common objections:

"Is this generic?" → specific evidence
"Do they understand us?" → role/company relevance
"Is this real?" → proof + screenshots
"Will this waste time?" → one-page artifact
"Do I need a meeting?" → no
"What's next?" → fixed async scope
"Is price hidden?" → fixed price once relevant
"Will this become a huge project?" → explicit scope and acceptance criteria

# 16. Artifact quality gate

Before promising an artifact:
- it must exist or be generatable immediately
- every factual claim must be evidenced
- screenshots/evidence must be current
- artifact must be legible in under 2 minutes
- top finding visible immediately
- prioritized repair/action order included
- no bloated AI prose
- no generic recommendations masquerading as custom analysis

# 17. Anti-AI-monoculture rule

Even personalized AI messages can become structurally identical.

Measure:
- opening-phrase concentration
- sentence-structure concentration
- CTA concentration
- lexical similarity
- artifact-type concentration

Allow stylistic diversity only inside truth/evidence constraints.

Never create fake identities or deceptive persona variation.

# 18. Experiment design

Randomize at recipient/account level.
Stratify by:
industry
× seniority
× department
× trigger class
× intent state
× geography
× recipient provider
× sender route

Do not let sender-health differences masquerade as copy effects.

Primary early metric:
qualified positive reply

Secondary:
meeting
show
opportunity
close
cleared revenue
founder minutes

Guardrails:
negative reply
unsubscribe
complaint
bounce
block/deferral

# 19. Candidate tournament

For each qualified prospect:
1. generate 8–20 bounded variants
2. score P(QPR)
3. remove variants failing truth/quality gates
4. send top candidate most of the time
5. reserve controlled exploration traffic for challengers
6. update posterior from outcome

Use Thompson sampling / constrained contextual bandit only after clean randomized baselines exist.

# 20. Hierarchical learning model

Store every strategy atom.

Model family:
logit(P(QPR)) =
β0
+ β_prospect X
+ β_message M
+ β_interaction (X×M)
+ random effects(segment, sender, time)

Partial pooling:
- global priors inform small cohorts
- segments can still diverge
- no universal template forced where data disagrees

# 21. Promotion law

A variant becomes champion only if:
- adequate sample
- positive effect on qualified-positive reply
- holdout replication
- no material sender-health regression
- no complaint/unsubscribe regression
- downstream economics not worse
- founder-minute economics acceptable

A reply-rate winner that produces worse buyers is not a winner.

# 22. Record-attempt protocol

If chasing the highest defensible reply rate:
- tightly homogeneous micro-cohorts
- only high evidence-score prospects
- 1:1 prework
- lower mailbox volume if needed to protect quality
- unique delivered truly-cold prospects as denominator
- exclude auto replies/OOO
- report total human reply
- report positive reply
- report qualified positive reply
- report meetings
- report revenue
- independent replication cohort required

No tiny-sample "world record" claims.

# 23. 10/10 scorecard

Targeting/evidence quality: 10/10
Relevance/personalization: 10/10
Offer/prework: 10/10
Proof/credibility: 10/10
CTA friction: 10/10
Copy clarity/cognitive load: 10/10
Async/no-meeting conversion: 10/10
Reply/objection state machine: 10/10
Experiment/learning architecture: 10/10
Compliance/deliverability/trust: 10/10

This is a design-completeness score, not a promise of a 100% reply rate.

# 24. Why V5 supersedes V2 without deleting it

V2 established the evidence-weighted message compiler.
Async V1 established a no-meeting funnel.
V5 merges both and closes four missing gaps:
1. proof-density and artifact quality
2. full reply-state/objection handling
3. founder-minute optimization inside the close path
4. anti-monoculture + promotion/abstention rules

V2 and Async V1 remain historical/provenance artifacts.

# 25. Final invariant

The best cold email is not the cleverest sentence.

It is the smallest truthful message, sent to the strongest legitimate opportunity at the right time, proving a real problem, offering useful prework, asking for almost nothing, and feeding every outcome back into a system that becomes more selective and more accurate over time.
