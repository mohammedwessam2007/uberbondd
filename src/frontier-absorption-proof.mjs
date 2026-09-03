const LEVELS = new Set(['CLONED', 'PARITY', 'SUPERIOR']);

function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function validTime(value) {
  const normalized = text(value, 80);
  const parsed = normalized ? new Date(normalized) : null;
  return Boolean(parsed && Number.isFinite(parsed.getTime()));
}

export function verifyAbsorptionClaim(input = {}) {
  const reasons = [];
  const claimedLevel = text(input.claimedLevel, 40)?.toUpperCase();
  const evidence = Array.isArray(input.behaviorEvidence) ? input.behaviorEvidence : [];
  const baselineVersion = text(input.baselineVersion, 300);
  const candidateVersion = text(input.candidateVersion, 300);

  if (!LEVELS.has(claimedLevel)) reasons.push('valid-level-required');
  if (!text(input.targetFeature, 500)) reasons.push('target-feature-required');
  if (!baselineVersion || !candidateVersion) reasons.push('exact-versions-required');
  if (baselineVersion && candidateVersion && baselineVersion === candidateVersion) reasons.push('distinct-versions-required');
  if (!evidence.length) reasons.push('behavior-evidence-required');

  const normalized = evidence.map(item => ({
    behavior: text(item?.behavior, 500),
    baselineResult: text(item?.baselineResult, 500),
    candidateResult: text(item?.candidateResult, 500),
    evidenceRef: text(item?.evidenceRef, 2000),
    observedAt: validTime(item?.observedAt)
  }));

  if (normalized.some(item => !item.behavior || !item.baselineResult || !item.candidateResult || !item.evidenceRef || !item.observedAt)) {
    reasons.push('complete-behavior-evidence-required');
  }

  const behaviorRefs = normalized.map(item => item.evidenceRef).filter(Boolean);
  if (new Set(behaviorRefs).size !== behaviorRefs.length) reasons.push('unique-behavior-evidence-required');

  const behaviorParity = normalized.length > 0 && normalized.every(item => item.baselineResult === item.candidateResult);

  if (claimedLevel === 'CLONED' && !behaviorParity) reasons.push('clone-not-demonstrated');
  if (claimedLevel === 'PARITY' && !behaviorParity) reasons.push('parity-not-demonstrated');

  if (claimedLevel === 'SUPERIOR') {
    const metrics = Array.isArray(input.superiorityMetrics) ? input.superiorityMetrics : [];
    const metricRefs = metrics.map(item => text(item?.evidenceRef, 2000)).filter(Boolean);
    const validMetrics = metrics.length > 0 && metrics.every(item => {
      const baseline = Number(item?.baseline);
      const candidate = Number(item?.candidate);
      return Number.isFinite(baseline) && Number.isFinite(candidate) &&
        ['HIGHER_BETTER', 'LOWER_BETTER'].includes(String(item?.direction)) &&
        text(item?.metric, 500) && text(item?.evidenceRef, 2000);
    });
    if (new Set(metricRefs).size !== metricRefs.length || metricRefs.some(ref => behaviorRefs.includes(ref))) {
      reasons.push('unique-metric-evidence-required');
    }
    const metricWins = validMetrics && metrics.every(item =>
      item.direction === 'HIGHER_BETTER'
        ? Number(item.candidate) > Number(item.baseline)
        : Number(item.candidate) < Number(item.baseline)
    );
    if (!behaviorParity || !metricWins) reasons.push('superiority-not-demonstrated');
  }

  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'ABSORPTION_EVIDENCED' : 'ABSORPTION_UNPROVEN',
    claimedLevel: claimedLevel || null,
    evidenceCount: normalized.length,
    reasons,
    promotionAuthority: 'NONE'
  };
}
