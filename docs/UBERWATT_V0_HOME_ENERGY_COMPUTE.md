# UberWatt v0 — Home Energy → Sovereign Compute

Status: **OBSERVATION-ONLY V0 / NO MAINS DIY / NO AUTOMATIC APPLIANCE CONTROL / NO CLAIM OF FREE API TOKENS**

UberWatt is a bounded home-energy organ beneath UberBond Compute Sovereignty.

Its first deployment is intentionally safe:

```
official utility meter display
  -> user-entered start/end readings
  -> measured household kWh interval
  -> 3+ comparable intervals
  -> robust baseline
  -> measured baseline delta
  -> energy-backed compute envelope
  -> ONLY AFTER a real local-model energy benchmark
  -> LOCAL_OWNED Compute Sovereignty offer
```

## Founder deployment assumptions

Initial household context supplied by the founder:

- apartment area: about 200 m²;
- four residents;
- three approximately 2-HP-class air conditioners;
- air conditioners often run across roughly an eight-hour sleep window;
- electricity bill commonly around 3,000 EGP/month.

These are configuration context, not measured kWh. UberWatt must never reverse-engineer exact consumption from the bill and present it as meter truth.

## Safety boundary

V0 requires no breaker-panel access.

Do not:

- remove a breaker-panel cover;
- remove or modify a utility meter cover;
- touch fixed mains wiring;
- place high-power fixed loads such as AC compressors, ovens or water heaters behind unverified consumer smart plugs;
- automatically switch cooling or other consequential loads.

V0 reads only information a normal resident can safely observe: the official meter display, timestamps, AC remote settings, occupancy and optional ambient conditions.

## Truth classes

### Measured interval

Two observed cumulative utility-meter readings establish a household-energy delta.

This proves total household electricity consumed during the interval. It does not identify individual appliance consumption.

### Comparable baseline

At least three measured intervals with the same period and comparable occupancy form the v0 baseline. Median consumption is used to reduce sensitivity to a single noisy night.

The baseline is a comparison reference, not causal proof.

### Energy-backed compute envelope

If a later comparable interval uses less electricity than the baseline, the positive difference may be recorded as a **measured baseline delta**.

The same joules may be expressed as an AI token-energy-equivalent range for intuition. That number is explicitly **not**:

- generated tokens;
- OpenAI or other provider credits;
- provider quota;
- a claim that the reduction was caused by UberWatt.

### Local compute promotion

Energy can enter UberBond's Compute Sovereignty allocator only after the exact local hardware + model revision has a measured inference benchmark containing:

- output tokens;
- energy consumed;
- model and revision;
- measurement timestamp;
- evidence reference.

UberWatt then estimates how many tokens that exact measured configuration could execute inside the observed energy envelope and creates a `LOCAL_OWNED` compute offer.

No benchmark = no local token capacity claim.

## Current iPad control surface

A private Google Sheet named **UberWatt v0 — Home Energy → Compute Ledger** is the v0 operator surface.

The first real observation requires:

1. before sleep, record time and the official cumulative kWh meter reading;
2. record AC set temperatures and occupants;
3. use the apartment normally;
4. in the morning, record time and the new cumulative kWh reading;
5. repeat for at least three comparable nights before establishing a baseline.

The spreadsheet's energy-equivalent fields remain physics comparisons. Actual local inference tokens remain zero until a real local model is installed and benchmarked.

## Repository implementation

- `src/uberwatt-energy-ledger.mjs`
- `tests/uberwatt-energy-ledger.test.mjs`

The module reuses `normalizeComputeOffer` from Compute Sovereignty so energy observations cannot bypass rights, provenance, capacity and task-class boundaries.
