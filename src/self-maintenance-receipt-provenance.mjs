import crypto from 'node:crypto';

export const SELF_MAINTENANCE_RECEIPT_PROVENANCE_POLICY_VERSION = 'self-maintenance-receipt-provenance-1.0.0';

const issued = new WeakMap();

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: SELF_MAINTENANCE_RECEIPT_PROVENANCE_POLICY_VERSION,
    status: 'RECEIPT_UNTRUSTED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))]
  };
}

/**
 * Only the successful verifier path should call this function. The WeakMap
 * binding deliberately does not survive serialization, structuredClone or a
 * process restart: copied receipts remain audit data but lose authority to
 * trigger repository promotion.
 */
export function issueVerifiedSelfMaintenanceReceipt(core = {}) {
  const identity = {
    policyVersion: text(core.policyVersion, 160),
    taskId: text(core.taskId, 160),
    changeSetId: text(core.changeSetId, 200),
    baseRevision: text(core.baseRevision, 160),
    verifiedFingerprint: text(core.verifiedFingerprint, 160),
    verificationReceiptId: text(core.verificationReceiptId, 240),
    verifiedAt: text(core.verifiedAt, 80)
  };
  if (!identity.policyVersion || !identity.taskId || !identity.changeSetId || !/^[a-f0-9]{40}$/i.test(identity.baseRevision)
    || !/^[a-f0-9]{64}$/i.test(identity.verifiedFingerprint) || !identity.verificationReceiptId || !identity.verifiedAt) {
    return fail(['complete-verified-receipt-core-required']);
  }
  const receipt = Object.freeze({
    ...structuredClone(core),
    selfMaintenanceReceiptId: `self_maint_${digest(identity).slice(0, 24)}`
  });
  issued.set(receipt, Object.freeze({ ...identity, receiptId: receipt.selfMaintenanceReceiptId }));
  return {
    ok: true,
    policyVersion: SELF_MAINTENANCE_RECEIPT_PROVENANCE_POLICY_VERSION,
    status: 'VERIFIED_RECEIPT_ISSUED',
    receipt
  };
}

export function validateVerifiedSelfMaintenanceReceipt(receipt, { changeSetId, baseRevision, taskId } = {}) {
  const record = receipt && typeof receipt === 'object' ? issued.get(receipt) : null;
  if (!record) return fail(['process-local-self-maintenance-receipt-origin-required']);
  const reasons = [];
  if (changeSetId && record.changeSetId !== text(changeSetId, 200)) reasons.push('self-maintenance-receipt-change-set-mismatch');
  if (baseRevision && record.baseRevision !== text(baseRevision, 160)) reasons.push('self-maintenance-receipt-base-mismatch');
  if (taskId && record.taskId !== text(taskId, 160)) reasons.push('self-maintenance-receipt-task-mismatch');
  if (receipt.selfMaintenanceReceiptId !== record.receiptId) reasons.push('self-maintenance-receipt-id-mismatch');
  return reasons.length ? fail(reasons) : {
    ok: true,
    policyVersion: SELF_MAINTENANCE_RECEIPT_PROVENANCE_POLICY_VERSION,
    status: 'VERIFIED_RECEIPT_TRUSTED',
    receiptId: record.receiptId
  };
}
