const LICENSE_CLASSES = new Set(['PERMISSIVE', 'COPYLEFT_OR_CONDITIONAL_REVIEW', 'MODEL_SPECIFIC_REVIEW']);

function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function validTime(value) {
  const normalized = text(value, 100);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function verifyFrontierModelAdmission(input = {}, { now = new Date() } = {}) {
  const reasons = [];
  const provider = text(input.provider, 300);
  const modelId = text(input.modelId, 400);
  const revision = text(input.revision, 400);
  const provenanceRef = text(input.provenanceRef, 2000);
  const licenseId = text(input.licenseId, 300);
  const licenseClass = text(input.licenseClass, 120)?.toUpperCase();
  const securityRef = text(input.securityEvidenceRef, 2000);
  const runtimeRef = text(input.runtimeEvidenceRef, 2000);
  const hardwareRef = text(input.hardwareEvidenceRef, 2000);
  const benchmarkRef = text(input.benchmarkEvidenceRef, 2000);
  const taskClass = text(input.taskClass, 300);
  const observedAt = validTime(input.observedAt);
  const successRate = finiteNonNegative(input.successRate);
  const attempts = Number(input.attempts);
  const successfulAttempts = Number(input.successfulAttempts);
  const costUsd = finiteNonNegative(input.totalCostUsd);
  const costPerSuccess = finiteNonNegative(input.costPerSuccessfulResultUsd);
  const maxAgeDays = Number.isFinite(Number(input.maxEvidenceAgeDays)) ? Math.max(1, Number(input.maxEvidenceAgeDays)) : 30;

  if (!provider) reasons.push('provider-identity-required');
  if (!modelId || !revision || revision === 'UNOBSERVED_REVISION') reasons.push('exact-model-revision-required');
  if (!provenanceRef) reasons.push('provenance-evidence-required');
  if (!licenseId || !LICENSE_CLASSES.has(licenseClass)) reasons.push('license-decision-required');
  if (input.permissionEligible !== true) reasons.push('explicit-permission-eligibility-required');
  if (input.securityClean !== true || !securityRef) reasons.push('security-clean-evidence-required');
  if (input.runtimeCompatible !== true || !runtimeRef) reasons.push('runtime-evidence-required');
  if (input.hardwareFit !== true || !hardwareRef) reasons.push('hardware-fit-evidence-required');
  if (input.runtimeCostKnown !== true || costUsd == null) reasons.push('runtime-cost-evidence-required');
  if (!taskClass || !benchmarkRef) reasons.push('task-benchmark-evidence-required');
  if (!Number.isSafeInteger(attempts) || attempts <= 0 || !Number.isSafeInteger(successfulAttempts) || successfulAttempts < 0 || successfulAttempts > attempts) reasons.push('bounded-benchmark-counts-required');
  if (successRate == null || successRate > 1 || (Number.isSafeInteger(attempts) && attempts > 0 && Number.isSafeInteger(successfulAttempts) && Math.abs(successRate - successfulAttempts / attempts) > 1e-12)) reasons.push('consistent-success-rate-required');
  if (costPerSuccess == null || (successfulAttempts > 0 && costUsd != null && Math.abs(costPerSuccess - costUsd / successfulAttempts) > 1e-9) || successfulAttempts === 0) reasons.push('cost-per-successful-result-required');
  if (!observedAt) reasons.push('evidence-time-required');
  if (observedAt) {
    const ageMs = now.getTime() - observedAt.getTime();
    if (ageMs < 0) reasons.push('future-evidence-rejected');
    if (ageMs > maxAgeDays * 86400000) reasons.push('stale-evidence-rejected');
  }

  const identity = provider && modelId && revision && taskClass
    ? { provider, id: modelId, revision, taskClass }
    : null;

  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'MODEL_ADMISSION_EVIDENCED' : 'MODEL_ADMISSION_BLOCKED',
    identity,
    provider: provider || null,
    model: modelId && revision ? `${modelId}@${revision}` : null,
    taskClass: taskClass || null,
    reasons,
    economics: reasons.length === 0 ? { attempts, successfulAttempts, successRate, totalCostUsd: costUsd, costPerSuccessfulResultUsd: costPerSuccess } : null,
    workerCompilationAuthority: reasons.length === 0 ? 'ELIGIBLE_FOR_INTEGRATION_REVIEW' : 'NONE',
    promotionAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}
