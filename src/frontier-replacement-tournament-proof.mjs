function text(value, max = 2000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function validTime(value) {
  const normalized = text(value, 100);
  const date = normalized ? new Date(normalized) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

export function proveFreshFrontierReplacement(input = {}, { now = new Date() } = {}) {
  const reasons = [];
  const prior = input.priorRoutingDecision || {};
  const tournament = input.replacementTournament || {};
  const trigger = input.reTournamentTrigger || {};
  const priorSelectedKey = text(prior.selectedKey, 1600);
  const winner = tournament.winner || {};
  const winnerKey = text(winner.key, 1600);
  const evaluatedAt = validTime(tournament?.evidenceFreshness?.evaluatedAt);
  const triggerAt = validTime(trigger.observedAt);
  const triggerEvidenceRef = text(trigger.evidenceRef, 2000);
  const maxReplacementAgeMinutes = Number(input.maxReplacementAgeMinutes ?? 60);

  if (prior.ok !== false || prior.status !== 'ROUTING_BLOCKED' || prior.routingAuthority !== 'NONE') reasons.push('blocked-prior-routing-required');
  if (!priorSelectedKey) reasons.push('prior-selected-key-required');
  if (!text(trigger.reason, 500) || !triggerAt || !triggerEvidenceRef) reasons.push('evidenced-retournament-trigger-required');
  if (tournament.ok !== true || tournament.status !== 'TOURNAMENT_EVIDENCED' || tournament.workerRoutingAuthority !== 'ELIGIBLE_FOR_INTEGRATION_REVIEW_ONLY') reasons.push('fresh-evidenced-replacement-tournament-required');
  if (!winnerKey) reasons.push('replacement-winner-required');
  if (!evaluatedAt || !Number.isFinite(maxReplacementAgeMinutes) || maxReplacementAgeMinutes <= 0 || maxReplacementAgeMinutes > 1440) {
    reasons.push('bounded-replacement-freshness-required');
  } else {
    const ageMs = now.getTime() - evaluatedAt.getTime();
    if (ageMs < 0) reasons.push('future-replacement-tournament-rejected');
    if (ageMs > maxReplacementAgeMinutes * 60000) reasons.push('stale-replacement-tournament-rejected');
  }
  if (triggerAt && evaluatedAt && evaluatedAt.getTime() < triggerAt.getTime()) reasons.push('replacement-must-postdate-trigger');
  if (priorSelectedKey && winnerKey && priorSelectedKey === winnerKey) reasons.push('drifted-winner-cannot-silently-retain-authority');

  return {
    ok: reasons.length === 0,
    status: reasons.length === 0 ? 'FRESH_REPLACEMENT_EVIDENCED' : 'REPLACEMENT_BLOCKED',
    reasons: [...new Set(reasons)],
    priorSelectedKey,
    replacementSelectedKey: winnerKey,
    triggerEvidenceRef,
    routingAuthority: reasons.length === 0 ? 'ELIGIBLE_FOR_PROVIDER_NEUTRAL_WORKER_COMPILATION_REVIEW' : 'NONE',
    promotionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    evaluatedAt: now.toISOString()
  };
}
