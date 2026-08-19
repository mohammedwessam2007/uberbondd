import { createApproval } from '../kernel.mjs';

/**
 * Default purpose for a shadow approval when the caller doesn't need it to
 * cover a real outbound-shaped candidate (e.g. pure issuance/revocation/
 * expiry mechanism drills). Reality-shadow evaluation of real outbound
 * candidates instead issues approvals with the SAME purposes/operations/
 * effect classes a real approval would need (e.g. 'qualified-b2b-outreach'),
 * because the entire point is testing "would this real-shaped candidate be
 * authorized" -- an approval that could never match a real intent's purpose
 * couldn't meaningfully answer that question.
 *
 * The actual, load-bearing guarantee that a shadow approval can never become
 * production authority is NOT the purpose string. It's this: reality-shadow
 * evaluation is the ONLY code path in this codebase that ever calls
 * resolveShadowAuthorityContext() below, which is the ONLY code path that
 * reads omnia_v9_shadow_approval_registry, which is the ONLY table this
 * approval is registered in. No enforce/canary mode exists anywhere in this
 * codebase (config.mjs's ALLOWED_MODES is exactly {off, shadow, compare}),
 * and V9's decision -- in every mode that exists -- never gates the real
 * Gmail send call (src/pipeline.mjs ignores it entirely; see
 * tests/omnia-v9-integration-pipeline.test.mjs). So a shadow approval has no
 * path to production consequence today regardless of what purpose it
 * declares. If a real enforce path is ever built, it must be built with its
 * own approval resolver against real, non-shadow-registered approvals --
 * this module's registry-gated resolver is deliberately unsuited for reuse
 * there, which is itself part of the safety argument.
 */
export const SHADOW_APPROVAL_PURPOSE = 'reality-shadow-validation';

