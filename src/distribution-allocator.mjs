// The first real distribution brain: given a bounded set of channels and
// (usually empty) historical outcomes, either selects a channel or -- the
// mathematically correct answer for almost every input in this system
// today -- returns DO_NOTHING. Never invents precision: with zero
// historical outcomes for a channel, its expected value is reported with
// confidence 0, not a plausible-looking guess.
export const DISTRIBUTION_ALLOCATOR_POLICY_VERSION = 'distribution-allocator-1.0.0';

// A channel's ExpectedCommercialValue from real historical outcomes only.
// `historicalOutcomes` are objects like { clearedRevenueUsd, cost }.
// Returns null expectedValueUsd (not 0) when there's no history --
// 0 would falsely claim "known to be worthless"; null honestly says
// "unknown."
function expectedValue(channel, historicalOutcomes) {
  const forChannel = historicalOutcomes.filter(o => o.channelId === channel.id);
  if (!forChannel.length) return { expectedValueUsd: null, confidence: 0, sampleSize: 0 };
  const netTotal = forChannel.reduce((sum, o) => sum + (Number(o.clearedRevenueUsd || 0) - Number(o.costUsd || 0)), 0);
  const sampleSize = forChannel.length;
  // Confidence grows with sample size but is deliberately capped low for
  // small samples -- this is the tiny-sample-overfitting guard: no amount
  // of averaging over 1-4 data points should look like real confidence.
  const confidence = sampleSize >= 30 ? 0.8 : sampleSize >= 10 ? 0.5 : sampleSize >= 3 ? 0.2 : 0.05;
  return { expectedValueUsd: Math.round((netTotal / sampleSize) * 100) / 100, confidence, sampleSize };
}

// experiment: the output of compileExperiment(). channels: the output of
// listChannels(cfg). historicalOutcomes: real outcome records (empty array
// is the honest default for this system today). budget/riskLimits bound
// what could ever be selected even if a channel looked attractive.
export function allocateDistribution({ experiment, channels = [], historicalOutcomes = [], budgetUsd = 0, minConfidenceToAct = 0.5, date = new Date() } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const timestamp = referenceDate.toISOString();
  if (!experiment || !experiment.ok) {
    return { ok: false, reason: 'malformed-input-experiment', policyVersion: DISTRIBUTION_ALLOCATOR_POLICY_VERSION, timestamp };
  }

  const boundedBudget = Math.max(0, Number(budgetUsd) || 0);
  const candidates = channels
    .filter(channel => channel.available)
    .map(channel => ({ channel, ...expectedValue(channel, historicalOutcomes) }))
    .sort((a, b) => (b.expectedValueUsd ?? -Infinity) - (a.expectedValueUsd ?? -Infinity));

  const winner = candidates.find(c => c.confidence >= minConfidenceToAct && (c.expectedValueUsd ?? -Infinity) > 0 && boundedBudget > 0);

  if (!winner) {
    const reason = boundedBudget <= 0 ? 'no-budget-authorized'
      : candidates.length === 0 ? 'no-available-channels'
      : 'no-channel-meets-confidence-and-value-threshold';
    return {
      ok: true, decision: 'DO_NOTHING', selectedChannel: null, reason, policyVersion: DISTRIBUTION_ALLOCATOR_POLICY_VERSION,
      timestamp, rankedAlternatives: candidates.map(c => ({ channelId: c.channel.id, expectedValueUsd: c.expectedValueUsd, confidence: c.confidence, sampleSize: c.sampleSize })),
      requiredAuthority: []
    };
  }

  return {
    ok: true, decision: 'SELECT_CHANNEL', selectedChannel: winner.channel.id,
    expectedValueUsd: winner.expectedValueUsd, confidence: winner.confidence, sampleSize: winner.sampleSize,
    policyVersion: DISTRIBUTION_ALLOCATOR_POLICY_VERSION, timestamp,
    rankedAlternatives: candidates.map(c => ({ channelId: c.channel.id, expectedValueUsd: c.expectedValueUsd, confidence: c.confidence, sampleSize: c.sampleSize })),
    requiredAuthority: winner.channel.authorityRequirements
  };
}
