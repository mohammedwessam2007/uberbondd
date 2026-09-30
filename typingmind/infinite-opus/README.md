# UberMind Infinite Opus Gateway for TypingMind

Status: SOURCE READY / REQUIRES AUTHORIZED HOST DEPLOYMENT + PRIVATE GATEWAY TOKEN.

This folder is importable as a TypingMind plugin from its GitHub folder URL once the matching UberBond gateway endpoint is deployed.

## What it exposes

- `ubermind_gateway_status` — inference-free source/config readiness.
- `ubermind_plan_task` — inference-free routing/proof plan.

It does **not** expose:

- the OpenRouter runtime key;
- the UberBond admin token;
- direct provider inference;
- email/customer actions;
- deployments;
- payments;
- arbitrary URLs;
- arbitrary task-side effects.

## Private settings

TypingMind stores:

- `gatewayUrl` — authorized UberBond HTTPS host;
- `gatewayToken` — dedicated scoped `INFINITE_OPUS_GATEWAY_TOKEN`.

Do not reuse the OpenRouter key as the gateway token.

## Import path

TypingMind supports importing plugins from a GitHub repository/folder URL. Use this folder URL after the gateway is live:

`https://github.com/mohammedwessam2007/uberbondd/tree/main/typingmind/infinite-opus`

## Runtime path

```
TypingMind selected model
  -> UberMind plugin
  -> scoped /api/ubermind/v1/*
  -> task validation
  -> model-understanding registry
  -> exact/E0-E4 decision
  -> Jev shadow signal where eligible
  -> scout/challenger/strong/Crown plan
  -> Reality Court / proof ledger downstream
```

The plugin currently exposes **planning only**. Paid execution must remain behind the native runtime's durable budget reservations, current route admission, provider identity reconciliation and explicit owner authorization.

This is deliberate: the cockpit may ask the brain how to execute without gaining the power to spend or create side effects merely because a model called a tool.
