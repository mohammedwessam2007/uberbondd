# Avengers Operator Quickstart

The Avengers runtime is disabled by evidence, not by a global magical on-switch. A model/tool becomes executable only when the exact roster entry proves the required identity, rights, benchmark and runtime state.

## 1. Discover local model servers without activation

```bash
npm run avengers:doctor -- --discover-local
```

This only observes bounded loopback model-list endpoints. It does not download models, execute arbitrary model code, or activate discovered models.

## 2. Configure exact profiles

Use `config/avengers-arsenal.example.json` as a shape reference. Prefer protected runtime configuration through `AVENGERS_MODEL_PROFILES_JSON` rather than committing machine-specific profiles.

Each executable profile needs exact model identity, revision/digest evidence, rights evidence, pricing/runtime-cost evidence, task classes, roles, benchmark evidence, `enabled: true`, `activationApproved: true`, and `inferenceProbeApproved: true`.

Remote HTTPS profiles additionally require explicit remote approval evidence.

Never place API keys in profile JSON. Use `apiKeyEnv` to name a protected environment variable.

## 3. Prove callability

```bash
npm run avengers:doctor -- --probe-inference --discover-local
```

A listed model remains `MODEL_LISTED_NOT_INFERENCE_PROVEN` until the approved inference probe succeeds with the configured model identity.

## 4. Compile a squad

```bash
npm run avengers:plan
```

The planner consumes the doctor's exact secret-free resolved roster and uses UberBond's canonical evidence-aware model router. Stale or insufficient benchmark evidence blocks exploitation.

## 5. Inspect without provider calls

```bash
npm run avengers:tick:dry
```

## 6. Execute one bounded internal cycle

```bash
npm run avengers:tick
```

Current execution authority is limited to internal `NONE` / `LOCAL_PREPARATION` work. Provider calls are recorded. Business-effect authority remains `NONE`.

## Failure behavior

If a primary runtime fails, Avengers may use only fallbacks that were already present in the evidence-backed plan. A failure cannot add a provider, endpoint, model, tool, credential, permission or consequence class.

If all fallbacks fail, the node stops and the receipt records the attempts.

## Future models and tools

Gamechanger, Open Model Universe, Capability Genome and the N+1 orchestration frontier may discover replacements. Discovery produces evaluation candidates, never automatic activation. New candidates must earn their place through the same evidence and authority gates.
