# OMNIA V9 Shadow Approval Spec

Implementation: [`src/omnia-v9/integrations/shadow-approval.mjs`](../../src/omnia-v9/integrations/shadow-approval.mjs) + [`migrations/009_omnia_v9_shadow_approval_registry.sql`](../../migrations/009_omnia_v9_shadow_approval_registry.sql). Tests: [`tests/omnia-v9-shadow-approval.test.mjs`](../../tests/omnia-v9-shadow-approval.test.mjs), [`tests/omnia-v9-reality-shadow-failure-drills.test.mjs`](../../tests/omnia-v9-reality-shadow-failure-drills.test.mjs).

## Purpose

This mission needed the smallest safe owner-approval issuance mechanism to test V9's bounded-authority model against a real database — not a general admin platform, and structurally incapable of authorizing a real send.

## What a shadow approval is

A shadow approval is a real, correctly-signed `OWNER_APPROVAL` object — the exact frozen P0/P1 shape defined by `APPROVAL_SPEC` in [`src/omnia-v9/schema.mjs`](../../src/omnia-v9/schema.mjs), unmodified — persisted through the real, frozen [`OmniaV9ProofStore.putObject()`](../../src/omnia-v9/proof-store.mjs). It carries no extra fields; `APPROVAL_SPEC` is a closed record (unknown fields are rejected), so there is no way to bolt an ad hoc `shadowOnly` flag onto the approval object itself without violating the frozen schema — and this spec deliberately does not attempt to.

Instead, "shadow-only" is a **registry-membership property**, recorded in a new, additive, non-frozen table:

```sql
CREATE TABLE omnia_v9_shadow_approval_registry (
  approval_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  shadow_only boolean NOT NULL DEFAULT true CHECK (shadow_only = true),
  purpose_restriction text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now()
);
```

The `CHECK (shadow_only = true)` constraint means this column can only ever be `true` — a row can be deleted, but never flipped to mean something else. The table carries **no operation, resource, effect-class, cost, or blast-radius columns** — it cannot grant anything by itself; it only ever restricts.

## Immutable, content-bound fields (per this mission's requirement)

Every shadow approval, like every `OWNER_APPROVAL`, carries: approval ID, owner identity (`issuerId`), tenant, allowed operations, allowed resource prefixes, purpose(s), effect classes, `maxBlastRadius`, `maxCostUsd`, `maxUses`, `notBefore`/`expiresAt`/`issuedAt`, and an Ed25519 signature over a canonical digest of every other field (`approvalDigest` + `signature`, frozen `createApproval()`/`verifyApproval()`). Mutating any field after signing invalidates the digest and fails `verifyApproval()` — proven directly in the frozen closure suite and re-exercised this mission's `mutated-after-signing-*` scenarios (see [`V9_REAL_DECISION_QUALITY_REPORT.md`](./V9_REAL_DECISION_QUALITY_REPORT.md)).

## Why a shadow approval cannot become production authority

Not because of its `purposes` field — `issueShadowApproval()` lets callers pass real-shaped purposes (e.g. `qualified-b2b-outreach`) so a shadow approval can meaningfully cover a real outbound-shaped candidate for testing. **Structural impossibility instead comes from three independent facts, all verified this mission:**

1. **Registry-gated resolution.** [`resolveShadowAuthorityContext()`](../../src/omnia-v9/integrations/shadow-approval.mjs) is the *only* function in this codebase that reads `omnia_v9_shadow_approval_registry`, and it is the *only* approval-resolution path [`buildRealityShadowHook()`](../../src/omnia-v9/integrations/reality-shadow-evaluator.mjs) ever calls. No other code path in this repository consults this table.
2. **No enforce/canary mode exists.** `OMNIA_V9_MODE`'s `ALLOWED_MODES` (frozen-adjacent, [`src/omnia-v9/integrations/config.mjs`](../../src/omnia-v9/integrations/config.mjs)) is exactly `{off, shadow, compare}`. There is no code anywhere that would let a V9 decision — shadow-approval-backed or otherwise — gate a real send; `src/pipeline.mjs` ignores V9's decision entirely (verified: `tests/omnia-v9-integration-pipeline.test.mjs`, "a V9 DENY decision never blocks the send").
3. **Content-addressed immutability.** Even if a shadow approval were somehow read by a future real-authority resolver, `omnia_v9_objects`' `(object_type, object_id)` primary key plus digest-recompute check on every `putObject()` call means its scope (operations, resource prefixes, cost, blast radius, uses) is exactly what was signed — it cannot silently expand.

If a real `enforce` path is ever built, it must use its own approval resolver against real, non-shadow-registered approvals; this module's registry-gated resolver is deliberately unsuited for reuse there, and that unsuitability is part of the safety argument, not an oversight.

## Issuance

```js
await issueShadowApproval({
  proofStore, pool, signer, approvalId, issuerId, keyId, tenantId,
  actorIds, operations, resourcePrefixes, effectClasses,
  purposes,           // defaults to ['reality-shadow-validation']; callers may pass real-shaped purposes
  maxBlastRadius, maxCostUsd, maxUses, notBefore, expiresAt, issuedAt
});
```

Persists the signed approval object via the frozen proof store, then registers it in the shadow registry inside the same logical operation. A `putObject()` failure (malformed input) leaves no partial object row and no partial registry row — verified in `tests/omnia-v9-reality-shadow-failure-drills.test.mjs`.

## Reuse

One approval, `maxUses: 3`, evaluated against 4 real outbound-shaped candidates through real Cedar and real PostgreSQL: `[ALLOW, ALLOW, ALLOW, REVIEW]`. Usage accounting is atomic — `reserveAuthority()` (frozen P1) updates `omnia_v9_approval_usage` inside the same transaction as the reservation, so concurrent evaluators cannot double-spend the shared use budget (proven by the frozen closure suite's concurrency races, re-run this mission against a real PostgreSQL 16 server: 352/352 tests pass, 0 skipped).

## Revocation and expiry

Full drill detail: [`V9_REVOCATION_EXPIRY_DRILL.md`](./V9_REVOCATION_EXPIRY_DRILL.md).

## What this is explicitly not

Not a general admin platform — there is no UI, no bulk operations, no role model beyond `issuerId`. Not a substitute for a real, non-shadow approval system, which does not exist in this codebase and was not built this mission. Not capable, under any code path that exists today, of authorizing a real external action.