export class ShadowApprovalError extends Error {
  constructor(message, code = 'SHADOW_APPROVAL_ERROR', detail = {}) {
    super(message);
    this.name = 'ShadowApprovalError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Issues a real, correctly-signed OWNER_APPROVAL object (frozen P0/P1
 * shape, unmodified) and registers it as shadow-only. Persists via the
 * real, frozen OmniaV9ProofStore.putObject -- the same content-addressed,
 * immutable store used for every other V9 proof object. `purposes` defaults
 * to [SHADOW_APPROVAL_PURPOSE] but callers may pass real-shaped purposes
 * (e.g. ['qualified-b2b-outreach']) so this approval can meaningfully cover
 * real outbound-shaped reality-shadow candidates -- see the module-level
 * comment above for why that does not weaken the shadow-only guarantee.
 */
export async function issueShadowApproval({
  proofStore, pool, signer, approvalId, issuerId, keyId, tenantId,
  actorIds, operations, resourcePrefixes, effectClasses, purposes = [SHADOW_APPROVAL_PURPOSE],
  maxBlastRadius, maxCostUsd, maxUses, notBefore, expiresAt, issuedAt
}) {
  if (!proofStore || typeof proofStore.putObject !== 'function') throw new ShadowApprovalError('proofStore required', 'CONFIG');
  if (!pool || typeof pool.query !== 'function') throw new ShadowApprovalError('pool required', 'CONFIG');
  if (typeof signer !== 'function') throw new ShadowApprovalError('signer required', 'CONFIG');

  const approval = createApproval({
    approvalId, issuerId, keyId, tenantId, actorIds, operations, resourcePrefixes,
    purposes,
    effectClasses, maxBlastRadius, maxCostUsd, maxUses, notBefore, expiresAt, issuedAt
  }, signer);

  const stored = await proofStore.putObject({
    objectType: 'OWNER_APPROVAL', objectId: approval.approvalId, tenantId: approval.tenantId,
    digest: approval.approvalDigest, data: approval
  });

  const purposeRestriction = [...approval.purposes].sort().join(',');
  const inserted = await pool.query(
    `INSERT INTO omnia_v9_shadow_approval_registry(approval_id, tenant_id, purpose_restriction)
     VALUES ($1, $2, $3)
     ON CONFLICT (approval_id) DO NOTHING
     RETURNING approval_id`,
    [approval.approvalId, approval.tenantId, purposeRestriction]
  );
  if (!inserted.rows?.length) {
    const existing = await pool.query(
      `SELECT tenant_id, purpose_restriction FROM omnia_v9_shadow_approval_registry WHERE approval_id = $1`,
      [approval.approvalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.tenant_id !== approval.tenantId || row.purpose_restriction !== purposeRestriction) {
      throw new ShadowApprovalError('shadow approval registry conflict', 'REGISTRY_CONFLICT', { approvalId: approval.approvalId });
    }
  }

  return { approval, objectStored: stored.inserted, registered: Boolean(inserted.rows?.length) };
}

/**
 * Revokes a shadow approval via the real, frozen, generic P1 revocation
 * mechanism (OmniaV9ProofStore.revoke against target OWNER_APPROVAL). Fails
 * closed if the approval is not registered as shadow-only for this tenant --
 * this function must never be usable to revoke an approval it wasn't
 * verifiably issued for.
 */
export async function revokeShadowApproval({ proofStore, pool, approvalId, tenantId, revocationId, reason, now = new Date() }) {
  const registryRow = await pool.query(
    `SELECT tenant_id FROM omnia_v9_shadow_approval_registry WHERE approval_id = $1`,
    [approvalId]
  );
  const row = registryRow.rows?.[0];
  if (!row) throw new ShadowApprovalError('approval is not a registered shadow approval', 'NOT_SHADOW_APPROVAL', { approvalId });
  if (row.tenant_id !== tenantId) throw new ShadowApprovalError('tenant does not match shadow approval registration', 'TENANT_MISMATCH', { approvalId });
  return proofStore.revoke({ targetType: 'OWNER_APPROVAL', targetId: approvalId, revocationId, tenantId, reason, revokedAt: now.toISOString() });
}

/**
 * Resolves the complete real authority context for reality-shadow
 * evaluation of one tenant: every registered shadow approval, its real
 * usage counters (from the frozen omnia_v9_approval_usage table), and the
 * set of approval IDs the frozen P1 revocation table marks revoked. This is
 * the ONLY approval source reality-shadow evaluation uses -- there is no
 * code path in this mission that also accepts a non-shadow-registered
 * approval, so nothing resolved here can be mistaken for production
 * authority. usageResolver is synchronous because admitAction() (frozen
 * kernel.mjs) calls context.usageResolver synchronously; this function
 * does the required async DB reads up front, before admission runs.
 */
export async function resolveShadowAuthorityContext({ pool, proofStore, tenantId, now = new Date() }) {
  const registryResult = await pool.query(
    `SELECT r.approval_id, o.data
     FROM omnia_v9_shadow_approval_registry r
     JOIN omnia_v9_objects o ON o.object_type = 'OWNER_APPROVAL' AND o.object_id = r.approval_id
     WHERE r.tenant_id = $1 AND r.shadow_only = true`,
    [tenantId]
  );
  const approvals = registryResult.rows.map(row => row.data);

  const usageByApprovalId = new Map();
  const revokedApprovalIds = new Set();
  for (const approval of approvals) {
    const usage = await proofStore.getApprovalUsage(approval.approvalId);
    usageByApprovalId.set(approval.approvalId, usage ? { uses: usage.uses, costUsd: usage.costUsd } : { uses: 0, costUsd: 0 });
    const revoked = await proofStore.isRevoked('OWNER_APPROVAL', approval.approvalId);
    if (revoked) revokedApprovalIds.add(approval.approvalId);
  }

  return {
    approvals,
    usageResolver: approvalId => usageByApprovalId.get(approvalId) || { uses: 0, costUsd: 0 },
    revokedApprovalIds,
    resolvedAt: now.toISOString()
  };
}
