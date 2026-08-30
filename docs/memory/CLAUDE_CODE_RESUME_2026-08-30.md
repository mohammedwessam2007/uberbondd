# Claude Code Resume Mission — UberBond — 2026-08-30

You are the UberBond Software Factory lane. Resume from repository truth, not from a chat summary.

## Mandatory bootstrap

Before changing code:

1. Refresh `main`, open PRs and the current target branch.
2. Read, in order:
   - `AGENTS.md`
   - `UBERBOND_CANON.md`
   - `UBERBOND_BOOTSTRAP.json`
   - `docs/UBERBOND_MASTER_MEMORY.md`
   - `artifacts/uberbond-memory-index.json`
   - `docs/memory/UBERBOND_CHECKPOINT_2026-08-30.md`
   - `docs/CURRENT_HANDOFF.json`
   - `docs/CURRENT_SYSTEM_STATE.md`
   - `artifacts/system-readiness.json`
   - `docs/AI_EMPLOYEE_COMPANY_CHARTER.md`
   - `docs/prompts/CLAUDE_OPUS_MAX_NIGHTFALL_GO_LIVE_20260829.md`
3. Treat the newest explicit checkpoint as superseding stale short-term claims it names, including the old Everest-is-unresolved memory-index entry.
4. Dedupe against current `main`, open PRs and active integration branches before writing anything.

## Company objective

Optimize:

`risk-adjusted cleared contribution profit / founder minute`

Build one evidence-first AI-native company/OS with many possible front-end offers, shared capabilities, world-class distribution, canonical payment truth, accepted delivery, recurring revenue, learning, capital reallocation and founder-light cloud operation.

Code volume, agent count and architecture prestige are not objectives.

## Current highest-priority mission: finish PR #251

PR #251 is `gpt/payment-operator-attention-20260830`, “Surface anomalous pending payments without alerting on trials”.

Intended semantics:

- `REVIEW_REQUIRED` -> operator attention.
- `PENDING_OR_UNCLEAR` with only `subscription-status-on_trial` -> expected pending, quiet.
- Every other `PENDING_OR_UNCLEAR` -> anomalous pending, operator attention.
- Missing reason on pending -> fail visible.
- No payment classification, unlocking, revenue, provider, webhook, fulfilment or authority widening.

Known focused evidence: 9/9 cases PASS. A hostile mutation that marks every pending state expected makes 5/9 protections fail.

Known measured source truth:

- 628 syntax files
- 2897 deterministic tests
- 2846 pass
- 0 fail
- 51 skipped
- 255 source modules
- 127 production-reachable
- 9 operator-script-only
- 119 no-entry
- relay 150/150
- real PostgreSQL 167/167 on PostgreSQL 16.13
- mutation war 100/100 killed
- browser 1/1
- dependency audit 0 vulnerabilities

`payment-operator-attention.mjs` is production-reachable through `founder-command-center -> prometheus-control-tower -> job-handlers`.

### Memory-integrity warning

An intermediate manual readiness refresh at `d1a75d04...` collapsed hundreds of lines of capability evidence. This was repaired at `a7d25ab08781307002f663dcfa903983ff5c54b2`.

The previous canon/handoff/bootstrap were archived byte-for-byte at `991efdee100616cd6d811a92194d611fa3097a14`.

Do not regenerate a smaller readiness artifact unless semantic equivalence of every capability entry is proven.

## Exact verification before merge

On the exact candidate head, run every available non-vacuous gate:

- `npm run check:syntax`
- `npm run test:deterministic`
- `npm run test:relay-safety`
- real PostgreSQL suite when a real database runtime is available
- browser suite when a real Chromium runtime is available
- mutation war with its required real runtimes
- canon freshness
- reachability ratchet
- focused payment-attention suite

A hosted CI job with no assigned runner and zero executed steps is `INFRASTRUCTURE_NON_EVIDENCE`, not a pass or source failure.

For Vercel, inspect the build log and prove the syntax/deterministic commands actually ran. A READY badge alone is insufficient.

If the exact candidate is green and bounded, merge with expected-head protection. If any source/canon defect appears, repair it first and rerun the exact candidate.

## After #251

Select the highest-value dependency-satisfied engineering mission. Current preferred sequence:

1. **Canonical payment rail expansion.**
   - Extend provider support through the existing provider-evidence -> canonical payment reconciliation -> fulfilment chain.
   - PayPal is a candidate provider rail.
   - Do not create a second revenue ledger.
   - Do not let checkout/order creation become “cleared revenue”.
   - Preserve webhook/provider evidence identity, idempotency, reversal/refund truth, amount/currency truth and fulfilment gating.
   - Do not touch credentials, KYC, payout, money or production payment configuration without owner authority.

2. **Distribution and real economic proof.**
   - Reuse Lead OS, Instantly-style outbound, Distribution Control Plane, Growth Graph and partner/white-label infrastructure.
   - Build only missing capability atoms/adapters.
   - No prohibited scraping, CAPTCHA bypass, fingerprint spoofing, private-email inference, impersonation or rotation around access blocks.
   - No outbound without the existing authorization, suppression, sender-health, contact and budget gates.

3. **NIGHTFALL cloud liveness.**
   - Advance device-off cloud scheduling, receipts, recovery, provider wiring and founder-absence evidence.
   - Never simulate elapsed time or external proof.
   - Preserve zero-business-effect canaries where external authority is absent.

4. **Self-upgrade / capability acquisition.**
   - Reuse public software patterns through clean-room abstraction, dedupe and licensing review.
   - Do not vendor code blindly.
   - Never edit sovereignty/authority controls autonomously where the repository marks them human-only.

## Claude operating contract

- Work in a verified isolated sandbox.
- `LOCAL_PREPARATION` only unless a higher consequence class carries explicit authority.
- Preserve `lite/` unless the mission explicitly requires it.
- No credentials in durable artifacts.
- Derive changed files from Git state, not model self-report.
- Bind verification to the exact change set.
- If Git state changes during verification, stop.
- If cleanup cannot be proven, quarantine rather than promote.
- If provider outcome is uncertain, preserve uncertainty.
- Never convert a model claim into customer/payment/acceptance evidence.
- Update the durable handoff/checkpoint after material progress.
- Close/supersede stale duplicate PRs rather than leaving ambiguous parallel truth.

## External truth boundary

Repository work alone cannot prove:

- a real customer;
- cleared payment;
- accepted delivery;
- renewal/retention;
- provider/KYC readiness;
- lawful sender readiness;
- live human escalation delivery;
- sustained founder absence over real elapsed time;
- market superiority.

Report these as external gates, not unfinished code if the software path is already complete.

## Effect authority for this resume packet

This packet grants **no business-effect authority**.

No customer/prospect contact, provider/model spend, purchase, KYC, DNS, credential change, payment movement, production/customer mutation or production promotion is authorized merely by reading it.

Engineering changes, tests, PR preparation and safe exact-head verification are permitted within the repository's normal authority model. Existing explicitly authorized deployment/merge behavior still requires the exact source gate to pass.

When finished with a bounded mission, leave:
- exact head SHA;
- exact changed paths;
- exact tests and outcomes;
- unresolved external gates;
- external-effect ledger;
- updated `docs/CURRENT_HANDOFF.json`;
- updated checkpoint pointer if the frontier materially changed.

Do not ask the founder to reconstruct context that is already in the repository.
