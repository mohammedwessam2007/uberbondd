# UberBond — Current System State

**This file is the canonical present-tense software/commercial state.** Historical detail from the pre-checkpoint version is preserved byte-for-byte under `docs/archive/2026-08-30-pre-checkpoint/`. Repository code and newer exact external evidence still outrank this prose.

Last reconciled: **2026-09-03**
Branch: `claude/uberbond-ragnarok-closure-pek0g6`
Reconciled from current head: `d87f6c3a2661495477965fea41796d16dc582c60`

Machine-readable companion: [`artifacts/system-readiness.json`](../artifacts/system-readiness.json).

## Commercial truth

| Measure | Current truth |
|---|---:|
| Real customers | **0** |
| Cleared revenue | **$0.00** |
| Accepted deliveries | **0** |
| Retained customers | **0** |

No architecture, creator claim, generated opportunity, model output, preview deployment, internal test, or research ranking may promote those numbers.

## Event Horizon commercial allocation

`npm run event-horizon:doctor` reports `EVENT_HORIZON_HEALTHY`: five evidence-weighted finalists, 17 durable public sources, exactly one prepared experiment, and zero business-effect authority. The current first-cash champion is the **$450 white-label Lead-Path Revenue Leak Evidence Sprint**; it remains prepared and not externally activated. The strongest gated challenger is **GCC Bilingual E-Invoice Exception Evidence**. The **Partner Evidence Rail** is a strategic hypothesis for what repeated accepted partner delivery may become, not a product, channel, moat, customer, or revenue claim.

## Verified software evidence

The source-changing state of this branch was exercised before later documentation/checkpoint-only commits.

| Gate | Result |
|---|---|
| Syntax | `npm run check:syntax`: 724 files parse (2026-09-03) |
| Deterministic | `npm run test:deterministic`: 3277 tests, 3224 pass, **0 fail**, 53 skipped (2026-09-03) |
| Relay safety | `npm run test:relay-safety`: 150 tests, 150 pass, 0 fail (2026-08-30) |
| Real PostgreSQL | `OMNIA_V9_TEST_DATABASE_URL=postgres://... npm run test:postgres-real`: 171 tests, 167 pass, 1 fail, 3 suite-level timeouts (2026-09-02), PostgreSQL 17 embedded |
| Mutation war | `CHROMIUM_PATH=... OMNIA_V9_TEST_DATABASE_URL=... npm run test:mutation-war`: 154 mutations registered; full run not completed this session |
| Browser | `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:browser`: 1 test, 1 pass, 0 fail (2026-08-30), against the runner's installed Chromium |
| Dependency audit | `npm audit --omit=dev`: No vulnerabilities reported in the current integration environment. |

The 52 deterministic skips are environment-dependent suites excluded from that run; real-PostgreSQL behavior has separate evidence above. Hosted GitHub Actions jobs that receive no runner and execute zero steps remain `INFRASTRUCTURE_NON_EVIDENCE`.

## Reachability

**121 of 288 `src` modules have no entry point at all**.

| Reachability class | Modules |
|---|---:|
| Reachable from production | 139 |
| Reachable only via an operator script | 28 |
| **No entry point at all** | **121** |

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

The previous exact PR-head full-project preview `dpl_5e9AmHsdpxpdikFFfkUbJhzKopa6` was observed actively executing the real deterministic suite. The first account-activation deployment (`dpl_GtFzX8u8VRLL5SJ4jD9jm7dtHw1L`) failed its stale reachability-canon assertion. The next candidate (`dpl_B5Mqc5QJdRCpr9BA2Yy4AFjWk41h`) then exposed a publication packaging error: the readiness JSON was truncated at line 521. The complete artifact was republished and the corrected remote tree was verified. The stale queued full-project build (`dpl_ZusvtM5aWa63JMZ5JyB1TZRxRYV7`) then failed because it referenced a local-only canon SHA. Vercel Create Deployment resolved `main` to `5436eeb111a17f012ea7dc307f295703da391bc6` but refused to create the corrected production build with: `Resource is limited - try again in 24 hours (more than 100, code: "api-deployments-free-per-day").` A deployment state is not treated as business or provider proof. **Exact-current-main production is blocked by this Vercel quota until the platform permits another deployment.**

## Account activation receipt

The Vercel account-side setup is complete for the existing `uberbondd` project: a dedicated key named `UberBond Runtime Gateway` is stored as the protected Production value of `AI_GATEWAY_API_KEY`. Runtime settings are also present for the Vercel AI Gateway transport: enabled, model `openai/gpt-5.4`, and the recorded pricing evidence used by the compute ledger. No key value is present in this repository or receipt.

The published implementation composes that protected variable through `src/agent-model-executor-factory.mjs` and keeps the Gateway beneath UberBond's activation and consequence gates. The live model request canary is **not run** because the deployed surface has no dedicated protected provider-canary route; the local Gateway contract, failover, activation-gate and zero-effect tests pass. No model spend or business effect is claimed.

PayPal is **not configured**. Cloud Browser auto-review denied access to `https://www.paypal.com` before authentication, so no Sandbox REST application, Client ID, Secret, webhook setting or payment state changed. No PayPal sandbox canary or money movement occurred.

## External gates

Internal software cannot manufacture the following:

- separately authorized model spend and a reachable protected model-canary surface;
- lawful sender infrastructure and measured sender health;
- real customer demand/commitment;
- provider-origin cleared payment;
- accepted delivery, refund/dispute, renewal and expansion evidence;
- a PayPal Sandbox REST application and credentials (account access is currently blocked at the browser boundary);
- payment-provider KYC/payout and exact applicable legal/tax treatment;
- sustained unattended operation over real elapsed time;
- a human escalation transport;
- verified isolation plus a real Claude execution runtime.

## Immediate frontier

1. Activate exactly one owner-authorized $450 Lead-Path Revenue Leak Evidence Sprint through the existing partner canary packet. Measure cleared payment, accepted delivery, founder minutes, partner margin, and whether the same partner produces a second downstream account.
2. Keep `gcc-einvoice-exception-evidence` research-only until a qualified provider supplies a safe sample and a stronger payment commitment than the current canary. Official obligations are not demand proof.
3. Do not build a parallel AI evaluation platform. The strategic acceptance handoff is limited to composing existing task criteria, capability benchmarks, consequence receipts, and payment-acceptance truth into an evidence pack after buyer evidence justifies it.
4. Re-verify exact-current-main production only when a real deployment is observed. The connected full Vercel project is `live: false`; recent observed full-project deployments are errors and exact-current-main runtime is unproven.
5. Preserve the Capability Genome foundation and defer expensive corpus scaling until storage, source access, sandboxing, and economic pull are dependency-satisfied. Catalog size is not the frontier.

Zero customer contact, zero live provider/model execution, zero purchases, zero PayPal account mutation, zero DNS changes, zero money movement, and zero production business mutation were authorized or performed by this checkpoint. The Vercel Gateway secret was configured in the protected project store; its value is intentionally absent from all repository evidence.
