# Frozen prospect effect lifecycle correction

The prior canonical preparation produced a new exact-history receipt and signed
unsubscribe token on every request. Both participate in the effect digest. The
owner correctly refused an authorization loop and authorized a narrow repair,
with no send under either earlier digest.

`POST /api/prospect-preflight` now supports `freezeEffect: true` for explicit
preparation. Only a complete, provider-permitted effect with protected identity,
existing compatible campaign, a bounded expiry and cap one is stored. The
snapshot and its original request/result are HMAC sealed in existing protected
settings; no database migration, provider, credential or infrastructure is added.
Equivalent preparation requests reuse the first snapshot transactionally.

For revalidation send only `{ "frozenEffectDigest": "<exact digest>" }` to the
same protected route. Payload overrides are rejected. Current policy, source
freshness, prework bytes, exact history/suppression and sender eligibility are
reevaluated through the existing canonical preflight. After a complete CLEAN
read, the original bound history receipt and signed unsubscribe bytes are reused.
The newly compiled participant digest must equal the stored digest. The original
expiry, body, footer, sender, route and cap never change. A failed read, history
hit, stale policy, missing campaign, owner identity change, sender hold, tampered
snapshot or material binding change refuses validation. Validation is read-only.

Preparation/validation do not mint send approval or queue/send a message. Existing
founder-signed approval, canary dispatch, suppression, reservations, idempotency,
one-use effect ledger and reconciliation remain separate gates. Cold-route
authority is unchanged. Snapshot bytes can be inspected in the protected result;
future exact send approval must refer to this frozen package, not rerun preparation.

Verification on the patch tree: 126/126 focused tests (112/112 on exact baseline
528d53c7fc0368c15213889d045acf43c38377f2 plus 14 new tests), zero focused
regressions. FROZEN-EFFECT-01..08 mutations killed. Syntax and diff checks passed.
HTTP integration proves protected access, durable persistence, stable replay,
byte-identical revalidation, refusal of overrides and zero provider effects.
The entire deterministic suite was not rerun; prior baseline failures are not
claimed resolved. Hosted CI is not claimed green. `npm run brain` reports corpus
freshness failure independently of this focused runtime correction.

Live proof and replacement digest will be recorded on the PR after exact-main
deployment. New spend $0; prospect sends 0; no older authorization is transferred.
