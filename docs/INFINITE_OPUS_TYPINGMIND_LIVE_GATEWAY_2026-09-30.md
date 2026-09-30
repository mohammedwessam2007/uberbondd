# Infinite Opus TypingMind Live Gateway — 2026-09-30

Status: source implementation. Live activation requires the private runtime key, current bounded spend authorization, current Crown Admission Receipt, approved durable host, and private gateway bearer.

## What the user sees

TypingMind should expose exactly one UberBond custom model for this path:

- **Name:** UberMind
- **Model ID:** `ubermind/auto`
- **OpenAI-compatible chat endpoint:** `https://<approved-uberbond-host>/api/typingmind/infinite-opus/v1/chat/completions`
- **Optional model-list endpoint for diagnostics:** `https://<approved-uberbond-host>/api/typingmind/infinite-opus/v1/models`
- **Authorization header:** `Bearer <UBERMIND_TYPINGMIND_GATEWAY_TOKEN>`
- **Streaming:** supported as delayed final-only SSE. The gateway finishes Builder + Crown review first, then emits only the approved final answer; unreviewed builder tokens are never streamed
- **Tools / plugins / function calling:** off in gateway v1
- **Vision / binary message content:** off in gateway v1
- **Output ceiling:** 4,096 tokens per stage
- **Request envelope:** <=300,000 JSON bytes, <=128 text messages

The gateway bearer is **not** the OpenRouter key, **not** `ADMIN_TOKEN`, and **not** a provider management key. Generate a separate random value at least 32 characters long and put it only in the host secret manager and TypingMind custom header UI.

## Why one model

The cockpit must not force Mohamed to manually choose among suppliers. Supplier selection is an implementation detail beneath the stable logical interface.

```
TypingMind
  |
  | model = ubermind/auto
  v
UBERMIND GATEWAY
  |
  +--> exact / E0-E4 internal runtime        (no model when proof closes)
  +--> Jev Hyperreflex                       (shadow/certified bounded control only)
  +--> cheap scout/challenger                (proposal only)
  +--> GPT-6.1 Sol Builder                   (normal strong proposal)
  +--> GPT-6.1 Sol Pro                       (hard escalation only)
  +--> admitted moving Crown                 (irreducible semantic authority)
  +--> Reality Court / proof ledger
```

Gateway v1 exposes the **raw human-chat** path first. Raw language is not assumed to be E0-E4. Therefore the v1 interactive quality law is:

```
GPT-6.1 Sol candidate
        |
        v
admitted General Crown review
        |
        +-- ACCEPT  -> reuse the Sol prose, Crown-verified semantics
        |
        +-- REWRITE -> return direct Crown correction
        |
        +-- malformed review / provider drift -> refuse, never silently downgrade
```

This is intentionally expensive relative to compiled recurring work. The 33,333x program is not supposed to make every novel chat free. It is supposed to make **recurrence** descend out of frontier inference.

## Exact quality boundary

A direct raw chat response may ship only after:

1. the runtime OpenRouter key policy is verified against the expected USD 20 monthly key limit;
2. the current public model price record is fresh;
3. the monthly paid authorization is current and bounded to USD 20 runtime spend;
4. the protected Crown reserve remains available;
5. the requested builder call is durably reserved before network dispatch;
6. OpenRouter returns observed usage, model identity and generation receipt;
7. the bill reconciles;
8. the Crown call is durably reserved;
9. the Crown model identity matches the admitted model;
10. the **observed upstream provider** matches the Crown Admission Receipt;
11. the Crown Admission Receipt matches the gateway's exact routing-policy identity `openrouter:auto-provider-zdr-deny-required-parameters-v1`; OpenRouter's raw generation `router`, request ID and upstream ID are retained separately when the API returns them;
12. the Crown either explicitly accepts the candidate or supplies the corrected answer.

Upstream-provider/model/routing-policy drift blocks the response even after money was spent. That is preferable to laundering a weaker or different supplier into Crown authority.

## Economic corrections implemented

### Request-specific reservation

The original paid runtime conservatively reserved as if every call contained 300,000 input tokens.

Gateway source now requires an explicit bounded `inputTokenCeiling` and reserves against that request-specific upper bound while retaining a hard 300,000-token ceiling.

This matters enormously under a USD 20 runtime key:

