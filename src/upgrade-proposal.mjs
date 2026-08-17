// BUILD/BUY/PARTNER/ADAPT/DEFER/REJECT router. Default: DO NOT BUILD
// COMMODITIES, and do not build anything without real evidence backing it.
// Deliberately conservative -- DEFER is the fallback, not BUILD, so a weak
// or ambiguous case can never accidentally look like a green light to
// write code.
export const UPGRADE_PROPOSAL_POLICY_VERSION = 'upgrade-proposal-1.0.0';
export const UPGRADE_DECISIONS = Object.freeze(['BUILD', 'BUY', 'PARTNER', 'ADAPT', 'DEFER', 'REJECT']);

// Pure routing logic, isolated so the BUILD-bias hostile tests can drive
// it directly without needing a full opportunity/build-distance object.
export function routeUpgradeDecision({ buildDistance, confidence, compositeScore, isCommodity = false } = {}) {
  const distance = Number.isFinite(buildDistance) ? buildDistance : 1;
  const conf = Number.isFinite(confidence) ? confidence : 0;
  const score = Number.isFinite(compositeScore) ? compositeScore : 0;

  if (score < 30) return 'REJECT'; // no economic value signal strong enough to justify any action
  if (isCommodity) return distance <= 0.2 ? 'BUY' : 'PARTNER'; // never BUILD a commodity regardless of distance
  if (conf < 0.3) return 'DEFER'; // insufficient evidence to commit engineering time, however cheap it looks
  if (distance <= 0.3) return 'BUILD'; // genuinely cheap AND evidenced AND non-commodity
  if (distance <= 0.7) return 'ADAPT';
  return 'DEFER';
}

// opportunityScore: a real scoreOpportunity() result. buildDistanceResult:
// a real incrementalBuildDistance() result. Both required -- this module
// never proposes an upgrade without a scored opportunity and a computed
// build distance behind it.
export function compileUpgradeProposal({ opportunityScore, buildDistanceResult, isCommodity = false, expectedAffectedOpportunityIds = [], date = new Date() } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();
  if (!opportunityScore?.ok || !buildDistanceResult) {
    return { ok: false, reason: 'malformed-input', policyVersion: UPGRADE_PROPOSAL_POLICY_VERSION, timestamp };
  }

  const decision = routeUpgradeDecision({
    buildDistance: buildDistanceResult.distance, confidence: opportunityScore.confidence,
    compositeScore: opportunityScore.compositeScore, isCommodity
  });

  return {
    ok: true, policyVersion: UPGRADE_PROPOSAL_POLICY_VERSION, timestamp,
    proposedCapability: opportunityScore.name,
    economicRationale: `compositeScore=${opportunityScore.compositeScore}, confidence=${opportunityScore.confidence}, dataSufficiency=${opportunityScore.dataSufficiency}`,
    evidence: { compositeScore: opportunityScore.compositeScore, confidence: opportunityScore.confidence, dataSufficiency: opportunityScore.dataSufficiency, missingCriteria: opportunityScore.missingCriteria },
    expectedAffectedOpportunityIds,
    reuse: buildDistanceResult.reused,
    buildDistance: buildDistanceResult.distance,
    missingCapabilities: buildDistanceResult.missing,
    decision,
    testPlan: decision === 'BUILD' || decision === 'ADAPT'
      ? 'Hostile tests covering the new/changed capability, plus a full regression run before merge.'
      : 'No test plan -- this proposal does not authorize new code.',
    killCriteria: [
      'Confidence drops below 0.3 on re-scoring.',
      'The underlying opportunity is superseded by a higher-scoring alternative.',
      'buildDistance was miscalculated and the real cost is materially higher.'
    ]
  };
}
