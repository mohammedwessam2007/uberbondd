import { createApproval } from '../kernel.mjs';

/**
 * The one purpose value every shadow-only approval is forced to carry.
 * No real UberBond campaign uses this purpose (real outbound intents use
 * 'qualified-b2b-outreach' -- see integrations/outbound-admission.mjs), so
 * even if a shadow approval were somehow handed to a real admission path,
 * approvalCoversIntent()'s scope:purpose check (frozen kernel.mjs) would
 * reject it. This is belt #1. Belt #2 is the registry below: reality-shadow
 * evaluation only ever consults approvals that are BOTH resolvable from the
 * real proof store AND present in omnia_v9_shadow_approval_registry --
 * there is no code path in this mission that resolves approvals any other
 * way, so a shadow approval can never be read as production authority.
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
 * immutable store used for every other V9 proof object. Never grants any
 * production capability: purposes is always forced to
 * SHADOW_APPROVAL_PURPOSE regardless of what the caller requests.
 */
export async function issueShadowApproval({
  proofStore, pool, signer, approvalId, issuerId, keyId, tenantId,
  actorIds, operations, resourcePrefixes, effectClasses,
  maxBlastRadius, maxCostUsd, maxUses, notBefore, expiresAt, issuedAt
}) {
  if (!proofStore || typeof proofStore.putObject !== 'function') throw new ShadowApprovalError('proofStore required', 'CONFIG');
  if (!pool || typeof pool.query !== 'function') throw new ShadowApprovalError('pool required', 'CONFIG');
  if (typeof signer !== 'function') throw new ShadowApprovalError('signer required', 'CONFIG');

  const approval = createApproval({
    approvalId, issuerId, keyId, tenantId, actorIds, operations, resourcePrefixes,
    purposes: [SHADOW_APPROVAL_PURPOSE],
    effectClasses, maxBlastRadius, maxCostUsd, maxUses, notBefore, expiresAt, issuedAt
  }, signer);

  const stored = await proofStore.putObject({
    objectType: 'OWNER_APPROVAL', objectId: approval.approvalId, tenantId: approval.tenantId,
    digest: approval.approvalDigest, data: approval
  });

  const inserted = await pool.query(
    `INSERT INTO omnia_v9_shadow_approval_registry(approval_id, tenant_id, purpose_restriction)
     VALUES ($1, $2, $3)
     ON CONFLICT (approval_id) DO NOTHING
     RETURNING approval_id`,
    [approval.approvalId, approval.tenantId, SHADOW_APPROVAL_PURPOSE]
  );
  if (!inserted.rows?.length) {
    const existing = await pool.query(
      `SELECT tenant_id, purpose_restriction FROM omnia_v9_shadow_approval_registry WHERE approval_id = $1`,
      [approval.approvalId]
    );
    const row = existing.rows?.[0];
    if (!row || row.tenant_id !== approval.tenantId || row.purpose_restriction !== SHADOW_APPROVAL_PURPOSE) {
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
