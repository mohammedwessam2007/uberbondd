# UberBond Substrate Liberation Canon

Status: **FOUNDER_SPEC promoted into bounded research/planning source foundation**

UberBond's identity must not be defined by a 2026 processor, GPU vendor, cloud, operating system, model runtime, device category, or computational paradigm.

The Substrate Liberation principle is:

> **Define the required physical transformation first. Choose or invent the substrate second.**

A task should therefore be representable in terms such as inputs, outputs, maximum latency, energy budget, minimum reliability, portability requirement and environmental constraints before the system decides that silicon, photonics, neuromorphic hardware, analog computation, distributed ambient infrastructure or any other substrate is appropriate.

## Candidate classes

The current source vocabulary includes `DIGITAL_SILICON`, `NEUROMORPHIC`, `PHOTONIC`, `ANALOG`, `QUANTUM`, `MOLECULAR`, `BIOHYBRID`, `DISTRIBUTED_AMBIENT`, `OTHER` and `UNKNOWN`.

These are search classes, not claims of equivalence or deployment readiness. Some classes may be unsuitable for a given function; some may remain research-only for years; future Ontogenesis may create categories that do not fit this list.

## Evidence ladder

Candidate states are explicitly separated:

`HYPOTHESIS -> LAB_DEMONSTRATED -> BENCHMARKED -> DEPLOYABLE -> OBSERVED_IN_UBERBOND`

Anything above hypothesis must carry evidence references. An estimated score is never physical proof.

## Tournament

`buildSubstrateTournament()` compares candidates against the same functional requirement. The comparison includes latency, energy, reliability, portability, compatibility, maturity, reversibility and evidence maturity.

A tournament containing only one physical paradigm emits a **substrate monoculture warning**. This does not mean an exotic alternative must win. It means UberBond has not actually tested the assumption that the current substrate class is necessary.

## Migration

A substrate migration plan requires explicit reversible checkpoints, parallel validation and rollback. Identity, memory, provenance and the founder relation must survive substrate replacement.

The planner cannot purchase hardware, fabricate devices, deploy systems, conduct physical experiments, or perform biological integration. Those require separate authority, safety and reality evidence.

## Executable foundation

- module: `src/substrate-liberation.mjs`
- tests: `tests/substrate-liberation.test.mjs`

This is the first source-level physical-search organ for the founder's larger idea that hardware should become a replaceable implementation detail rather than UberBond's permanent prison.
