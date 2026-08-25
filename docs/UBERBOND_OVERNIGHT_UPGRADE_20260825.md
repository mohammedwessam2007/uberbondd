# UberBond Overnight Market Capability Upgrade

**Base main:** `2a76f3947a700a89d91d31977c4c6f8703b02f6d`  
**Integration branch:** `overnight/market-capability-upgrade-20260825`  
**Owner authorization:** Mohamed — repository engineering and bounded internal agent work  
**External effects:** disabled

## Objective

Compose the highest-value cloneable market capabilities around UberBond's existing evidence, outbound, agent-mesh, governance, payment, fulfillment, and opportunity primitives.

## Workstreams

1. Reliability and proof: reconcile PRs #160–#163 and open P1 recovery/sovereignty gates without editing protected authority.
2. Intent and enrichment: evidence-bound account intent, freshness/decay, contradiction handling, and budgeted provider-neutral waterfalls.
3. Revenue Journey Assurance: deterministic journey observations and truthful diagnostic/offer compilation.
4. Partner and owned distribution: partner fit, referral attribution, co-sell hypotheses, rights-aware owned assets.
5. Capability control plane: market capability registry, bounded tournament, founder-minute economics, expiry, budgets, kill conditions, and overnight receipts.

## Non-negotiable boundaries

- Do not touch `lite/`.
- Do not weaken OMNIA V9, payment truth, suppression, sovereignty, effect-ledger, recovery, or founder-absence boundaries.
- No provider calls, mailbox/DNS/account changes, payments, KYC, customer contact, external publishing, or deployment promotion.
- Synthetic fixtures remain synthetic and cannot become external evidence.
- Every new feature needs deterministic tests; high-consequence guards need hostile/mutation coverage.
- A successful implementation is not a commercial result. Customers, cleared revenue, accepted delivery, and retention remain zero until externally evidenced.

## Integration gate

The branch may become a draft PR only after:

- all five workstreams are reviewed for disjointness;
- syntax and focused tests pass;
- deterministic and mutation tests cover the new guards;
- existing sovereignty boundaries remain byte/behaviorally protected;
- exact-head CI and real PostgreSQL proof are available or explicitly marked missing;
- no claim of deployment, payment, deliverability, or customer outcome is made without direct evidence.
