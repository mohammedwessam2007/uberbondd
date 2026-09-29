import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { qualityInvariantAttestation } from './absolute-frontier-quality-invariant.mjs';

export const FRONTIER_VM_LONGITUDINAL_EVALUATOR_VERSION = 'uberbond.frontier-vm-longitudinal-evaluator.v1';

const ZERO_EFFECTS = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const unique = values => [...new Set(values.filter(Boolean))];

function envelope(extra = {}) {
  return {
    evaluatorVersion: FRONTIER_VM_LONGITUDINAL_EVALUATOR_VERSION,
    absoluteQualityInvariant: qualityInvariantAttestation(),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: ZERO_EFFECTS(),
    promotionAuthority: 'NONE',
    ...extra
  };
}

function fail(status, reasons, extra = {}) {
  return envelope({ ok: false, status, reasonCodes: unique(reasons), ...extra });
}

function normalizeEpisode(raw, index) {
  const reasons = [];
  const episodeId = text(raw?.episodeId, 200);
  const taskArchetype = text(raw?.taskArchetype, 240);
  const phase = text(raw?.phase, 80).toUpperCase();
  const crownRevision = text(raw?.crownRevision, 240);
  const baselineSuccess = raw?.baselineSuccess;
  const candidateSuccess = raw?.candidateSuccess;
  const baselineFrontierCostUsd = finite(raw?.baselineFrontierCostUsd, 0, 1_000_000);
  const candidateFrontierCostUsd = finite(raw?.candidateFrontierCostUsd, 0, 1_000_000);
  const baselineAllInCostUsd = finite(raw?.baselineAllInCostUsd, 0, 1_000_000);
  const candidateAllInCostUsd = finite(raw?.candidateAllInCostUsd, 0, 1_000_000);
  const semanticNodes = integer(raw?.semanticNodes, 1, 10_000_000);
  const frontierNodes = integer(raw?.frontierNodes, 0, 10_000_000);
  const compiledHits = integer(raw?.compiledHits ?? 0, 0, 10_000_000);
  const deoptimizations = integer(raw?.deoptimizations ?? 0, 0, 10_000_000);
  const evidenceRef = text(raw?.evidenceRef, 1000);

  if (!episodeId || !taskArchetype || !crownRevision || !evidenceRef) reasons.push(`episode-${index}:identity-provenance-required`);
  if (!['BURN_IN', 'CERTIFIED', 'POST_SUCCESSION'].includes(phase)) reasons.push(`episode-${index}:recognized-phase-required`);
  if (typeof baselineSuccess !== 'boolean' || typeof candidateSuccess !== 'boolean') reasons.push(`episode-${index}:paired-boolean-outcomes-required`);
  if ([baselineFrontierCostUsd,candidateFrontierCostUsd,baselineAllInCostUsd,candidateAllInCostUsd].some(v=>v==null)) reasons.push(`episode-${index}:complete-cost-receipts-required`);
  if ([semanticNodes,frontierNodes,compiledHits,deoptimizations].some(v=>v==null)) reasons.push(`episode-${index}:complete-node-telemetry-required`);
  if (semanticNodes != null && frontierNodes != null && frontierNodes > semanticNodes) reasons.push(`episode-${index}:frontier-nodes-cannot-exceed-semantic-nodes`);
  if (semanticNodes != null && compiledHits != null && compiledHits > semanticNodes) reasons.push(`episode-${index}:compiled-hits-cannot-exceed-semantic-nodes`);

  return {
    reasons,
    episode: {
      episodeId, taskArchetype, phase, crownRevision,
      baselineSuccess, candidateSuccess,
      baselineFrontierCostUsd, candidateFrontierCostUsd,
      baselineAllInCostUsd, candidateAllInCostUsd,
      semanticNodes, frontierNodes, compiledHits, deoptimizations,
      evidenceRef
    }
  };
}

function metrics(rows) {
  const baselineFrontier = rows.reduce((s,r)=>s+r.baselineFrontierCostUsd,0);
  const candidateFrontier = rows.reduce((s,r)=>s+r.candidateFrontierCostUsd,0);
  const baselineAllIn = rows.reduce((s,r)=>s+r.baselineAllInCostUsd,0);
  const candidateAllIn = rows.reduce((s,r)=>s+r.candidateAllInCostUsd,0);
  const semanticNodes = rows.reduce((s,r)=>s+r.semanticNodes,0);
  const frontierNodes = rows.reduce((s,r)=>s+r.frontierNodes,0);
  const compiledHits = rows.reduce((s,r)=>s+r.compiledHits,0);
  const regressions = rows.filter(r=>r.baselineSuccess && !r.candidateSuccess);
  const improvements = rows.filter(r=>!r.baselineSuccess && r.candidateSuccess);
  return {
    count: rows.length,
    pairedRegressions: regressions.length,
    pairedImprovements: improvements.length,
    baselineFrontierCostUsd: Number(baselineFrontier.toFixed(8)),
    candidateFrontierCostUsd: Number(candidateFrontier.toFixed(8)),
    baselineAllInCostUsd: Number(baselineAllIn.toFixed(8)),
    candidateAllInCostUsd: Number(candidateAllIn.toFixed(8)),
    frontierResidualRatio: baselineFrontier > 0 ? Number((candidateFrontier / baselineFrontier).toFixed(8)) : null,
    referenceCompressionFactor: candidateAllIn > 0 ? Number((baselineAllIn / candidateAllIn).toFixed(8)) : null,
    frontierNodeShare: semanticNodes > 0 ? Number((frontierNodes / semanticNodes).toFixed(8)) : null,
    compiledHitShare: semanticNodes > 0 ? Number((compiledHits / semanticNodes).toFixed(8)) : null,
    deoptimizations: rows.reduce((s,r)=>s+r.deoptimizations,0),
    regressionEpisodeIds: regressions.map(r=>r.episodeId)
  };
}

