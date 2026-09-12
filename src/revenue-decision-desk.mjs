export const REVENUE_DECISION_DESK_VERSION = 'uberbond.revenue-decision-desk.v1';

const ROLES = Object.freeze(['PROBE','PRISM','SCALE','LIMIT','ARCHIVE','EINSTEIN']);

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasEvidence(candidate) {
  return Array.isArray(candidate?.evidenceRefs) && candidate.evidenceRefs.length > 0;
}

function authorityOk(candidate) {
  return candidate?.authority === true || candidate?.authority === 'authorized';
}

function stopConditionsOk(candidate) {
  return Array.isArray(candidate?.stopConditions) && candidate.stopConditions.length > 0;
}

function archiveBlocked(candidate, archive = []) {
  const prior = archive.find(item => item?.fingerprint && item.fingerprint === candidate?.fingerprint && item?.status === 'REJECTED');
  if (!prior) return false;
  const priorRevision = num(prior.evidenceRevision, 0);
  const currentRevision = num(candidate?.evidenceRevision, 0);
  return currentRevision <= priorRevision;
}

export function scoreRevenueCandidate(candidate = {}) {
  const expectedClearedContribution = num(candidate.expectedClearedContribution);
  const founderMinutes = Math.max(1, num(candidate.founderMinutes, 1));
  const probability = Math.min(1, Math.max(0, num(candidate.probability, 0)));
  const downside = Math.max(0, num(candidate.downside, 0));
  const reversibility = Math.min(1, Math.max(0, num(candidate.reversibility, 0)));
  const evidenceQuality = Math.min(1, Math.max(0, num(candidate.evidenceQuality, hasEvidence(candidate) ? 0.5 : 0)));
  const riskAdjustedClearedContribution = (expectedClearedContribution * probability) - downside;
  const profitPerFounderMinute = riskAdjustedClearedContribution / founderMinutes;
  const score = profitPerFounderMinute * (0.5 + 0.5 * evidenceQuality) * (0.5 + 0.5 * reversibility);
  return { score, riskAdjustedClearedContribution, profitPerFounderMinute, evidenceQuality, reversibility };
}

export function evaluateRevenueCandidate(candidate = {}, { archive = [] } = {}) {
  const reasons = [];
  if (!candidate?.id) reasons.push('missing-id');
  if (!hasEvidence(candidate)) reasons.push('missing-evidence');
  if (!authorityOk(candidate)) reasons.push('missing-authority');
  if (!stopConditionsOk(candidate)) reasons.push('missing-stop-conditions');
  if (archiveBlocked(candidate, archive)) reasons.push('archive-rejection-not-superseded');
  const economics = scoreRevenueCandidate(candidate);
  if (!(economics.riskAdjustedClearedContribution > 0)) reasons.push('non-positive-risk-adjusted-contribution');
  const verdict = reasons.length ? 'RED_LIGHT' : 'GREEN_LIGHT';
  return {
    version: REVENUE_DECISION_DESK_VERSION,
    roles: ROLES,
    candidateId: candidate?.id ?? null,
    verdict,
    reasons,
    economics,
    veto: verdict === 'RED_LIGHT',
  };
}

export function runRevenueDecisionDesk(candidates = [], { archive = [], maxActions = 1 } = {}) {
  const evaluated = candidates.map(candidate => ({ candidate, decision: evaluateRevenueCandidate(candidate, { archive }) }));
  const survivors = evaluated
    .filter(item => item.decision.verdict === 'GREEN_LIGHT')
    .sort((a, b) => b.decision.economics.score - a.decision.economics.score)
    .slice(0, Math.max(0, Number(maxActions) || 0));
  return {
    version: REVENUE_DECISION_DESK_VERSION,
    roles: ROLES,
    totalCandidates: evaluated.length,
    greenLightCount: evaluated.filter(item => item.decision.verdict === 'GREEN_LIGHT').length,
    selected: survivors.map(item => item.candidate.id),
    decisions: evaluated.map(item => item.decision),
    baseline: 'DO_NOTHING',
  };
}