- tiny requests no longer consume a novel-length reservation;
- the Crown reserve remains usable;
- queued work reflects realistic worst-case cost;
- provider-bill settlement still decides actual spend.

### Standard Sol before Sol Pro

Normal building uses `openai/gpt-6.1-sol`.

`openai/gpt-6.1-sol-pro` remains an escalation lane because it is the same underlying Sol model in a more expensive reasoning mode that can consume substantially more billed reasoning work.

### Response caching is explicit

The OpenRouter governed adapter now supports `X-OpenRouter-Cache: true` **only when the runtime explicitly requests it**.

Gateway v1 leaves it off for arbitrary raw chat because freshness cannot be inferred safely from untyped natural language.

Typed immutable/dependency-bound execution should prefer UberBond's local exact response cache and, where independently safe, provider response caching.

## CORS and browser boundary

The gateway supports browser preflight without provider calls.

Default allowed origins:

- `https://www.typingmind.com`
- `https://typingmind.com`

Override only through `UBERMIND_TYPINGMIND_ALLOWED_ORIGINS`.

An OPTIONS preflight receives no model access, no provider call, no inference and no authority. Actual requests still require the dedicated bearer.

## Required host environment

Secrets:

- `OPENROUTER_API_KEY` — dedicated `uberbond-runtime-20`, monthly USD 20 cap.
- `UBERMIND_TYPINGMIND_GATEWAY_TOKEN` — independent random cockpit ingress secret, >=32 chars.

Non-secret/current authority receipts:

- `INFINITE_OPUS_PAID_AUTHORIZATION_JSON`
- `INFINITE_OPUS_CROWN_ADMISSION_JSON`

Policy:

- `INFINITE_OPUS_CASH_ROUTE_MODE=OPENROUTER_ONLY`
- `UBERMIND_TYPINGMIND_ALLOWED_ORIGINS=https://www.typingmind.com,https://typingmind.com`

The OpenRouter member-level `uberbond-global-28` guardrail remains mandatory for the full two-key claim:

- runtime inference key max: USD 20/month;
- direct TypingMind key max: USD 8/month;
- account/member inference guardrail: USD 28/month;
- fee allowance keeps the planning envelope below USD 30 under the currently encoded 5.5% assumption.

## Jev

Jev is deliberately **not yet allowed to suppress the Crown for arbitrary chat**.

Current raw-chat metadata reports:

- mode: `SHADOW_ONLY`;
- `usedToSuppressCrown: false`.

Jev activation belongs in recurring typed task classes. Its path remains:

```
Crown decision
 -> decision boundary
 -> typed Jev shadow
 -> real paired outcomes
 -> calibration
 -> certified bounded reflex
 -> deterministic code when stable
 -> decompile on drift
```

This preserves Jev's purpose: high-frequency semantic interrupt control, not pretending a cheap classifier is a frontier model.

## Where the 33,333x target is attacked

Do not measure the multiplier on the raw chat path alone.

The correct workload ladder is:

1. **Provider screening** — first selected real workload.
2. Pin current provider facts and source-state hashes.
3. Deterministically eliminate providers that fail exact requirements.
4. Coalesce identical unresolved semantic leaves.
5. Crown adjudicates only the residual.
6. Crown decisions become reusable semantic atoms / Decision Franchises.
7. Recurring decisions move into E0-E4 / Jev / code.
8. Every provable execution mints an E0-E4 execution receipt.
9. The reference ledger prices the cheapest legitimate direct-frontier counterfactual, including cache/Batch economics.
10. The actual ledger uses observed all-in spend.
11. Claim 33,333.333x only if the ledger itself satisfies the million-dollar threshold and factor test.

## Activation order

```
SOURCE MERGED
 -> runtime key capped at USD 20
 -> member guardrail USD 28
 -> private management reconciliation
 -> <= USD 0.05 no-effect MiMo canary
 -> sealed task-class Crown tournament
 -> Crown Admission Receipt
 -> bounded paid authorization receipt
 -> deploy approved durable host
 -> configure TypingMind custom model UberMind
 -> first live raw chat
 -> first real PROVIDER_SCREENING workload
 -> E0-E4 execution receipts
 -> Jev shadow calibration
 -> compounding proof ledger
```

No step may be skipped by substituting a key, architecture description, benchmark score, or model reputation for the required authority/evidence receipt.
