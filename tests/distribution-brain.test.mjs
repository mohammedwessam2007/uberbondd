import test from 'node:test';
import assert from 'node:assert/strict';
import { listChannels, getChannel, CHANNEL_IDS } from '../src/distribution-channel-registry.mjs';
import { allocateDistribution } from '../src/distribution-allocator.mjs';
import { compileExperiment } from '../src/experiment-compiler.mjs';
import { scoreOpportunity } from '../src/opportunity-registry.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function realExperiment() {
  const scored = scoreOpportunity({ candidate: { id: 'opp-1', name: 'Test' }, date: monday });
  return compileExperiment({ scoredOpportunity: scored, date: monday, maxBudgetUsd: 100 });
}

test('direct-outbound is only available when the real config actually enables live, non-dry-run outbound', () => {
  const disabled = listChannels({ outbound: { enabled: false, dryRun: true } });
  assert.equal(disabled.find(c => c.id === 'direct-outbound').available, false);
  const dryRun = listChannels({ outbound: { enabled: true, dryRun: true } });
  assert.equal(dryRun.find(c => c.id === 'direct-outbound').available, false);
  const live = listChannels({ outbound: { enabled: true, dryRun: false } });
  assert.equal(live.find(c => c.id === 'direct-outbound').available, true);
});

test('every channel with no infrastructure configured in this codebase is honestly unavailable', () => {
  const channels = listChannels({});
  const credentialGated = ['meta-ads', 'google-ads', 'partner', 'referral', 'marketplace', 'affiliate', 'creator', 'community', 'retargeting'];
  for (const id of credentialGated) assert.equal(channels.find(c => c.id === id).available, false, `${id} should not be available`);
});

test('every channel starts with zero historical outcomes -- real, not a placeholder bug', () => {
  for (const channel of listChannels({})) assert.deepEqual(channel.historicalOutcomes, []);
});

test('getChannel returns null for an unknown id rather than throwing', () => {
  assert.equal(getChannel('not-a-real-channel', {}), null);
});

test('CHANNEL_IDS matches what listChannels actually returns', () => {
  assert.deepEqual(listChannels({}).map(c => c.id).sort(), [...CHANNEL_IDS].sort());
});

test('with zero historical outcomes anywhere, the allocator correctly returns DO_NOTHING even with real budget and available channels', () => {
  const channels = listChannels({ outbound: { enabled: true, dryRun: false }, revenue: { publicIntake: true } });
  const result = allocateDistribution({ experiment: realExperiment(), channels, historicalOutcomes: [], budgetUsd: 500, date: monday });
  assert.equal(result.decision, 'DO_NOTHING');
  assert.equal(result.selectedChannel, null);
});

test('zero budget always produces DO_NOTHING regardless of how attractive a channel looks', () => {
  const channels = listChannels({ outbound: { enabled: true, dryRun: false } });
  const outcomes = Array.from({ length: 50 }, () => ({ channelId: 'direct-outbound', clearedRevenueUsd: 100, costUsd: 5 }));
  const result = allocateDistribution({ experiment: realExperiment(), channels, historicalOutcomes: outcomes, budgetUsd: 0, date: monday });
  assert.equal(result.decision, 'DO_NOTHING');
  assert.equal(result.reason, 'no-budget-authorized');
});

test('a channel with a large, real, positive-outcome sample size can genuinely win -- the mechanism is real, not rigged to always say no', () => {
  const channels = listChannels({ outbound: { enabled: true, dryRun: false } });
  const outcomes = Array.from({ length: 40 }, () => ({ channelId: 'direct-outbound', clearedRevenueUsd: 100, costUsd: 5 }));
  const result = allocateDistribution({ experiment: realExperiment(), channels, historicalOutcomes: outcomes, budgetUsd: 500, date: monday });
  assert.equal(result.decision, 'SELECT_CHANNEL');
  assert.equal(result.selectedChannel, 'direct-outbound');
  assert.ok(result.confidence >= 0.5);
});

test('a tiny sample size (1-2 outcomes) never produces enough confidence to act -- the overfitting guard is real', () => {
  const channels = listChannels({ outbound: { enabled: true, dryRun: false } });
  const outcomes = [{ channelId: 'direct-outbound', clearedRevenueUsd: 1000, costUsd: 1 }];
  const result = allocateDistribution({ experiment: realExperiment(), channels, historicalOutcomes: outcomes, budgetUsd: 500, minConfidenceToAct: 0.5, date: monday });
  assert.equal(result.decision, 'DO_NOTHING');
});

test('a net-negative channel history never wins even with a large sample', () => {
  const channels = listChannels({ outbound: { enabled: true, dryRun: false } });
  const outcomes = Array.from({ length: 40 }, () => ({ channelId: 'direct-outbound', clearedRevenueUsd: 5, costUsd: 100 }));
  const result = allocateDistribution({ experiment: realExperiment(), channels, historicalOutcomes: outcomes, budgetUsd: 500, date: monday });
  assert.equal(result.decision, 'DO_NOTHING');
});

test('malformed experiment input is rejected cleanly', () => {
  const result = allocateDistribution({ experiment: null, channels: [], date: monday });
  assert.equal(result.ok, false);
});

test('rankedAlternatives always reflects only available channels', () => {
  const channels = listChannels({});
  const result = allocateDistribution({ experiment: realExperiment(), channels, budgetUsd: 100, date: monday });
  assert.equal(result.rankedAlternatives.length, 0, 'no channel is available in a default/empty config');
});
