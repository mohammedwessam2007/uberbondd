export const FOUNDER_ABSENCE_POLICY_VERSION = 'founder-absence-readiness-1.0.0';

const REQUIRED = Object.freeze([
  'durableState',
  'scheduler',
  'agentRelay',
  'agentWorkers',
  'boundedBudgets',
  'staleRecovery',
  'truthReceipts',
  'killSwitch',
  'paymentObservation',
  'deliveryObservation',
  'ownerEscalationQueue'
]);

function fail(reasonCodes) {
  return { ok: false, policyVersion: FOUNDER_ABSENCE_POLICY_VERSION, status: 'NOT_READY', reasonCodes: [...new Set(reasonCodes.filter(Boolean))] };
}

function normalizeCapability(name, input = {}) {
  const evidenceRefs = Array.isArray(input.evidenceRefs)
    ? [...new Set(input.evidenceRefs.map(value => String(value || '').trim()).filter(Boolean))].slice(0, 50)
    : [];
  const typedEvidenceRefs = evidenceRefs.filter(value => /^(receipt|issue|github|deployment|test|audit|payment|delivery|doc):/i.test(value));
  return {
    name,
    status: String(input.status || 'UNKNOWN').toUpperCase(),
    evidenceRefs,
    typedEvidenceRefs,
    evidenceValid: evidenceRefs.length > 0 && evidenceRefs.length === typedEvidenceRefs.length,
    externallyVerified: input.externallyVerified === true,
    notes: String(input.notes || '').slice(0, 500)
  };
}

export function evaluateFounderAbsenceReadiness({ capabilities = {}, targetDays = 7 } = {}) {
  const days = Number(targetDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) return fail(['target-days-1-to-30-required']);
  const normalized = REQUIRED.map(name => normalizeCapability(name, capabilities[name]));
  const criticalMissing = normalized.filter(item => !['VERIFIED_LIVE', 'TEST_VERIFIED'].includes(item.status));
  const liveMissing = normalized.filter(item => item.status !== 'VERIFIED_LIVE');
  const receiptMissing = normalized.filter(item => !item.evidenceValid);
  const externalProofMissing = normalized.filter(item => ['scheduler', 'agentRelay', 'agentWorkers', 'paymentObservation', 'deliveryObservation'].includes(item.name) && !item.externallyVerified);

  const architectureScore = Math.round(((REQUIRED.length - criticalMissing.length) / REQUIRED.length) * 100);
  const liveScore = Math.round(((REQUIRED.length - liveMissing.length) / REQUIRED.length) * 100);
  const evidenceScore = Math.round(((REQUIRED.length - receiptMissing.length) / REQUIRED.length) * 100);
  const overall = Math.round(architectureScore * 0.45 + liveScore * 0.35 + evidenceScore * 0.20);

  let status = 'NOT_READY';
  if (overall >= 90 && !liveMissing.length && !receiptMissing.length && !externalProofMissing.length) status = 'KILIMANJARO_READY';
  else if (overall >= 75) status = 'MULTI_DAY_REHEARSAL_READY';
  else if (overall >= 55) status = 'OVERNIGHT_REHEARSAL_READY';

  return {
    ok: true,
    policyVersion: FOUNDER_ABSENCE_POLICY_VERSION,
    status,
    targetDays: days,
    scores: { architecture: architectureScore, live: liveScore, evidence: evidenceScore, overall },
    capabilities: normalized,
    criticalMissing: criticalMissing.map(item => item.name),
    liveProofMissing: liveMissing.map(item => item.name),
    externalProofMissing: externalProofMissing.map(item => item.name),
    nextGate: status === 'KILIMANJARO_READY'
      ? 'RUN_OWNER_ABSENCE_CANARY'
      : externalProofMissing[0] || liveMissing[0] || criticalMissing[0] || 'REVIEW'
  };
}
