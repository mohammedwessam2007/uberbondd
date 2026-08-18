# Prometheus organization-layer wave

Date: 2026-08-18

## Agent relay bus

`src/agent-relay.mjs` is UberBond's canonical handoff contract for GPT,
Claude Code, Cowork, or any future worker. It carries objective, origin and
target agent, context/evidence references, constraints, required outputs,
acceptance tests, bounded budget, consequence class, and forbidden actions.

It also creates `DisputePacket` records when workers disagree. Arbitration is
bounded to three rounds. Missing evidence, `DEFER`, and exhausted rounds
escalate to the owner rather than creating an infinite argument loop. Every
packet has `execution.status = NOT_RUN` until a real connected worker receipt
exists.

## Mechanism lab

`src/mechanism-lab.mjs` maps supplied structured business-genome fields into
reusable atoms such as acquisition, value, pricing, fulfillment, recurrence,
partner leverage, data moat, and automation. Evidence references are required;
raw source payloads are not persisted.

It creates bounded pairwise combinations as `HYPOTHESIS` with
`UNPROVEN_COMBINATION` evidence status. Price, payment, demand, customer,
and contribution margin remain unknown until canonical experiments prove them.
Red-team output recommends review or bounded validation and never autonomously
kills or promotes a candidate.

## Fitness and business-model death review

`src/business-model-fitness.mjs` consumes commercial-learning summaries. It
requires a minimum verified-payment sample, holds insufficient data, and only
flags shrink/kill review when measured negative cash, margin, or owner-efficiency
signals exist. It never treats missing metrics as failure, automatically kills
a model, or allocates capital.

## Verification

- `tests/agent-relay.test.mjs`: 9/9 PASS.
- `tests/mechanism-lab.test.mjs`: 8/8 PASS.
- `tests/business-model-fitness.test.mjs`: 8/8 PASS.
- `npm run check`: 433/433 PASS locally.
- `git diff --name-only -- lite/`: empty.

## External-effect ledger

No provider calls, agent connections, messages, purchases, spend, deployments,
credential/DNS changes, production mutations, customer claims, or revenue
claims. These are preparation contracts only.

## Economic gate

The code is now capable of preparing an organization-wide relay, mechanism
search, and fitness review. It is not yet a money-making company by proof. The
next evidence ladder remains: configured checkout → first lawful stranger
payment → accepted delivery → second payment/renewal → positive contribution
margin. Until then, all rankings and business-model recommendations remain
hypotheses or local preparation evidence.
