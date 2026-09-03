import { createHash } from 'node:crypto';

function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function validTime(value) {
  const normalized = text(value, 100);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function admissionStatus(proof, expectedIdentity = {}) {
  const valid = proof?.ok === true && proof?.status === 'MODEL_ADMISSION_EVIDENCED' &&
    proof?.workerCompilationAuthority === 'ELIGIBLE_FOR_INTEGRATION_REVIEW' &&
    proof?.promotionAuthority === 'NONE' && proof?.businessEffectAuthority === 'NONE';
  if (!valid) return { valid: false, identityMatches: false };

  const identity = proof?.identity || {};
  const identityMatches = ['provider', 'id', 'revision', 'taskClass']
    .every(key => text(identity?.[key], 500) === text(expectedIdentity?.[key], 500));
  return { valid: true, identityMatches };
}

function normalizeBasis(basis = {}) {
  const out = {
    providerPriceRef: text(basis.providerPriceRef, 2000),
    runtimeEvidenceRef: text(basis.runtimeEvidenceRef, 2000),
    hardwareEvidenceRef: text(basis.hardwareEvidenceRef, 2000),
    permissionEvidenceRef: text(basis.permissionEvidenceRef, 2000),
    benchmarkEvidenceRef: text(basis.benchmarkEvidenceRef, 2000),
    admissionEvidenceRef: text(basis.admissionEvidenceRef, 2000)
  };
  return Object.values(out).every(Boolean) ? out : null;
}

function digest({ provider, id, revision, taskClass, routingBasis }) {
  return `sha256:${createHash('sha256').update(JSON.stringify({ provider, id, revision, taskClass, ...routingBasis })).digest('hex')}`;
}

export function verifyFrontierRoutingAtExecution(input = {}, { now = new Date() } = {}) {
  const reasons = [];
  const tournament = input.tournament || {};
  const winner = tournament.winner || {};
  const current = input.currentSupplier || {};
  const maxSelectionAgeMinutes = Number(input.maxSelectionAgeMinutes ?? 60);

  if (tournament.ok !== true || tournament.status !== 'TOURNAMENT_EVIDENCED' || tournament.workerRoutingAuthority !== 'ELIGIBLE_FOR_INTEGRATION_REVIEW_ONLY') {
    reasons.push('evidenced-tournament-required');
  }

  const selectionTime = validTime(tournament?.evidenceFreshness?.evaluatedAt);
  if (!selectionTime || !Number.isFinite(maxSelectionAgeMinutes) || maxSelectionAgeMinutes <= 0 || maxSelectionAgeMinutes > 1440) {
    reasons.push('bounded-selection-freshness-required');
  } else {
    const ageMs = now.getTime() - selectionTime.getTime();
    if (ageMs < 0) reasons.push('future-selection-rejected');
    if (ageMs > maxSelectionAgeMinutes * 60000) reasons.push('stale-selection-rejected');
  }

  const currentIdentity = {
    provider: text(current.provider, 300),
    id: text(current.id, 500),
    revision: text(current.revision, 500),
    taskClass: text(current.taskClass, 300)
  };
  const winnerIdentity = {
    provider: text(winner.provider, 300),
    id: text(winner.id, 500),
    revision: text(winner.revision, 500),
    taskClass: text(winner.taskClass, 300)
  };
  if (Object.values(currentIdentity).some(v => !v) || Object.entries(currentIdentity).some(([key, value]) => value !== winnerIdentity[key])) {
    reasons.push('exact-winner-identity-required');
  }

  const admission = admissionStatus(current.admissionProof, currentIdentity);
  if (!admission.valid) reasons.push('current-admission-required');
  else if (!admission.identityMatches) reasons.push('current-admission-identity-mismatch');

  const currentBasis = normalizeBasis(current.routingBasis);
  const selectedBasis = normalizeBasis(winner.routingBasis);
  if (!currentBasis || !selectedBasis || !text(winner.routingBasisDigest, 200)) {
    reasons.push('complete-routing-basis-required');
  } else {
    const selectedDigest = digest({ ...winnerIdentity, routingBasis: selectedBasis });
    const currentDigest = digest({ ...currentIdentity, routingBasis: currentBasis });
    if (selectedDigest !== winner.routingBasisDigest) reasons.push('selection-basis-integrity-failed');
    if (currentDigest !== winner.routingBasisDigest) reasons.push('routing-basis-drift-detected');
  }

  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'ROUTING_REVALIDATED' : 'ROUTING_BLOCKED',
    reasons: [...new Set(reasons)],
    selectedKey: text(winner.key, 1600),
    routingAuthority: reasons.length === 0 ? 'ELIGIBLE_FOR_PROVIDER_NEUTRAL_WORKER_COMPILATION_REVIEW' : 'NONE',
    promotionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    revalidatedAt: now.toISOString()
  };
}
