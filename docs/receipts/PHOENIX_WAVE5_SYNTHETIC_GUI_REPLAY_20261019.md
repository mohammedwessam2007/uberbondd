# PHOENIX Wave 5: Deterministic synthetic GUI recording and replay

Date: 2026-10-19. Truth: LOCAL VIRTUAL APP EXECUTION AND ADVERSARIAL TESTS, NOT REAL BROWSER OR CUSTOMER EFFECTS.

Original source: `phoenix-wave5-0001`, `PHOENIX_WAVE5_TRANSCENDENT_AUTOMATION_204_2026-10-17.json`, pointer `/candidates/0`.
Original acceptance: "A synthetic app recording replays twice with no generative-model calls and halts on a changed target."

The first-party `src/phoenix-synthetic-gui-replay.mjs` compiles bounded synthetic textbox/button actions to typed, stable field-identity recordings, replaces typed inputs with SHA-256 digests, and replays them entirely in memory. Replay produces only a virtual state digest, a step count and explicit modelCalls=0, realBrowserEffects=0. It rejects unknown commands, altered field labels/roles, missing or wrong targets, oversized input and source-value injections.

`node scripts/phoenix-cos-operator.mjs gui-record '<synthetic JSON>'`
and
`node scripts/phoenix-cos-operator.mjs gui-replay '<compiled JSON>'`
use the existing bounded CoS terminal gateway.

Four direct tests cover repeatable two-run identity, changed-target denial, hostile step/role/oversized input denial, and true CoS command invocation. This is *not* automation of a live browser page or authorization to click, message, deploy, or mutate an account. Real UI integration needs separate browser target validation, effect permissions, human approvals, rollback, and real provider receipts. The original 1,560 research designs remain intact.
