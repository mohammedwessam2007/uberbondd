# UberOutbound Genome Canon

Research cut: 2026-09-14.
Implementation generation: `uberbond.uberoutbound-genome.v2.2`.

Source basis: the founder-supplied **UberBond Outbound Genome: Evidence-First Research for Quality-Preserving Industrial Cold Outreach** report plus the current Distribution OS / UberReach branch truth.

This canon is an internal research-to-policy compiler. It does **not** authorize live outreach, manufacture legal eligibility, claim deliverability, or convert observational vendor data into causal truth.

## Terminal objective

UberOutbound exists beneath the Distribution OS and economic organ. Its objective is:

`maximize incremental cleared contribution profit subject to quality, legal eligibility, suppression, sender health, recipient-provider tolerance, reputation and authority constraints`

Raw send count, open rate and raw reply rate are not terminal metrics.

A 100,000/day figure is an infrastructure-capacity horizon, never a quota. Actual utilization must be the minimum supported by qualified eligible inventory, legal capacity, healthy sender/domain/egress capacity, recipient-provider budget and campaign risk policy.

## Canonical causal chain

`eligibility -> evidence -> trigger -> segment -> strategy atoms -> governed message -> experiment assignment -> delivery -> outcome -> causal learning -> updated policy`

The outbound system must be able to choose among:

`SEND_CANDIDATE | WAIT | ABSTAIN | ROUTE_ELSEWHERE`

The ability to refuse a bad send is a core capability.

## Evidence states

- `PROVEN_NORMATIVE`: provider/law/suppression/authority requirements. May be a hard gate.
- `STRONG_INFERENCE`: architecture/economic rule strongly implied by evidence but not a universal causal result.
- `PROBABLE`: large observational or convergent evidence. Use as a prior and tournament allocation bias, not irreversible truth.
- `SPECULATIVE`: plausible mechanism requiring experiment.
- `UNKNOWN`: preserve uncertainty; do not fill with model guesses.

Never average incompatible claims into a fake universal rule. Keep population, date, metric, treatment definition, source class, methodology and commercial conflict separable.

## Genome atom families

Every outbound decision should be reconstructible from these conceptual families:

1. **Eligibility**: jurisdiction, recorded legal decision/basis, recipient type, suppression/unsubscribe, provider-policy state.
2. **Target**: ICP fit, account value, role ownership, problem evidence, negative-fit evidence.
3. **Trigger**: type, observed value, source, timestamp/freshness, confidence, problem link.
4. **Personalization**: individual, role, company, industry, activity, technographic, executive-priority.
5. **Subject**: architecture, word count, capitalization, priority/problem reference.
6. **Opening**: trigger, observation, problem hypothesis, priority, peer proof, benchmark.
7. **Problem**: workflow pain, consequence, risk, cost of inaction, aspiration, status quo.
8. **Value**: minimum mechanism, relevant outcome, differentiation.
9. **Proof**: role/sector/size/problem/technology/geography similarity and observed outcome.
10. **Offer**: benchmark, teardown, diagnostic, assessment, calculator, peer comparison, pilot, sample, report.
11. **CTA**: offer-permission, interest, send-asset, question, meeting, calendar.
12. **Tone**: plain, peer, tentative, confident, curious, challenger, formal/casual.
13. **Sequence**: touch number, elapsed time, thread mode, novelty, channel, stop reason.
14. **Delivery**: mailbox/domain/IP-route/provider/authentication/health state.
15. **Outcome**: accepted delivery, bounce, complaint, unsubscribe, reply class, meeting, show, opportunity, proposal, close, cleared revenue, contribution, retention, expansion.
16. **AI-generation metadata**: model/version, research depth, source freshness, evidence-source count, fact-check status and cost/effort band.

## Strategy genotype vs rendered exposure

The V2.2 genome deliberately separates the reusable **strategy** from the exact prospect-specific **creative exposure**.

### Strategy genotype

`compileUberOutboundMessageGenotype()` produces a deterministic `ubog_<sha256>` over reusable causal-candidate atoms only:

- buyer segment and problem altitude;
- trigger class and whether the message mentions the trigger;
- personalization class and research-depth/source-freshness bands;
- subject, opening, problem, value, proof, offer, CTA and tone architecture;
- sequence position/new-information/thread mode;
- model/version/prompt-policy lineage and fact-check/cost-effort bands.

Exact subject text, body text, prospect-specific evidence digests and content receipt IDs are **not** genotype atoms. Two differently worded, genuinely personalized messages can therefore share the same genotype when they express the same strategy. A causal strategy-atom change changes the genotype ID.

