# UberWarm 1–6: Protected one-shot runtime composition

Date: 2026-10-19 (Africa/Cairo). **Truth class: tested source, not a production outgoing send.**

## Engineering defect closed

The earlier repository contained the exact immutable batch compiler, independently verified sender-health and recipient-consent suppliers, authorized Winnr HTTPS bridge, HMAC owner approval checker and real PostgreSQL one-shot ledger, but no source component assembled those production primitives into a single callable operation. A future operator would otherwise need to stitch together eight trusted reader callbacks, credentials, DB store, bridge and executor manually. `src/uberwarm2-authorized-one-shot-runtime.mjs` now assembles the previously existing implementations without weakening any individual checks.

`createUberWarm2AuthorizedOneShotRuntime` is **inert by default**. It requires an explicit protected-process `operatorExecutionEnabled=true`, the real PostgreSQL primary query/connect adapter, authenticated Winnr client, exact sender and user ID, an externally held approval-verification key, a trusted clock, and six real, independent **trusted reader callbacks** for sender-specific transport, local holds, DNS alignment, authenticated recipient consent, receive readiness and suppression. Missing dependencies produce a typed `UBERWARM2_ONE_SHOT_NOT_AUTHORIZED` result, no provider request, and no database claim. `ready:false,sendAuthority:NONE` are source assembly attributes, not signs of live permission.

When the operator later supplies an exact signed approval for a freshly compiled consent-bound batch, `executeApprovedOneShot` invokes the original `executeUberWarm2SeedProbe` with `createUberWarm2PgLedger`, the existing protected Winnr runtime, and `createUberWarm2WinnrHttpsSeedBridge`. The hardened executor itself verifies unexpired signed approval and latest post-await sender/recipient evidence before and after atomic reservation, consumes the single-use send capability, records accepted/unknown provider outcome, and never retries an uncertain send. The transport does not enable Winnr paid warming, send bulk messages, generate replies, or claim placement.

**Important:** A caller-supplied `signed:true` in a fixture is not evidence. Production callbacks MUST cryptographically verify original source authenticity against trusted provider/recipient/policy custody before returning a positive row. User chat text cannot be auto-signed as a vendor or recipient attestation, and the HMAC key is for verifying an owner-issued approval, never issuing one from the runner. Neither the source factory nor tests collect credentials or send live mail. This source cannot auto-activate via the existing Railway five-minute **read-only** monitor; no new outgoing cron has been configured or deployed.

## Proof

- New `tests/uberwarm2-authorized-one-shot-runtime.test.mjs`: **5 pass / 0 fail** using isolated fixture-backed providers and a SQL-compatible in-memory test pool. An explicit, fixture-signed and opted-in single message is submitted exactly once through the mock HTTPS adapter, with provider receipt and ledger finalize; a repeated attempt does not submit again.
- Missing operator enablement, a missing independent consent reader, unsigned approval, genuine receipt withdrawal or current sender quarantine deny before any mocked provider write.
- Full `node --test tests/uberwarm2-*.test.mjs`: **244 total, 242 pass, 0 fail, 2 skip**. `npm ci --ignore-scripts --no-audit --no-fund` passed (21 packages), isolated worktree.
- No secret, purchased warming network, new API key, customer campaign, external send, or deployment mutation was introduced by these tests.

## Genuine activation next

A real owner-controlled receiving account must affirm exactly one message and provide verifiable consent evidence, and a sender-specific current transport/DNS/hold proof and authentic HMAC approval must be supplied by the appropriate signed trust readers. The existing first-party Gmail connected recipient account is accessible for reading, but no affirmative consent reply was present at last connected check. The existing Railway monitor is **active and read-only** and cannot be called a warmed sending fleet. Actual provider Message-ID and independently read Inbox/Spam placement will be separate evidence AFTER a legitimate real send; no general reputation gain is claimed from one self-test.
