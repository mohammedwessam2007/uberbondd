# Prometheus self-upgrade and control-tower wave

Date: 2026-08-18

## Outcome

UberBond now has a governed local loop for turning evidence-backed weaknesses
into bounded engineering work and a founder-facing report for seeing what is
actually known. This is preparation infrastructure, not autonomous sovereignty.

## Self-upgrade contract

`src/self-upgrade.mjs` provides:

- `UpgradeProposal` compilation with evidence references, expected economic
  effect, build cost, risk, affected capabilities, acceptance criteria,
  rollback plan, proposed agent, and explicit `OWNER_REQUIRED` authority;
- `EngineeringMissionPacket` compilation with non-`lite/` repository scope,
  mandatory tests, acceptance gates, rollback, and a mandatory forbidden-action
  list;
- a gate evaluator that distinguishes `SHADOW_READY` from `REPAIR_REQUIRED`
  and always leaves production promotion owner-gated;
- compact audit receipts that keep raw proposal payloads out of the log.

No proposal claims Claude Code, Cowork, GPT, or any other agent actually ran.
The packet's execution state is `NOT_RUN` until a real connected worker receipt
exists.

## Control tower

`src/prometheus-control-tower.mjs` composes the existing founder command center,
commercial learning receipts, audit counts, and capability graph into bounded
sections for:

- money and payment truth;
- businesses and experiments;
- distribution and outbound state;
- market intelligence;
- product and verification;
- AI-workforce evidence;
- capital controls;
- founder actions, capped at three.

Preparation receipts remain preparation receipts. Customers, cleared revenue,
accepted deliveries, agent execution, and deployment are `UNKNOWN` or
`NOT_PROVEN` unless their canonical evidence exists.

## Verification

- `node --test tests/self-upgrade.test.mjs`: 11/11 PASS.
- `node --test tests/prometheus-control-tower.test.mjs`: 5/5 PASS.
- `npm run check`: 408/408 PASS locally.
- `git diff --name-only -- lite/`: empty.

## External-effect ledger

Provider calls: 0. Messages: 0. Purchases: 0. Deployments: 0. Credential or
DNS changes: 0. Production mutations: 0. Spend: 0. No customer, payment,
agent-execution, hosted-CI, or revenue proof is claimed.

## Remaining gates

The next economically meaningful proof is still external: configure a real
checkout, obtain the first lawful stranger payment, deliver an accepted result,
and reconcile payment/refund/owner-time evidence. Live source adapters, the
V9-vs-Deliverability-Guard canonical choice, and real Claude/Cowork execution
remain separately gated.
