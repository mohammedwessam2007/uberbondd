# SOVEREIGN FORGE Ω∞ / WAVE 1: PUBLIC WORKLOAD EVIDENCE INTEGRITY

Date: 2026-10-08. Source base: `86fae592c4e3afa26ca74d1c84762a437750feed` (PR #1310).
Truth class: SOURCE PATCH + LOCAL TARGETED TESTS; GitHub CI, merge, deployment, provider/customer outcomes must be verified separately.

## Recovery and no-amputation
- `00_AGENT_LAUNCHER.md` from user-provided Sovereign Forge bundle read before execution. Bundle's 25 manifest files, archival monolith and direct 890-founder source SHA-256 all matched.
- Original source SHA-256: `8a7be38681fd0bf15ebccecec099f25c86e4ea567f3b6e0892b6c73b2a319109`. Source is the immutable input; this wave modifies **zero** original idea entries or shards.
- Latest #1188 comment at recovery: #1310 source precommit, original public issues are already visible historic tasks and must not be misclassified as fresh independently sealed holdouts.
- Existing resolved Revenue Singularity, G-SPOT, Winnr pilot, JEV, PHOENIX, and 890 source validators remain intact. All 890 IDs stay eligible as donors.

## Binding constraint
The *overall first cash constraint* remains external: real buyer consent, sender/legal authority, authentically usable collection and independent cleared-payment evidence. No internal code can certify or fabricate them.

The highest-value internally reproducible defect in the newest research-intake critical path was a missing **manifest integrity verification** in `reviewPairedWorkloadSubmission`: it trusted caller-supplied `ok:true` and searched `manifest.items` without structural checks.
- Local baseline reproduced forged `ok:true` task set receiving status `PAIRED_WORKLOAD_RECEIPTS_STAGED_FOR_INDEPENDENT_AUDIT` despite false manifest digest.
- A malformed manifest (`items:null`) threw `TypeError` instead of refusing.
- A single caller-provided `externalConsentVerified:true` could be relabeled `permissionForProviderBenchmarkReuseVerified:true` without an independent permission receipt. Still no empirical authority, but the label was too strong.
- The source could repeat one public issue URL as multiple seemingly independent task candidates if the taskId and digest changed.

## Competing interventions
1. **Minimal integrity repair (selected)**: re-derive exact manifest commitment; validate immutable intake truth flags and item schema, count, bounds, provenance and uniqueness at pair-staging boundary; refuse malformed data; separate self-declared consent from authenticated permission. Bounded, zero-cost, existing module.
2. **Compose existing PHOENIX/Proof DAG custody (deferred)**: useful for durable third-party attestation after actual independent provider receipts exist; premature for current public task *staging* and adds coupling.
3. **Radical 890-derived provenance market/independent reviewer network (deferred)**: could eventually evaluate third-party task and invoice authority, but without sealed actual tasks, consent and independent invoices it only adds fake sophistication.

## Source mechanisms grounded in original founder text
- #0057 **Proof Economy**: content-bound evidence remains reusable and distinguishable from assertions.
- #0058 **Error Economy** and #0653 **Self-Falsifying System**: execute counterexamples against apparent success.
- #0060 **Civilizational Memory** and #0146 **Knowledge Packet**: bind source, version, scope and outcome.
- #0067 **Trust Compiler**: do not promote claims into external trust.
- #0480 **Self-Healing Knowledge Graph**: inconsistencies produce refusal rather than silent continuation.
- #0877 **Recursion Proof System**: growing intake capacity cannot manufacture permission or empirical promotion.
All other 882 original source ideas remain preserved, addressable and unaltered.

## Implementation
- `src/ubermind-public-workload-precommit.mjs`: exported `verifyPublicWorkloadManifest` for structural and digest verification, unique source URL enforcement, no self-certifying provider reuse permission, fixed audit/authority flags, immutable pair-staging digest output, efficient lookup by taskId.
- `tests/ubermind-public-workload-integrity.test.mjs`: new adversarial rejection and unchanged benign-path staging fixtures.
- No dependencies, keys, paid calls, protected content, outbound messages, DNS actions or new provider integrations.
- SHA-256 is *integrity only*, not authentication or independent provenance. A hostile submitter can compute another internally consistent manifest; it still cannot claim fresh holdout, quality, provider invoice, consent verification, spend authority or economic multiplier. Independent source/custody verification stays external.

## Executed local test evidence before PR
- Unpatched baseline: forged manifest was accepted for staging, and malformed input threw.
- Patched local module: `node --check` passed; `node --test tests/ubermind-public-workload-integrity.test.mjs`: **13/13 passed, 0 failed**.
- Those 13 local tests ran in an isolated checkout-equivalent copy of this module because current environment cannot resolve github.com for a native clone. GitHub-hosted CI is required to establish integrated repository test status. The 11 new in-repository tests must also be executed in GitHub/runtime context.

## Explicit pending gates
- Recheck latest main/branch before merge, inspect PR diff and CI. Do not merge known failing source.
- No production deployment, paid model request, provider verification, user outreach, buyer acceptance, contract signature or cleared revenue claimed by this source wave.
- Next externally meaningful research step: independent consented sealed matched task + blinded outputs + authentic cheapest eligible provider bills and quality judge. Commercial priority: current live legal/sender/payment gates, never silent release.

## PHOENIX event
ID `UBERBOND-FORGE-OMEGA-20261008-W1-INTAKE-INTEGRITY`.
Parent main `86fae592c4e3afa26ca74d1c84762a437750feed`; corpus SHA bound above.
Truth label `SOURCE_PATCH_LOCAL_VERIFIED__GITHUB_CI_AND_PRODUCTION_PENDING`.
Resume: verify native PR tests, independent code review, merge only on green checks, verify exact main SHA; do not replay old provider canaries or buy Winnr.

Independent adversarial follow-up found a circular-item crash in the first candidate. Patched allowlisted fields plus digest failure handling, retested 13/13 locally; included regression in repository. This is a meaningful defect caught before merge, not omitted from the record.

## Native CI and exact-source verification update

- 2026-10-08: GitHub workflow runs on the exact PR head failed before any test steps ran: the CI deterministic/postgres/browser jobs and Night Verification/Postal/Exact-Head jobs each exposed zero steps. These are **NO SOURCE-TEST EVIDENCE**, not an executed failing test. Job logs returned BlobNotFound 404. Vercel status links explicitly reported build-rate limits. Do not mark the hosted suite green.
- Independently retrieved the PR's source Git blob and compared to locally tested source using `git hash-object`: both **5bed1ce9896b0f47179df97fb8f93d08715e2247**. Node v22.16.0 local on that exact blob: source syntax PASS; 13 adversarial tests + 4 preexisting tests = **17/17 passed, 0 failed**. This establishes targeted module confidence, not full integrated CI equivalence.
- Second review pass disclosed a circular/extra-field denial-of-service and repaired it before promotion.
