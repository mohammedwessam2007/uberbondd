# SOVEREIGN FORGE Ω∞ Wave 3 — Paired Evidence Poisoning Hardening
Date 2026-10-08. Parent verified main `124b5f30d3153388ae4ba73a1142333fcb4190ac`.

## Reproducer and chosen intervention
The existing `reviewPairedWorkloadSubmission` checked required receipt fields but staged each **entire untrusted input object**. One malicious circular extra field caused the supposedly fail-closed source verifier to throw `TypeError: Converting circular structure to JSON` while hashing an otherwise structurally valid receipt. Another case could add misleading `independentQualityVerified` to an unverified submission or top-level `externallyVerified` to a manifest without being explicitly refused. It did not confer economic authority, but contaminated the intake boundary and impaired availability.

Minimal repair chosen over two alternatives:
1. **Selected:** allowlist manifest and paired fields; refuse extraneous input; preserve only canonical typed receipt fields when hashing.
2. Reuse existing PHOENIX/Proof-DAG for authenticated custody later. Deferred because this current stage has no audited third-party receipts.
3. 890-derived distributed independent receipt-verification market. Deferred: adds unjustified provider, identity, legal and cost dependencies without genuine observations.

Founder donors #0057 Proof Economy (binding), #0058 Error Economy (adversarial reproduction), #0067 Trust Compiler (refuse authority inflation), #0060 Civilizational Memory (truth lineage), #0653 Self-Falsifying System (hostile fixtures), #0877 Recursion Proof System (don't widen inherited permissions). Original #0001–#0890 source and immutable ten shards untouched. Full 890 inheritance continues.

## Executed local proof
Before fix: valid manifest + circular unrelated paired metadata threw `TypeError` instead of returning a refusal.
After local source patch: syntax validated, historical four tests plus 16 adversarial tests = **20/20 passed** on Node v22.16.0. Added three cases for circular untrusted metadata, self-promoted manifest authority aliases and shadow-grade fields; prior 13 integrity and four precommit cases still passed. This local receipt is scoped and not proof of full GitHub repository suite or production.
No model provider, outbound campaign, DNS, customer, payment or paid action.

## Completion boundary
Wave 2 production previously passed real Node v26.11.1 107/107 on Render; Wave 3 must be explicitly confirmed on new exact SHA before promoting its native test receipt. Expected 110 tests if the new three run, not asserted before observed output.

The technical patch only closes an internal refusal/integrity defect. No claimed new sealed independent model holdouts, provider invoices, measured global 33,333x, legal sending clearance, buyer acceptance, contract, Contra payout activation, cleared payment or renewal. These remain current independent gates.

PHOENIX event `UBERBOND-FORGE-OMEGA-20261008-W3-PAIRED-RECEIPT-POISONING`.
Resume: review PR diff and actual native test receipt, merge only when justified, trigger existing Render auto-deploy-off service on exact merged main, verify native tests and 890 original source, update issue #1188. Preserve all prior canon/finished organs; never replay uncertain provider canaries or procure Winnr without owner authority.
