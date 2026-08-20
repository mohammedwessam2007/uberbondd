import crypto from 'node:crypto';

export const AGENT_MODEL_ROUTER_POLICY_VERSION = 'agent-model-router-1.0.0';

const MAX_MODELS = 128;
const MAX_BENCHMARKS = 1000;
const TASK_CLASSES = new Set([
  'research', 'strategy', 'coding', 'review', 'classification', 'browser',
  'security', 'math', 'commercial-analysis', 'general'
]);

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}
function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function finite(value, min = 0, max = 1, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}
function fail(reasonCodes, status = 'REJECTED') {
  return { ok: false, policyVersion: AGENT_MODEL_ROUTER_POLICY_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))] };
}

export function normalizeModelCandidate(input = {}) {
  const provider = text(input.provider, 80).toLowerCase();
  const model = text(input.model, 120);
  const taskClasses = [...new Set((Array.isArray(input.taskClasses) ? input.taskClasses : ['general'])
    .map(value => text(value, 80).toLowerCase()).filter(value => TASK_CLASSES.has(value)))];
  const reasons = [];
  if (!provider) reasons.push('provider-required');
  if (!model) reasons.push('model-required');
  if (!taskClasses.length) reasons.push('supported-task-class-required');
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    provider,
    model,
    candidateId: `model_${hash({ provider, model }).slice(0, 20)}`,
    taskClasses,
    enabled: input.enabled !== false,
    maxContextTokens: Number.isSafeInteger(Number(input.maxContextTokens)) ? Math.max(1, Number(input.maxContextTokens)) : null,
    centsPerMillionInputTokens: Math.max(0, Number(input.centsPerMillionInputTokens || 0)),
    centsPerMillionOutputTokens: Math.max(0, Number(input.centsPerMillionOutputTokens || 0))
  };
}

export function normalizeModelBenchmark(input = {}, date = new Date()) {
  const candidate = normalizeModelCandidate(input);
  if (!candidate.ok) return candidate;
  const taskClass = text(input.taskClass, 80).toLowerCase();
  const reasons = [];
  if (!TASK_CLASSES.has(taskClass)) reasons.push('valid-task-class-required');
  const quality = finite(input.quality, 0, 1);
  const reliability = finite(input.reliability, 0, 1);
  const latency = finite(input.latencyScore, 0, 1);
  const economicImpact = finite(input.economicImpact, 0, 1, 0);
  const evidenceConfidence = finite(input.evidenceConfidence, 0, 1);
  const costEfficiency = finite(input.costEfficiency, 0, 1);
  if (quality == null) reasons.push('quality-score-required');
  if (reliability == null) reasons.push('reliability-score-required');
  if (latency == null) reasons.push('latency-score-required');
  if (evidenceConfidence == null) reasons.push('evidence-confidence-required');
  if (costEfficiency == null) reasons.push('cost-efficiency-required');
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    policyVersion: AGENT_MODEL_ROUTER_POLICY_VERSION,
    benchmarkId: `bench_${hash({ candidateId: candidate.candidateId, taskClass, quality, reliability, latency, economicImpact, evidenceConfidence, costEfficiency }).slice(0, 24)}`,
    candidate,
    taskClass,
    quality,
    reliability,
    latencyScore: latency,
    economicImpact,
    evidenceConfidence,
    costEfficiency,
    observedAt: timestamp(date)
  };
}

function weightedScore(benchmark, weights) {
  return benchmark.quality * weights.quality
    + benchmark.reliability * weights.reliability
    + benchmark.latencyScore * weights.latency
    + benchmark.economicImpact * weights.economicImpact
    + benchmark.costEfficiency * weights.costEfficiency;
}

export function routeModel({
  taskClass = 'general',
  candidates = [],
  benchmarks = [],
  minimumEvidenceConfidence = 0.5,
  explorationRate = 0.1,
  random = Math.random,
  weights = {}
} = {}) {
  const klass = text(taskClass, 80).toLowerCase();
  if (!TASK_CLASSES.has(klass)) return fail(['valid-task-class-required']);
  if (!Array.isArray(candidates) || !candidates.length || candidates.length > MAX_MODELS) return fail(['bounded-model-candidate-list-required']);
  if (!Array.isArray(benchmarks) || benchmarks.length > MAX_BENCHMARKS) return fail(['bounded-benchmark-list-required']);
  const normalizedCandidates = candidates.map(normalizeModelCandidate).filter(item => item.ok && item.enabled && (item.taskClasses.includes(klass) || item.taskClasses.includes('general')));
  if (!normalizedCandidates.length) return fail(['no-enabled-model-for-task-class'], 'BLOCKED');
  const confidenceFloor = finite(minimumEvidenceConfidence, 0, 1, 0.5);
  const explore = finite(explorationRate, 0, 0.5, 0.1);
  const w = {
    quality: finite(weights.quality, 0, 1, 0.35),
    reliability: finite(weights.reliability, 0, 1, 0.25),
    latency: finite(weights.latency, 0, 1, 0.1),
    economicImpact: finite(weights.economicImpact, 0, 1, 0.2),
    costEfficiency: finite(weights.costEfficiency, 0, 1, 0.1)
  };
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(w)) w[key] /= sum || 1;

  const latest = new Map();
  for (const raw of benchmarks) {
    const benchmark = raw?.ok ? raw : normalizeModelBenchmark(raw);
    if (!benchmark.ok || benchmark.taskClass !== klass) continue;
    const id = benchmark.candidate.candidateId;
    const current = latest.get(id);
    if (!current || String(benchmark.observedAt) > String(current.observedAt)) latest.set(id, benchmark);
  }

  const scored = normalizedCandidates.map(candidate => {
    const benchmark = latest.get(candidate.candidateId) || null;
    const hasEvidence = Boolean(benchmark && benchmark.evidenceConfidence >= confidenceFloor);
    return {
      candidate,
      benchmark,
      hasEvidence,
      score: hasEvidence ? weightedScore(benchmark, w) * benchmark.evidenceConfidence : 0
    };
  });

  const evidenced = scored.filter(item => item.hasEvidence).sort((a, b) => b.score - a.score || a.candidate.candidateId.localeCompare(b.candidate.candidateId));
  const unexplored = scored.filter(item => !item.hasEvidence).sort((a, b) => a.candidate.candidateId.localeCompare(b.candidate.candidateId));
  if (!evidenced.length && !unexplored.length) return fail(['no-routable-model'], 'BLOCKED');

  let selected;
  let mode = 'EXPLOIT';
  if (unexplored.length && Number(random()) < explore) {
    selected = unexplored[Math.min(unexplored.length - 1, Math.floor(Number(random()) * unexplored.length))];
    mode = 'EXPLORE';
  } else if (evidenced.length) {
    selected = evidenced[0];
  } else {
    selected = unexplored[0];
    mode = 'FORCED_EXPLORATION';
  }

  return {
    ok: true,
    policyVersion: AGENT_MODEL_ROUTER_POLICY_VERSION,
    status: 'ROUTED',
    taskClass: klass,
    mode,
    selected: selected.candidate,
    benchmark: selected.benchmark,
    score: selected.score,
    evidenceStatus: selected.hasEvidence ? 'EVIDENCE_BACKED' : 'UNBENCHMARKED',
    alternatives: scored
      .filter(item => item.candidate.candidateId !== selected.candidate.candidateId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => ({ candidateId: item.candidate.candidateId, provider: item.candidate.provider, model: item.candidate.model, score: item.score, evidenceStatus: item.hasEvidence ? 'EVIDENCE_BACKED' : 'UNBENCHMARKED' }))
  };
}