### Rendered message phenotype / exposure

`compileUberOutboundRenderedMessageReceipt()` produces a separate deterministic `ubom_<sha256>` for the exact exposure. It binds the strategy genotype to:

- subject digest;
- body digest;
- content receipt pointer;
- evidence snapshot digest;
- optional rendered timestamp.

This preserves exact-message auditability without fragmenting causal learning into one fake genotype per personalized email.

### Decision lineage

Every compiled decision receives a deterministic `ubod_<sha256>` that binds stable account/sender/legal-evidence/experiment/genotype/**rendered-message**/policy lineage. Outcome receipts carry `decisionId`, `genotypeId`, and `renderedMessageId`.

The learning packet therefore distinguishes:

- `uniqueGenotypeCount`: diversity of reusable strategies;
- `uniqueRenderedMessageCount`: diversity of exact creative exposures.

That separation is required to detect structural AI monoculture without confusing healthy copy variation with strategy innovation.

## Targeting-signal vs copy-mention causal split

The report identifies a crucial confound: a trigger may predict buying propensity even if mentioning that trigger in copy adds no value.

UberOutbound therefore keeps prospect trigger evidence in selection context while `triggerMentioned` is a message-genotype atom. Experiments can declare a `treatmentDimension`, such as `TRIGGER_MENTION`, plus a `causalQuestion`. This makes two questions separately measurable:

1. does the signal select better opportunities?
2. after selection, does mentioning the signal improve the outcome?

## Problem altitude

Problem framing should be conditional on buyer altitude rather than treating seniority as cosmetic personalization:

- C-suite -> `STRATEGIC`
- VP/Head -> `FUNCTION`
- Director -> `FUNCTION_OPERATIONAL`
- Manager -> `WORKFLOW`
- IC/practitioner -> `TASK`

This is a testable prior, not a universal law.

## High-load-bearing V1 priors

The research corpus supports these as **priors**, not guaranteed causal lifts:

- first-touch email at or below roughly 100 words;
- roughly 3-4 sentences;
- short subject as a starting prior;
- buyer/problem language before product-heavy explanation;
- relevant proof over generic prestige proof;
- offer/interest CTA before direct cold meeting ask;
- personalization class conditioned on seniority;
- multiple touches generally outperform one-and-done, with adaptive stop logic and new information preferred over repeated bumps;
- activity/intent is useful for targeting, but selection effect must be separated from mention effect;
- no universal cadence, tone, trigger hierarchy, industry winner or daily volume is established.

## Trigger policy

V1 trigger tiers are only retrieval/allocation priors:

- Tier A: known activity/intent, direct engagement, direct observable problem, explicit strategic priority.
- Tier B: problem-linked hiring/job post, expansion, technology change, regulation, leadership change.
- Tier C: funding or other timing signals only when linked to a real problem.
- Tier D: generic social posts, awards, podcast appearances or trivia when they do not establish buying relevance.

The exact hierarchy remains experimental.

## Message architecture prior

A strong default compression is:

`evidence/reason-now -> specific problem -> consequence at recipient altitude -> minimum proof/mechanism -> useful next step -> low-friction CTA`

This is a mechanism library, not a template library. The genome should learn conditional optima rather than converging on one hidden sentence skeleton.

## CTA policy

Large observational Gong data reported directionally stronger reply associations for making an offer or asking for interest than for asking a cold prospect to articulate a problem or directly book a meeting. Because treatment assignment was not randomized, UberBond treats this as a challenger prior.

Default progression:

`cold first touch: offer/interest -> demonstrated intent: progressively more direct -> qualified positive reply: schedule efficiently`

## Sequence policy

V1 sequence state logic:

- touch one: highest-confidence trigger/problem + strongest offer hypothesis;
- no response: add new information rather than restating;
- engagement without reply: adjust context/offer; do not infer buying intent from opens alone;
- fresh trigger: permit contextual re-entry;
- explicit no/unsubscribe: immediate suppression;
- complaint/reputation deterioration: reduce/freeze affected sender path;
- collapsing marginal sequence value: stop;
- qualified reply: exit cold automation and enter reply/opportunity policy.

The reported 6-7-touch sweet spot is a probable prior, not a mandatory cadence.

## Legal and provider law

The US is not a global legal baseline. Recipient-level legal eligibility must be a recorded evidence decision with jurisdiction, recipient type, basis, policy version and evidence pointer. Unknown or denied eligibility cannot be repaired by copy quality.

Provider authentication, unsubscribe, complaint/reputation and sender-health requirements are hard constraints. Suppression dominates every optimization rule.

