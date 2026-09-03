import { createHash } from 'node:crypto';

function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function bounded(value, min = 0, max = Infinity) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function validTime(value) {
  const normalized = text(value, 100);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function admissionStatus(candidate) {
  const proof = candidate?.admissionProof;
  const valid = proof?.ok === true && proof?.status === 'MODEL_ADMISSION_EVIDENCED' &&
    proof?.workerCompilationAuthority === 'ELIGIBLE_FOR_INTEGRATION_REVIEW' &&
    proof?.promotionAuthority === 'NONE' && proof?.businessEffectAuthority === 'NONE';
  if (!valid) return { valid: false, identityMatches: false };

  const proofIdentity = proof?.identity || {};
  const expectedIdentity = {
    provider: candidate?.provider,
    id: candidate?.id,
    revision: candidate?.revision,
    taskClass: candidate?.taskClass
  };
  const identityMatches = ['provider', 'id', 'revision', 'taskClass']
    .every(key => text(proofIdentity?.[key], 500) === text(expectedIdentity?.[key], 500));
  return { valid: true, identityMatches };
}

function normalizeRoutingBasis(candidate) {
  const basis = candidate?.routingBasis || {};
  const normalized = {
    providerPriceRef: text(basis.providerPriceRef, 2000),
    runtimeEvidenceRef: text(basis.runtimeEvidenceRef, 2000),
    hardwareEvidenceRef: text(basis.hardwareEvidenceRef, 2000),
    permissionEvidenceRef: text(basis.permissionEvidenceRef, 2000),
    benchmarkEvidenceRef: text(basis.benchmarkEvidenceRef, 2000),
    admissionEvidenceRef: text(basis.admissionEvidenceRef, 2000)
  };
  return Object.values(normalized).every(Boolean) ? normalized : null;
}

function routingBasisDigest({ provider, id, revision, taskClass, routingBasis }) {
  const canonical = JSON.stringify({ provider, id, revision, taskClass, ...routingBasis });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function runFrontierTaskTournament(input = {}, { now = new Date() } = {}) {
  const reasons = [];
  const taskClass = text(input.taskClass, 300);
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const maxEvidenceAgeDays = bounded(input.maxEvidenceAgeDays ?? 7, 1, 30);
  if (!taskClass) reasons.push('task-class-required');
  if (candidates.length < 2) reasons.push('competitive-candidate-set-required');
  if (maxEvidenceAgeDays == null) reasons.push('bounded-evidence-age-required');

  const seen = new Set();
  const seenEvidence = new Set();
  const scored = [];
  for (const candidate of candidates) {
    const id = text(candidate?.id, 500);
    const revision = text(candidate?.revision, 500);
    const provider = text(candidate?.provider, 300);
    const candidateTask = text(candidate?.taskClass, 300);
    const evidenceRef = text(candidate?.tournamentEvidenceRef, 2000);
    const observedAt = validTime(candidate?.tournamentObservedAt);
    const attempts = Number(candidate?.attempts);
    const successes = Number(candidate?.successfulAttempts);
    const totalCostUsd = bounded(candidate?.totalCostUsd);
    const latencyMs = bounded(candidate?.meanLatencyMs);
    const founderMinutes = bounded(candidate?.founderMinutes);
    const hardwareBurdenUsd = bounded(candidate?.hardwareBurdenUsd);
    const reliability = bounded(candidate?.reliability, 0, 1);
    const key = id && revision && provider ? `${provider}:${id}@${revision}` : null;
    const routingBasis = normalizeRoutingBasis(candidate);

    if (!key || seen.has(key)) { reasons.push('unique-exact-candidate-identity-required'); continue; }
    seen.add(key);
    const admission = admissionStatus(candidate);
    if (!admission.valid) { reasons.push(`fresh-admission-required:${key}`); continue; }
    if (!admission.identityMatches) { reasons.push(`admission-proof-identity-mismatch:${key}`); continue; }
    if (candidateTask !== taskClass) { reasons.push(`task-class-mismatch:${key}`); continue; }
    if (!routingBasis) { reasons.push(`complete-routing-basis-required:${key}`); continue; }
    if (!evidenceRef) { reasons.push(`tournament-evidence-required:${key}`); continue; }
    if (seenEvidence.has(evidenceRef)) { reasons.push(`independent-tournament-evidence-required:${key}`); continue; }
    seenEvidence.add(evidenceRef);
    if (!observedAt) { reasons.push(`tournament-evidence-time-required:${key}`); continue; }
    const ageMs = now.getTime() - observedAt.getTime();
    if (ageMs < 0) { reasons.push(`future-tournament-evidence-rejected:${key}`); continue; }
    if (maxEvidenceAgeDays != null && ageMs > maxEvidenceAgeDays * 86400000) { reasons.push(`stale-tournament-evidence-rejected:${key}`); continue; }
    if (!Number.isSafeInteger(attempts) || attempts <= 0 || !Number.isSafeInteger(successes) || successes <= 0 || successes > attempts) {
      reasons.push(`successful-trials-required:${key}`); continue;
    }
    if ([totalCostUsd, latencyMs, founderMinutes, hardwareBurdenUsd, reliability].some(v => v == null)) {
      reasons.push(`bounded-economics-required:${key}`); continue;
    }
    const successRate = successes / attempts;
    const successfulTaskCostUsd = (totalCostUsd + hardwareBurdenUsd) / successes;
    const founderMinutesPerSuccess = founderMinutes / successes;
    const latencyPerSuccessMs = latencyMs / successRate;
    const score = successfulTaskCostUsd + founderMinutesPerSuccess + latencyPerSuccessMs / 60000 + (1 - reliability) * 10;
    scored.push({
      key, provider, id, revision, taskClass, attempts, successes, successRate,
      successfulTaskCostUsd, founderMinutesPerSuccess, latencyPerSuccessMs, reliability, score,
      evidenceRef, observedAt: observedAt.toISOString(), routingBasis,
      routingBasisDigest: routingBasisDigest({ provider, id, revision, taskClass, routingBasis })
    });
  }

  if (reasons.length || scored.length < 2) {
    if (scored.length < 2) reasons.push('two-admitted-comparable-candidates-required');
    return { ok: false, status: 'TOURNAMENT_BLOCKED', reasons: [...new Set(reasons)], winner: null, workerRoutingAuthority: 'NONE', businessEffectAuthority: 'NONE' };
  }

  scored.sort((a, b) => a.score - b.score || b.successRate - a.successRate || a.key.localeCompare(b.key));
  const winner = scored[0];
  return {
    ok: true,
    status: 'TOURNAMENT_EVIDENCED',
    taskClass,
    winner,
    ranking: scored,
    evidenceFreshness: { evaluatedAt: now.toISOString(), maxEvidenceAgeDays },
    scoringDoctrine: 'successful-task-cost + founder-minutes-per-success + latency-per-success-minutes + reliability-penalty',
    workerRoutingAuthority: 'ELIGIBLE_FOR_INTEGRATION_REVIEW_ONLY',
    promotionAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}