export function evaluateFrontierVmLongitudinalRun({
  campaignId,
  episodes = [],
  minimumEpisodes = 20,
  requireCrownSuccessionPhase = false
} = {}) {
  const id = text(campaignId, 240);
  const min = integer(minimumEpisodes, 4, 100000);
  const reasons = [];
  if (!id || min == null) reasons.push('campaign-id-and-minimum-required');
  if (!Array.isArray(episodes) || episodes.length < (min ?? Number.MAX_SAFE_INTEGER)) reasons.push('minimum-episode-count-not-met');
  if (reasons.length) return fail('FRONTIER_VM_LONGITUDINAL_REFUSED', reasons);

  const normalized = [];
  const seenIds = new Set();
  const seenEvidence = new Set();
  for (const [index, raw] of episodes.entries()) {
    const checked = normalizeEpisode(raw,index);
    reasons.push(...checked.reasons);
    const row = checked.episode;
    if (seenIds.has(row.episodeId)) reasons.push(`episode-${index}:unique-episode-id-required`);
    if (seenEvidence.has(row.evidenceRef)) reasons.push(`episode-${index}:independent-evidence-ref-required`);
    seenIds.add(row.episodeId);
    seenEvidence.add(row.evidenceRef);
    normalized.push(row);
  }
  if (requireCrownSuccessionPhase && !normalized.some(r=>r.phase==='POST_SUCCESSION')) reasons.push('post-succession-phase-required');
  if (reasons.length) return fail('FRONTIER_VM_LONGITUDINAL_REFUSED', reasons);

  const overall = metrics(normalized);
  const byPhase = Object.fromEntries(['BURN_IN','CERTIFIED','POST_SUCCESSION']
    .map(phase=>[phase,metrics(normalized.filter(r=>r.phase===phase))])
    .filter(([,m])=>m.count>0));
  const byArchetype = Object.fromEntries([...new Set(normalized.map(r=>r.taskArchetype))]
    .sort().map(archetype=>[archetype,metrics(normalized.filter(r=>r.taskArchetype===archetype))]));

  const midpoint = Math.floor(normalized.length/2);
  const early = metrics(normalized.slice(0,midpoint));
  const late = metrics(normalized.slice(midpoint));
  const residualTrend = early.frontierResidualRatio != null && late.frontierResidualRatio != null
    ? Number((late.frontierResidualRatio - early.frontierResidualRatio).toFixed(8))
    : null;

  const crownRevisions = unique(normalized.map(r=>r.crownRevision));
  const qualityPass = overall.pairedRegressions === 0;
  const costPass = overall.referenceCompressionFactor != null && overall.referenceCompressionFactor > 1;
  const frontierShareFalling = residualTrend != null && residualTrend < 0;

  return envelope({
    ok: true,
    status: !qualityPass
      ? 'QUALITY_REGRESSION_DETECTED__DEOPTIMIZE'
      : (costPass && frontierShareFalling ? 'LONGITUDINAL_COMPRESSION_SIGNAL_OBSERVED' : 'QUALITY_HELD_BUT_COMPRESSION_NOT_YET_ESTABLISHED'),
    campaignId:id,
    overall,
    byPhase,
    byArchetype,
    temporal:{
      early,
      late,
      frontierResidualRatioDelta:residualTrend,
      frontierShareFalling
    },
    crownRevisions,
    crownSuccessionObserved:crownRevisions.length>1,
    qualityPass,
    costPass,
    automaticPromotionAuthorized:false,
    truthBoundary:'ZERO OBSERVED PAIRED REGRESSIONS IN THIS RUN IS NOT A PROOF OF UNIVERSAL OR FUTURE ZERO LOSS. COMPRESSION IS ESTABLISHED ONLY FOR THE OBSERVED TASKS, COST RECEIPTS, CROWN REVISIONS AND APPLICABILITY DOMAINS.'
  });
}
