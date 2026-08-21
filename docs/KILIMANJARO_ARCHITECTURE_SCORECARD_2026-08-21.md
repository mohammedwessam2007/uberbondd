# UberBond Kilimanjaro Architecture Scorecard

**Date:** 2026-08-21  
**Scope:** current main `eb46a5c2e50c873a2d5e96a5270a7423fb3b6ed0`, plus separately identified PR40/45/7 donors  
**Method:** evidence-weighted engineering readiness heuristic, not a market percentile and not a revenue forecast.

## Interpretation

The score answers: “How much of the required capability is evidenced well enough to support the next safe stage?” It does not answer “How much code exists?” A preparation-only module can score architectural credit while receiving zero commercial credit.

- `VERIFIED_LIVE`: real external interface or real receipt observed.
- `PASS_LOCAL`: deterministic local behavior is proven, but external reality is not.
- `INTERFACE_READY_EXTERNAL_PROOF_REQUIRED`: contract exists; credentials/deployment/provider/customer evidence is missing.
- `PARTIAL`: meaningful slice exists, but composition or proof is incomplete.
- `RESEARCH_REQUIRED`: no compliant live path or reliable evidence yet.
- `ZERO`: no verified capability or no commercial result.

## A. Cognitive organization readiness

| Area | Score | Current evidence | Ceiling / missing proof |
|---|---:|---|---|
| Evidence and truth discipline | 70% | Current code carries claim classes, truth tables, external-effect ledgers, and explicit unresolved states | Need one machine-readable status registry and drift tests across docs/API/modules |
| Persistent state | 50% | Postgres/store contracts, audit receipts, autonomy snapshots in PR40 | Need atomic ownership/CAS, crash proof, scoped replay, deployed store |
| GitHub relay | 65% | Real issue-based round trips, leases, heartbeats, recovery, source-commit receipts | Result authenticity bug must be fixed; collision semantics are not row-locked |
| HTTP/cloud relay | 20% | API/client/cloud queue contracts and recent ingress fixes | No current deployment/health/queue/worker receipt |
| GPT ↔ Claude task contract | 45% | PR40 task intent, relay adapter, bounded loop, disputes and adapters | Parent constraint inheritance, live route, retries, multi-worker identity |
| Model routing | 25% | PR40 router design; current `ai.mjs` has simple provider switch | No verified benchmark history, model manifest, or economic outcome loop |
| Compute governance | 35% | PR40 reserve/commit/pending records and activation gate | Scope, concurrency, provider spend authority and live accounting |
| Dispute/repair loop | 40% | Bounded rounds and terminal statuses are present | Real cross-agent delivered roundtrip and arbitration receipts |
| Sandbox engineering | 25% | Claude Code executor has tool restrictions and receipts | Independent path/diff enforcement, hostile filesystem tests, attestation |
| Founder escalation | 55% | Owner queue capped and activation gate exposes blockers | Deployed escalation, alert delivery, and absence drill |
| V9/consequence boundary | 65% | Main has V9/Guard integration and fail-closed tests | Current docs disagree; live deployment and signed approval proof absent |

**Cognitive organization heuristic:** **45%**.  
This is not a claim that the system is 45% autonomous; it is a readiness estimate for the organizational control layer.

## B. Full Kilimanjaro organism readiness

| Capability | Score | Evidence-backed status |
|---|---:|---|
| Market sensing | 15% | Local signal contracts/registry; compliant live adapters absent |
| Opportunity intelligence | 30% | Genome/tournament schema and catalog; fresh source/buyer proof absent |
| Experiment compiler | 35% | Preparation-only probe contracts; no live experiment |
| Distribution allocation | 20% | Fail-closed payment-proof ranking; no live channel allocation |
| Partner distribution | 10% | Conceptual/registry surface; no activated partner |
| Fulfillment | 15% | Offer/payment/report modules; no accepted live delivery |
| Payment collection | 10% | Payment truth code and configurable links; no cleared payment |
| Retention/renewal | 5% | Data structures/monitoring concepts; zero renewals |
| Commercial learning | 15% | Contradiction/margin logic; no outcome population |
| Capital allocation | 20% | Payment-proof ranking and zero-spend plan; no capital decision from real profit |
| Self-upgrade | 40% | Proposal/engineering/shadow gates; no economically promoted upgrade |
| Cloud scheduling | 20% | Local scheduler/queue contracts; no deployed worker proof |
| Device-off operation | 10% | Feasible via Vercel Queues/background APIs in principle; no configured runtime |
| Owner-absence readiness | 10% | Readiness evaluator exists; no multi-day absence evidence |
| Economic truth | 10% | Strong policy language and payment gate; all commercial proof is zero |

**Full Kilimanjaro organism heuristic:** **17%**.

The low score is intentional. The organism is not close to the target merely because the preparation layer is broad. The missing portion is the part that turns thought into external, accepted, recurring economic value.

## C. Current stage ladder

| Stage | Current classification |
|---|---|
| Research / local preparation | PASS_LOCAL |
| Evidence-backed external research ingestion | INTERFACE_READY_EXTERNAL_PROOF_REQUIRED |
| GPT ↔ Claude message channel | VERIFIED_LIVE for bounded GitHub issue relay; NOT_PROVEN for unattended cognitive bus |
| Provider execution | NOT_RUN / external credentials required |
| Cloud worker | NOT_DEPLOYED / external proof required |
| Shadow | PARTIAL / contracts exist; live queue observation not proven |
| Canary | NOT_AUTHORIZED / no provider canary receipt |
| Economic experiment | NOT_RUN |
| Cleared payment | ZERO |
| Accepted delivery | ZERO |
| Renewal/expansion | ZERO |
| Kilimanjaro 7–14 day absence | NOT_PROVEN |

## D. Percentile range, with limits

There is no reliable census for “autonomous economic organisms,” so no precise percentile is defensible. A qualitative range is:

- Against ordinary solo AI prototypes: **upper-tier architecture discipline**, because UberBond has explicit evidence classes, consequence boundaries, receipts, leases, and a payment-truth vocabulary.
- Against production agent platforms: **below production-ready**, because the cloud worker, provider canaries, full external telemetry, and commercial outcomes are absent.
- Against pre-revenue AI startups: **stronger-than-average internal architecture, weaker-than-average commercial proof unless those startups are also pre-revenue**.
- Against mature autonomous commerce systems: **not comparable yet**; UberBond lacks the external transaction/retention dataset.

The permanent advantage should be measured later by real learning rate and contribution margin per founder minute, not by architecture percentile.

## E. Promotion gates that would materially raise the score

1. Merge only the repaired, current-main-based cognitive-bus slices and prove two-worker isolation.
2. Deploy one non-consequential cloud relay/worker with a real receipt and endpoint verification.
3. Complete one provider canary with signed request/response provenance, bounded budget, timeout, and replay proof.
4. Complete one lawful first payment and accepted delivery.
5. Complete a second payment or renewal and calculate contribution margin and founder minutes.
6. Run a seven-day absence rehearsal with a kill switch and owner escalation.


