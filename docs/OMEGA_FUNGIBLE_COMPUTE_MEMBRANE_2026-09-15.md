# Ω Fungible Compute Membrane

Date: 2026-09-15
Status: `RESEARCH_ARCHITECTURE + ZERO-EFFECT ROUTING CANARY / NOT_PRIVATE_COMPUTE_PROOF / NOT_FREE_COMPUTE`

## Thesis

UberBond should treat hardware as **replaceable muscle**, not as the locus of identity, memory, authority or trust.

The sovereign asset is:

`founder keys + private state + Cognitive Law IR + operator library + proof obligations + outcome memory`

Execution hardware is a market of interchangeable substrates. A lawful external machine may contribute computation without receiving founder authority, unrestricted private context, or the right to define whether its own result is correct.

This does not make compute free and does not remove the need for physical hardware. It attacks two different dependencies:

1. **hardware ownership dependency** — intelligence should survive if Wessam owns no datacenter;
2. **hardware trust dependency** — execution should be admissible on third-party hardware only when privacy and/or verifiability requirements are independently satisfied.

## Execution classes

Ω treats these as distinct backend families rather than pretending they have equivalent guarantees.

### LOCAL_TRUSTED

Owner-controlled local execution inside a declared local trust boundary.

Strength: simplest trust story and low protocol overhead.
Limit: local hardware availability and capacity.

### CONFIDENTIAL_TEE

Execution in a hardware-backed Trusted Execution Environment only after remote attestation satisfies a declared appraisal policy.

Current donor reality:
- Google Cloud documents confidential VM/GPU attestation and cryptographically verifiable attestation claims.
- NVIDIA confidential-computing GPUs can participate in attested environments.

Sources:
- https://docs.cloud.google.com/confidential-computing/confidential-vm/docs/attestation
- https://cloud.google.com/blog/products/identity-security/verifiable-trust-in-the-ai-era-whats-new-in-confidential-computing

Truth boundary: attestation establishes claims about environment identity/configuration. It is not by itself a mathematical proof that arbitrary application output is correct.

### FHE

Compute directly over encrypted values so an execution server need not receive plaintext inputs.

Current donor reality:
- a September 2026 open-source Llama-3-8B CKKS implementation reports 366.4 seconds for a 128-token-input full 32-layer server-side evaluation on one H100, despite a 4.51x speedup over its compared baseline.

Source:
- https://arxiv.org/abs/2609.12378

Truth boundary: this is evidence that the field is progressing, not evidence that FHE is currently an economical general backend for frontier interactive cognition.

### MPC / FSS

Partition private computation among multiple parties or use function-secret-sharing protocols so no single worker necessarily obtains complete private state.

This can be useful for narrow operators where communication and protocol overhead are acceptable.

Truth boundary: collusion assumptions, communication cost and protocol-specific leakage must be explicit.

### ZK_VERIFIABLE

An untrusted executor returns a result plus a cryptographic proof that an agreed computation was executed correctly, potentially without revealing protected witnesses.

ZKML research covers verifiable training, inference and testing, but proving large modern ML workloads remains expensive and highly system-dependent.

Donor:
- https://arxiv.org/abs/2502.18535

Truth boundary: a proof that program/model `M` was executed correctly does not prove `M` is scientifically correct, aligned with founder intent, or based on truthful inputs.

### UNTRUSTED_REEXECUTABLE

For public/non-secret deterministic jobs, an arbitrary worker may be acceptable when the result can be cheaply and independently reproduced or checked.

This is often the strongest practical sovereignty mechanism because deterministic verification can be dramatically cheaper than attempting to cryptographically protect every computation.

## Separation of privacy and correctness

Privacy and correctness are orthogonal.

- A TEE can protect data-in-use while still running buggy code.
- ZK proof can prove faithful execution of a bad specification.
- FHE can hide input while producing a semantically wrong result.
- deterministic reexecution can prove reproducibility while exposing public input by design.

Ω therefore stores privacy and verification requirements independently in every compiled job.

## Founder root law

`FOUNDER_ROOT_KEY_NEVER_DELEGATED`

An execution supplier cannot acquire authority merely because it performed expensive computation.

For founder-private jobs, secret release is permitted only through an independently satisfied local/protocol trust boundary. Routing metadata never itself creates that boundary.

## Cognitive sharding without cognitive amputation

A future Ω compiler can partition one mission into proof-carrying fragments:

- public retrieval;
- private-state lookup;
- homomorphic numeric operation;
- confidential model inference;
- public theorem proving;
- deterministic verification;
- local integration.

No external worker needs the entire founder context when the task can be decomposed soundly.

Every fragment carries:
- exact input contract;
- minimum data scope;
- expected output contract;
- dependency hashes;
- verification recipe;
- authority = none unless separately delegated.

## Compute market without cognitive market capture

The long-term target is for UberBond to choose execution substrates like a compiler chooses machine instructions.

A provider disappears:
- capability remains;
- execution target changes.

A GPU generation changes:
- capability remains;
- lowering pass changes.

A privacy mechanism improves:
- private fragments migrate to a better backend.

A cloud account disappears:
- private state and operator genome remain recoverable elsewhere.

This is hardware/provider sovereignty, not hardware absence.

## Proof-carrying outsourcing

The ideal outsourced unit is not `here is my brain, please run it`.

It is:

`minimal scoped job + exact code/model hash + privacy contract + verification contract -> external execution -> evidence/proof/attestation -> local settlement`

The executor supplies compute. UberBond supplies meaning and judgment.

## Relation to Ω Cognitive Transcompiler

The Fungible Compute Membrane is the final lowering layer:

`problem`
`-> semantic/causal IR`
`-> representation reduction`
`-> problem-class operator`
`-> executable law`
`-> privacy + verifier contract`
`-> substrate tournament`
`-> confidential/verifiable execution mode`
`-> independent settlement`

This makes the phrase **private intelligence** refer to ownership of state, keys, semantics and learning, rather than ownership of every transistor that ever participates in a calculation.

## Current canary

`src/omega-sovereign-execution-fabric.mjs` implements a zero-effect routing surface only.

It:
- separates data class from verification class;
- requires evidence references for candidate backend observations;
- refuses ordinary untrusted hardware for founder-private input;
- requires declared privacy modes for TEE/FHE/MPC/ZK classes;
- requires declared verification modes independently;
- respects observed cost/latency ceilings without granting spend authority;
- pins payload/backend/plan identities in a receipt-binding contract;
- explicitly refuses to treat field binding as validation of protocol cryptography.

The canary does not contact providers, attest hardware, release secrets, execute work, prove FHE/ZK correctness or spend money.

## 10/10 target property

The mature membrane should make these three statements simultaneously true:

1. **identity sovereignty** — losing every external compute provider does not delete UberBond's private intelligence state;
2. **execution portability** — a compiled capability can move between admissible substrates without changing its declared semantics beyond tolerance;
3. **trust minimization** — external computation receives only the minimum data and authority required, and accepted results have an independent verification/settlement path.

## Permanent truth boundary

- Physical computation still consumes hardware and energy.
- No cryptographic protocol creates unlimited free compute.
- TEE security depends on hardware/firmware/software and attestation policy.
- FHE/MPC/ZK can impose enormous overhead.
- Provider observations are not trust proofs unless independently verified.
- Correct execution is not equivalent to correct world knowledge.
- Privacy is not correctness.
- Correctness is not authority.
