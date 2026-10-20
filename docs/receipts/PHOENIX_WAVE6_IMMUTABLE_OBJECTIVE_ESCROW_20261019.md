# PHOENIX Wave 6: Immutable Evaluator Objective Escrow

Date: 2026-10-19
Truth class: **FIRST-PARTY LOCAL CRYPTOGRAPHIC VERIFIER + SYNTHETIC HOSTILE TESTS**.

## Original source and acceptance

Original ID: `phoenix-wave6-0001`, source
`artifacts/research/phoenix-ten-wave-intake/original-genomes/PHOENIX_WAVE6_PROOF_CARRYING_EVOLUTION_120_2026-10-17.json`,
pointer `/candidates/0`.

Original title: **Immutable objective escrow**.
Original acceptance: **Agent edits objective file; signed evaluation definition must remain byte-identical**.

The source is one proposed design of the 1,560 recovered PHOENIX designs (Waves 3–10). Its research source does not by itself establish an implementation.

## Implementation

The first-party `src/phoenix-objective-escrow.mjs` verifies an Ed25519 attestation over a byte-identity SHA256 digest of an objective. It requires the trusted public-key fingerprint to be supplied independently by the calling runtime; it does not accept an unpinned key, mint a signer or load a private key. The unchanged current definition passes; a byte-changed definition fails even when its original signature is valid. The verifier has bounded 1MiB text limits and a fail-closed path on unknown keys, signatures, types and expected hash mismatches.

`node scripts/phoenix-cos-operator.mjs objective-escrow-verify '<bounded JSON>'` runs the local verifier through the CoS terminal without adding external effects. Never put signer private keys or secret tokens into the JSON or ChatGPT.

## Evidence

- 5 source-level tests passed: real Ed25519 positive verification, mutated definition rejection, forged/substituted signer rejection, mismatched digest/signature denial, input size/format denial, and an actual CoS gateway invocation. (Several hostile assertions share individual tests.)
- The combined targeted suite of escrow and CoS gateway recorded 12 passing tests, zero failures.
- No external model provider, production runtime, laboratory benchmark or independent organization attested the signer. The trusted key fingerprint is only as authoritative as its separate provision and custody.
- This implements a bounded local software realization of the original acceptance pattern. It is **not** external security certification, a production admission, empirical self-improvement or completed Wave 6.

## Dependencies and next gate

Parent CoS operator: PR #1498, branch `feat/phoenix-cos-capability-bridge-20261019`, exact pinned starting commit `5a91751f80a332ab005abc6ded6c3948d614aaec`.
This Wave 6 branch should be rebased/merged after parent release gates, not force pushed into current main or allowed to overwrite any concurrent worktree. A future live deployment needs separately pinned signer custody, independent byte-level contract receipt, negative tests in the actual evaluator, and runtime acceptance verification.

Founder idea corpus IDs 0001–0890, all 1,560 original proposals and their provenance remain preserved; no supplier install, messages, spend, credentials, payment rail or production mutation was performed.

## Wave 9 reuse/acceptance boundary

The dependent branch also connects the existing CoS fail-closed unsupported-tool response to original `phoenix-wave9-0001`, **Unsupported-action boundary**: when a requested atom is not actually callable, `invoke` returns `capabilityState:MISSING_CAPABILITY` and zero external effects. Source-linked hostile tests confirm no guessed substitute or unauthorized customer operation. This is a local behavior proof, not an unrestricted general action broker.
