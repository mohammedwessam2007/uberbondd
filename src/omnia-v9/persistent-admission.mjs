import { admitAction } from './kernel.mjs';

function byId(records, field) {
  return new Map((records || []).map(record => [record?.[field], record]));
}

export async function persistAndReserveAdmission({ proofStore, intent, evidence = [], approvals = [], context = {} }) {
  if (!proofStore) throw new TypeError('proofStore is required');

  await proofStore.putObject({
    objectType: 'ACTION_INTENT', objectId: intent.intentDigest, tenantId: intent.tenantId,
    digest: intent.intentDigest, data: intent
  });
  for (const record of evidence) {
    await proofStore.putObject({
      objectType: 'EVIDENCE_RECORD', objectId: record.evidenceId, tenantId: record.tenantId,
      digest: record.evidenceDigest, data: record
    });
  }
  for (const approval of approvals) {
    await proofStore.putObject({
      objectType: 'OWNER_APPROVAL', objectId: approval.approvalId, tenantId: approval.tenantId,
      digest: approval.approvalDigest, data: approval
    });
  }

  const evidenceMap = byId(evidence, 'evidenceId');
  const usageEntries = await Promise.all(approvals.map(async approval => [approval.approvalId, await proofStore.getApprovalUsage(approval.approvalId)]));
  const usageMap = new Map(usageEntries);
  const admission = admitAction(intent, {
    ...context,
    approvals,
    evidenceResolver: id => evidenceMap.get(id) || null,
    usageResolver: approvalId => usageMap.get(approvalId) || { uses: 0, costUsd: 0 }
  });

  await proofStore.putObject({
    objectType: 'AUTHORIZATION_DECISION', objectId: admission.decisionDigest, tenantId: intent.tenantId,
    digest: admission.decisionDigest, data: admission
  });

  if (admission.decision !== 'ALLOW' || !admission.approvalId) {
    return { executable: false, admission, authorityReservation: null };
  }

  const authorityReservation = await proofStore.reserveAuthority({
    approvalId: admission.approvalId,
    tenantId: intent.tenantId,
    intentDigest: intent.intentDigest,
    idempotencyKey: intent.idempotencyKey,
    useDelta: 1,
    costDeltaUsd: intent.maxCostUsd,
    blastRadius: intent.blastRadius,
    now: context.now || new Date()
  });

  return {
    executable: Boolean(authorityReservation.ok),
    admission,
    authorityReservation
  };
}