The runtime legal compiler records and enforces a prior eligibility decision. It intentionally does not pretend one JavaScript module exhaustively interprets every national law.

## Experiment law

Every material strategy change should support:

- stable experiment identity;
- account/recipient-level deterministic assignment;
- persistent holdout where useful;
- explicit treatment dimension and causal question;
- predeclared primary metric;
- minimum sample/evidence policy;
- provider/sender stratification;
- reputation and complaint guardrails;
- no automatic winner from opens or raw replies;
- independent causal/statistical analysis before promotion;
- untouched validation traffic before global promotion.

Historical sample-size calculations from the report are encoded in `UBEROUTBOUND_SAMPLE_SIZE_PRIORS`. They are planning examples, not universal sample requirements.

Contextual bandits are a later optimization layer. They must not precede causal baselines or be allowed to explore violations of law, suppression, provider policy or authority.

## Metric hierarchy

1. Safety: complaint, unsubscribe, hard/soft bounce, block/deferral, legal incident.
2. Delivery: accepted/delivered estimate, authentication, provider/domain health.
3. Conversation: qualified positive reply.
4. Sales: qualified meeting, show.
5. Commercial: opportunity, proposal.
6. Terminal: close, cleared contribution profit, retention, expansion.

Raw replies must be classified. Open rate may be diagnostic but cannot be a terminal objective.

## Economic fitness

A mature policy should reason about:

`MarginalSendValue = ExpectedProfit - ExpectedReputationDamage - ExpectedComplianceRisk - ExpectedOpportunityCost`

The current outcome receipt computes marginal send value only when every required economic term is supplied. Missing terms remain `UNKNOWN` rather than silently becoming zero.

Counterfactual incrementality matters. Attributed revenue is not automatically incremental revenue. Persistent holdouts should eventually estimate net-new pipeline and contribution.

## AI monoculture risk

At industrial scale, individually researched messages can still become structurally repetitive. UberBond should eventually measure lexical, syntactic and rhetorical diversity, but V2.2 already prevents one major analytical mistake: creative variation and strategy variation are separate dimensions.

The learning packet records both unique strategy genotypes and unique rendered messages. This is an observability primitive, not yet a complete monoculture detector.

## Current implementation

`src/uberoutbound-genome.mjs` v2.2 provides evidence states, priors, problem-altitude/personalization priors, recorded legal gate, trigger prior with uncertainty, transparent opportunity scoring, strategy genotypes, exact rendered-message receipts, deterministic experiment/holdout assignment, causal treatment metadata, `SEND_CANDIDATE / WAIT / ABSTAIN / ROUTE_ELSEWHERE`, zero-authority outcome receipts, marginal-send-value truth boundaries and a learning packet that refuses to auto-declare a causal winner.

`src/uberreach-control-plane.mjs` composes the genome into UberReach without granting external authority.

`tests/uberoutbound-genome.test.mjs` hostile-tests suppression, legal refusal, sender/provider health, experiment requirements, deterministic assignment, zero authority, incomplete economic truth and complaint guardrails.

`tests/uberoutbound-genotype.test.mjs` hostile-tests genotype determinism, atom-sensitive changes, creative-copy invariance of the strategy genotype, exact-exposure fingerprinting, decision lineage and strategy-vs-creative diversity in learning.

`artifacts/outbound-genome/research-2026-09-14.json` machine-encodes material visible in the founder-supplied report while explicitly listing separately referenced research-pack files that were not embedded in the PDF.

`schemas/uberoutbound-genome.schema.json` binds decision packets to v2.2, zero authority, strategy/exposure lineage and experiment metadata.

`scripts/uberoutbound-genome-doctor.mjs` closes only when the declared V1 research-to-policy genome, reusable strategy genotype, exact rendered-exposure lineage and fail-closed learning boundary are internally represented.

## Completion boundary

"Genome complete" means the declared V1 research-to-decision architecture is represented as executable, testable, machine-readable policy without dropping uncertainty, causal lineage, or authority boundaries. It does **not** mean:

- the world has one proven best cold-email template;
- 100,000/day is proven optimal or physically live;
- the uploaded PDF contains the separately referenced source-ledger / Top-100 / Top-50 downloads;
- every jurisdiction is automatically legally resolved;
- any copy treatment has causal proof inside UberBond before controlled observed outcomes;
- real customers, revenue, deliverability or provider acceptance exist.

The missing downloadable research-pack rows remain explicit external research assets to import if supplied. Their absence must never be replaced with fabricated rows.
