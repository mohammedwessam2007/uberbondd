# UberWatt v0

Status: **OBSERVATION-ONLY HOME ENERGY / COMPUTE-BUDGET CANARY**

UberWatt turns verified household electricity observations into an evidence-bound compute budget without claiming that consumed or saved electricity is automatically API quota or actual local-model tokens.

## v0 safety boundary

UberWatt v0 requires no access to fixed wiring.

Allowed:
- read the normal utility meter display;
- record timestamps, cumulative kWh, occupancy and appliance settings;
- use ordinary user-facing controls such as an AC remote;
- record plug-load observations from properly rated consumer devices.

Not part of v0:
- opening a breaker panel or utility meter;
- modifying fixed mains wiring;
- attaching homemade devices to AC, oven, heater or other high-current circuits;
- bypassing meter protections;
- automatic switching of household loads.

## Tonight protocol

1. Before sleep, record the utility meter's cumulative kWh and timestamp.
2. Record occupants and the three AC setpoints.
3. Use the apartment normally.
4. In the morning, record the meter and timestamp again.
5. Compile the interval with `compileEnergyInterval`.
6. Repeat comparable sleep windows before establishing a baseline.
7. Until a baseline exists, `compileVerifiedSavings` returns `UBERWATT_BASELINE_NOT_ESTABLISHED` and does not invent savings.

## Truth ladder

`meter difference -> observed interval kWh`

`comparable baseline + observed interval -> baseline-relative saved kWh`

`saved kWh + sourced joules/token assumption -> energy-equivalent token range`

`runtime token counter + measured inference energy -> actual local inference receipt`

Only the final line may be called actual local tokens.

## Relation to Compute Sovereignty

UberWatt is upstream evidence for physical compute economics. It does not create compute rights, provider quota, model availability or spend authority.

A future local node can feed `compileMeasuredLocalInference` with:
- model identity and revision;
- measured input/output token counters;
- measured energy;
- measured duration;
- evidence reference.

Those receipts can then inform Compute Sovereignty routing and capacity economics without converting physics estimates into false runtime capacity.

## Founder-facing v0 surface

The private Google Sheet `UberWatt v0 — Home Energy to Compute Ledger` is the zero-hardware capture surface for the first measurements. Repository code remains the truth-preserving calculation kernel.


## Comparable-baseline compiler

Repository v0 now includes `compileComparableBaseline`.

It refuses to establish a baseline until at least three valid observed intervals exist. The intervals must share the same period class and, when occupancy is recorded, the same occupant count. The compiler uses the median measured kWh so one abnormal night cannot dominate the reference.

The resulting `baselineKwh` and `baselineRef` can be passed to `compileVerifiedSavings`.

This remains a baseline-relative counterfactual, not causal proof. Weather and unrecorded household behavior can still explain part of a delta.

## Energy-backed local compute bridge

`compileEnergyBackedLocalComputeOffer` connects UberWatt to the existing Compute Sovereignty allocator without converting theoretical token-energy equivalents into fictional runtime capacity.

Admission requires all of the following:

1. a positive `compileEnergyEquivalentCompute` result;
2. a real `compileMeasuredLocalInference` receipt from the exact local model/hardware path;
3. a supplied benchmark verification timestamp;
4. task classes, context capacity, quality and reliability sufficient for `normalizeComputeOffer`.

The bridge calculates measured output-tokens-per-kWh from the local benchmark and applies that rate to the energy envelope. It then emits a `LOCAL_OWNED` Compute Sovereignty offer.

The offer is still an estimate of executable capacity, not pre-generated tokens. Hardware amortization, model settings, context length, thermal throttling and other system costs remain outside the simple energy envelope unless separately measured.


## MAX SAFE TOKENS mode

`compileMaxSafeTokenPlan` is the aggressive-compute policy for UberWatt.

The objective is:

> maximize measured local output-token capacity from the verified energy envelope, subject to sourced electrical, thermal, quality and reliability constraints.

It deliberately does **not** maximize household electrical load.

### Admission requirements

A MAX SAFE TOKENS plan remains blocked until all of the following exist:

- a positive energy envelope produced by UberWatt;
- at least one real local-inference benchmark;
- measured peak wall power for that benchmark;
- measured peak hardware temperature for that benchmark;
- a sourced power ceiling for the actual compute node/power path;
- a sourced thermal stop for the actual hardware;
- benchmark verification time and evidence reference;
- task-class, quality and reliability requirements.

UberWatt does not invent a safe socket/circuit wattage. A missing power ceiling is a hard refusal.

### Energy reserve

Default reserve: **20% of the observed energy envelope**.

The reserve covers measurement error, household variation and unmodelled overhead while the system is young. It may be tightened only after evidence supports a smaller reserve.

### Optimization

Each benchmark candidate is evaluated using real measured:

`output tokens / kWh`

Candidates outside the sourced power or thermal envelope are rejected even when they are faster.

For each eligible candidate, UberWatt computes how much of the spendable energy can actually be consumed during the planning window at that candidate's measured power, then selects the candidate with the highest resulting output-token capacity.

### Runtime fail-closed gate

`evaluateMaxSafeTokenRuntime` emits only one of:

- `RUN_WITHIN_PLAN`
- `STOP_COMPUTE`

Compute authorization stops when:

- power telemetry is missing or stale;
- temperature telemetry is missing or stale;
- observed wall power reaches the sourced ceiling;
- observed hardware temperature reaches the sourced thermal stop;
- the spendable energy budget is exhausted.

The signal is a compute policy, **not a mains switch**. UberWatt does not open circuits or discover electrical limits by overloading them.

### Same-bill claim boundary

A measured household energy gap can fund a compute budget, but UberWatt does not promise identical electricity bills. Weather, household behavior, computer heat, air-conditioning response, tariffs and system overhead can change the result. Same-bill performance must be demonstrated by whole-home meter evidence.
