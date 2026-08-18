# Prometheus Adapter and Capital Planning Wave

Date: 2026-08-18

## Outcome

The economic spine now has two additional safe sockets:

1. A lawful adapter contract that can describe a future source/provider,
   validate purpose and allowed fields, evaluate authorization, and prepare a
   bounded dry-run from caller-supplied candidates.
2. A proof-gated capital planning contract that ranks candidate experiments
   only when their economic evidence contains cleared payments, known positive
   contribution margin, and bounded build cost.

Neither socket pretends to be live. Neither can send, spend, authenticate,
fetch, deploy, or promote.

## Adapter contract

`src/adapter-contracts.mjs` requires:

- stable adapter identity and source kind;
- a public terms URL;
- an explicit lawful purpose;
- an explicit allowed-field list;
- a kill switch that defaults on.

The manifest is a local `MANIFEST_ONLY` object. Access is `DRY_RUN_ONLY` by
default. A supplied owner authorization receipt changes the classification to
`OWNER_AUTHORIZED_REVIEW_REQUIRED`, not to live access. `liveAccess` remains
`EXTERNAL_PROOF_REQUIRED`, credentials are never stored, and network/provider
calls remain zero.

Dry-run output contains only bounded candidate references, payload digests, and
`NOT_FETCHED` status. It does not reproduce raw content or imply that a
platform adapter actually ran.

## Capital planner

`src/capital-allocator.mjs` is a planning function, not a wallet. A candidate
must provide:

- a minimum cleared-payment count;
- a positive, known contribution-margin result;
- a bounded build cost;
- a stable candidate reference.

Candidates are ranked by a transparent margin-per-build-cost ratio. Missing or
unproven economics produce `DO_NOT_ALLOCATE`; passing candidates produce
`PLAN_ONLY_OWNER_REVIEW`. `actualSpendCents` is always `0` and the module has
no provider, ad, payment, or purchase boundary.

## Verification

- `tests/adapter-capital.test.mjs`: **7/7 PASS**
- `npm run check`: **440/440 PASS locally**
- `lite/`: unchanged
- Browser suite: `NOT_RUN`
- Hosted CI: previously blocked by the repository billing lock
- Live adapters: `EXTERNAL_PROOF_REQUIRED`
- Cleared payments/customers/revenue: none claimed

## External-effect ledger

Provider calls: 0. Messages: 0. Purchases: 0. Spend: 0. Deployments: 0.
Credential/DNS changes: 0. Production mutations: 0. Only the task branch
contains the local code and documentation update.

## Next gate

The next economic proof is not another speculative feature: configure and
owner-authorize one lawful checkout path, then record one real cleared payment
and accepted delivery. Until that exists, adapter access and capital
allocation remain review-only.
