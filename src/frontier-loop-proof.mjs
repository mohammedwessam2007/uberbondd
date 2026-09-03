export const FRONTIER_LOOP_STAGES = Object.freeze([
  'WORLD_SENSING',
  'MECHANISM_EXTRACTION',
  'NOVELTY_ANALYSIS',
  'THINKER_SWARM',
  'HYPOTHESIS_FORMATION',
  'BENCHMARK_OR_EXPERIMENT',
  'REALITY_JUDGE',
  'LEARNING'
]);

function clean(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function validTime(value) {
  const out = clean(value, 80);
  const parsed = out ? new Date(out) : null;
  return Boolean(parsed && Number.isFinite(parsed.getTime()));
}

export function verifyFrontierLoop(stages = []) {
  const reasons = [];
  if (!Array.isArray(stages) || stages.length !== FRONTIER_LOOP_STAGES.length) {
    reasons.push('complete-loop-required');
  }
  FRONTIER_LOOP_STAGES.forEach((stageName, index) => {
    const stage = stages?.[index] || {};
    if (stage.stage !== stageName) reasons.push(`stage-order:${stageName}`);
    if (!validTime(stage.observedAt)) reasons.push(`stage-time:${stageName}`);
    if (!clean(stage.evidenceRef)) reasons.push(`stage-evidence:${stageName}`);
    if (!clean(stage.artifactRef)) reasons.push(`stage-artifact:${stageName}`);
  });
  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'FRONTIER_LOOP_EVIDENCED' : 'FRONTIER_LOOP_INCOMPLETE',
    reasons,
    promotionAuthority: 'NONE'
  };
}
