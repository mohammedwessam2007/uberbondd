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
