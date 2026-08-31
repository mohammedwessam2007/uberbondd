# UberBond — Current System State

**This file is the canonical present-tense software/commercial state.** Historical detail from the pre-checkpoint version is preserved byte-for-byte under `docs/archive/2026-08-30-pre-checkpoint/`. Repository code and newer exact external evidence still outrank this prose.

Last reconciled: **2026-08-31**
Branch: `main`
Reconciled from current head: `6bea2a2c21d9ed236df8a0a76651f3f70f26af47`

Machine-readable companion: [`artifacts/system-readiness.json`](../artifacts/system-readiness.json).

## Commercial truth

| Measure | Current truth |
|---|---:|
| Real customers | **0** |
| Cleared revenue | **$0.00** |
| Accepted deliveries | **0** |
| Retained customers | **0** |

No architecture, creator claim, generated opportunity, model output, preview deployment, internal test, or research ranking may promote those numbers.

## Verified software evidence

The source-changing state of this branch was exercised before later documentation/checkpoint-only commits.

| Gate | Result |
|---|---|
| Syntax | `npm run check:syntax`: 643 files parse (2026-08-31) |
| Deterministic | `npm run test:deterministic`: 2948 tests, 2897 pass, **0 fail**, 51 skipped (2026-08-31) |
| Relay safety | `npm run test:relay-safety`: 150 tests, 150 pass, 0 fail (2026-08-30) |
| Real PostgreSQL | `OMNIA_V9_TEST_DATABASE_URL=postgres://... npm run test:postgres-real`: 167 tests, 167 pass, 0 fail (2026-08-30), against PostgreSQL 16.13 |
| Mutation war | `CHROMIUM_PATH=... OMNIA_V9_TEST_DATABASE_URL=... npm run test:mutation-war`: 100 mutations, 100 killed, 0 not killed |
| Browser | `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:browser`: 1 test, 1 pass, 0 fail (2026-08-30), against the runner's installed Chromium |
| Dependency audit | `npm audit --omit=dev`: No vulnerabilities reported in the current integration environment. |

The 51 deterministic skips are the environment-dependent real-PostgreSQL suites excluded from that run; they have separate real-PostgreSQL evidence above. Hosted GitHub Actions jobs that receive no runner and execute zero steps remain `INFRASTRUCTURE_NON_EVIDENCE`.

## Reachability

**119 of 262 `src` modules have no entry point at all**.

| Reachability class | Modules |
|---|---:|
| Reachable from production | 131 |
| Reachable only via an operator script | 12 |
| **No entry point at all** | **119** |

The new `src/payment-operator-attention.mjs` is production-reachable through `founder-command-center -> prometheus-control-tower -> job-handlers`.

## PR #251 payment-attention policy

`classifyPaymentEvent()` remains the payment-truth authority. The founder command center now interprets its already-safe classifications as follows:

- `REVIEW_REQUIRED` -> operator attention.
- `PENDING_OR_UNCLEAR` with only `subscription-status-on_trial` -> expected pending, quiet.
- Every other `PENDING_OR_UNCLEAR` -> anomalous pending, operator attention.
- Pending with no reason -> fail visible.

This changes **operator visibility only**. It does not clear money, unlock fulfilment, create revenue, mutate provider evidence, call a provider, or widen authority.

Independent focused proof covered nine cases, all passing. A hostile mutation that treats every pending state as expected makes five of the nine protections fail.

## Memory integrity

A manual readiness refresh accidentally compacted away hundreds of lines of capability evidence in an intermediate branch commit. It was caught before merge. Commit `a7d25ab08781307002f663dcfa903983ff5c54b2` restored the full capability registry. The old canon, handoff and bootstrap were then archived byte-for-byte at commit `991efdee100616cd6d811a92194d611fa3097a14`.

The current crash checkpoint is `docs/memory/UBERBOND_CHECKPOINT_2026-08-30.md`.

The older machine memory entry that described Everest as unresolved is superseded: repository evidence establishes **Everest -> SUMMIT 100 -> BLACK SKY -> Reality Activation**, with the Everest receipt verdict `EVEREST_PARTIALLY_CLOSED`.

## AI company / Trinity

- **GPT-5.6 Sol, Company Brain:** market sensing, opportunity research/tournaments, economics, pricing, competitor/company research, portfolio allocation and world-class distribution strategy.
- **Claude Code / Opus Max, Software Factory:** bounded engineering, adapters, cloud/runtime, persistence, tests, hostile verification, recovery and deployment evidence.
- **Mission Control:** repository continuity, contradiction reconciliation, review, deployment truth, consequence gates and founder-minute minimization.

AI employees are bounded roles in one governed company. Intelligence and capability never create consequence authority.

The repository contains a real Claude engineering orchestrator, but a live Claude Code run still requires the verified isolation/provider runtime defined by that contract. The GitHub relay worker is verification-only and is not evidence that Claude executed.

## Cloud truth

The connected Vercel account exposes team `team_A9LnjIuS5PU0rNetsHMu1N0r` and full project `prj_RWUPf14w1xIz9NK92AbNW5z7qDCg` (`uberbondd`).

The previous exact PR-head full-project preview `dpl_5e9AmHsdpxpdikFFfkUbJhzKopa6` was observed actively executing the real deterministic suite. A preview state does not prove production promotion. **Exact-current-main production is not yet proven by this checkpoint.**

## External gates

Internal software cannot manufacture the following:

- a real provider credential plus separately authorized spend;
- lawful sender infrastructure and measured sender health;
- real customer demand/commitment;
- provider-origin cleared payment;
- accepted delivery, refund/dispute, renewal and expansion evidence;
- payment-provider KYC/payout and exact applicable legal/tax treatment;
- sustained unattended operation over real elapsed time;
- a human escalation transport;
- verified isolation plus a real Claude execution runtime.

## Immediate frontier

1. Finish the exact-head Vercel syntax + deterministic gate for PR #251.
2. If the exact candidate is green and remains bounded, merge #251 with expected-head protection.
3. Verify new `main` and exact deployment state.
4. Continue the payment frontier through the existing provider-evidence -> canonical reconciliation -> fulfilment chain. A PayPal adapter may be added as a provider rail only if it feeds the same canonical ledger rather than becoming a second money truth.
5. Continue world-class distribution and NIGHTFALL cloud-liveness, prioritizing real economic proof over architecture volume.

Zero customer contact, zero provider/model execution, zero purchases, zero credential/DNS changes, zero money movement, and zero production mutation were authorized or performed by this checkpoint.
