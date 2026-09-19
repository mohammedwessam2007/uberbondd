# UberBond Jev / Noetic Autocompiler Integration

Status: **source integration candidate; default-off; no live Jev call proven by this branch**  
Date: 2026-09-19  
Source ancestor: `3c02c47facdba1b902f19aa7a39ad0b8d5b0776f`

## Purpose

Integrate TypeSafe Jev as the first replaceable **System-One semantic supplier** beneath UberBond's deep-reasoning models without allowing a vendor, model judgement, or confidence score to manufacture consequence authority.

The architecture implements the first executable slice of the Noetic Autocompiler:

`frontier reasoning -> semantic program -> Jev/System-One shadow judgement -> reality outcomes -> candidate deterministic compilation -> decompile on drift`

This is deliberately narrower than the full research vision. It proves the provider-neutral seam and the compile/reflex/decompile laws before any attempt at large-scale semantic tensors, speculative counterfactual universes, ontology mutation, or hardware descent.

## Current source truth

This branch adds:

- `src/system-one-decision-adapter.mjs`
  - provider-neutral Noul / Choice / Score builders;
  - bounded System-One request compiler;
  - direct TypeSafe transport using the documented `POST /v1/systemone` contract;
  - default model `jev-latest`;
  - fail-closed credential, pricing-evidence, enablement and per-call authorization gates;
  - strict typed-response validation;
  - no automatic retry after an uncertain paid provider call;
  - usage/cost evidence and zero business-effect authority.
- `src/noetic-autocompiler.mjs`
  - content-addressed semantic programs;
  - `PLAN_ONLY` and `SHADOW` execution modes;
  - semantic register file;
  - confidence-based escalation to deeper cognition;
  - reality-drift decompilation;
  - deterministic-compilation eligibility that remains review-only and cannot mutate production automatically.
- `scripts/jev-doctor.mjs`
  - zero-network readiness inspection and a compiled semantic canary.
- deterministic tests covering fail-closed transport, typed answers, shadow execution, escalation, compilation eligibility and decompilation.

## Source basis

The official TypeSafe JavaScript SDK documents:

- package: `@typesafe-ai/sdk`;
- Node.js 20+;
- environment variable `TYPESAFE_API_KEY`;
- default API root `https://api.typesafe.ai`;
- default model `jev-latest`;
- direct request `POST /v1/systemone`;
- question primitives `noul`, `choice`, `score`;
- response token usage `input_tokens` and `output_tokens`.

UberBond does not vendor or copy the SDK. The adapter independently implements the small documented wire contract so TypeSafe remains a replaceable supplier. The SDK remains the compatibility reference.

## Activation variables

The live direct lane refuses unless all are present:

```text
TYPESAFE_API_KEY=<protected secret>
TYPESAFE_JEV_ENABLED=true
TYPESAFE_DEFAULT_MODEL=jev-latest
TYPESAFE_BASE_URL=https://api.typesafe.ai
TYPESAFE_INPUT_USD_PER_MILLION=<current verified value>
TYPESAFE_OUTPUT_USD_PER_MILLION=<current verified value>
TYPESAFE_PRICING_SOURCE=<official source URL/reference>
TYPESAFE_PRICING_VERIFIED_AT=<ISO-8601 timestamp>
TYPESAFE_MAX_COST_USD_PER_CALL=<small positive ceiling>
```

Do not commit the API key. Do not paste it into chat. Secret creation/custody remains an owner/provider boundary.

`TYPESAFE_JEV_ENABLED=true` does **not** itself cause calls. Every call still requires `providerCallAuthorized: true`, an approved external `dataClass`, and a positive `spendCeilingUsd` within the adapter's configured per-call maximum.

The direct external lane accepts only `PUBLIC`, `INTERNAL_NON_SENSITIVE`, or `CUSTOMER_AUTHORIZED_NON_SENSITIVE` state. `UNCLASSIFIED` and private/sensitive classes are refused. Secret-like state keys (credentials, tokens, passwords, cookies, private keys) are refused before network I/O.

## Promotion ladder

1. **PLAN_ONLY**: compile semantic programs; zero provider calls.
2. **SHADOW**: explicit Jev calls produce judgements but no consequence authority.
3. **CALIBRATED**: enough real outcomes exist to measure accuracy and calibration by task class.
4. **REFLEX_CANDIDATE**: stable semantic judgement may replace a more expensive model on that bounded task class.
5. **DETERMINISTIC_COMPILATION_CANDIDATE**: >=100 outcomes by default, >=0.98 accuracy, <=0.02 calibration error, >=3 stable windows, no detected drift.
6. **DECOMPILE**: material drift promotes the task back to deeper cognition and revalidation.

No stage automatically edits production code or widens consequence authority.

## First intended UberBond experiments

Keep the first experiments read-only and reversible:

1. model/mechanism routing: deterministic code vs System-One vs frontier model;
2. Capability Genome shortlist ranking after deterministic eligibility filters;
3. evidence freshness / contradiction triage;
4. research-result relevance filtering before expensive synthesis;
5. outbound reply classification in shadow against existing deterministic/LLM labels, without changing sends;
6. browser next-step judgement in a local/sandbox task, without autonomous irreversible actions.

Do not begin with payments, deployment authorization, DNS, customer messages, account creation, KYC, or other irreversible/high-consequence effects.

## Truth boundary

This integration does **not** prove Jev is superior, cheaper in UberBond workloads, calibrated for UberBond tasks, or "mythical". Those are hypotheses to be tested against real task-specific outcomes.

The correct benchmark is:

`NO SEMANTIC MODEL vs CURRENT MECHANISM vs JEV vs OTHER SYSTEM-ONE/STRUCTURED DECISION SUPPLIERS`

measured on quality, calibration, latency, cost, failure modes, escalation quality and downstream economic/reality outcomes.
