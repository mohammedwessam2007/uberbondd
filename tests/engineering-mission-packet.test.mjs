import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEngineeringMissionPacket } from '../src/engineering-mission-packet.mjs';
import { compileUpgradeProposal } from '../src/upgrade-proposal.mjs';
import { scoreOpportunity, incrementalBuildDistance } from '../src/opportunity-registry.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function verified(value) { return { value, claimType: 'VERIFIED_FACT' }; }

function buildProposal() {
  const opportunityScore = scoreOpportunity({
    candidate: {
      id: 'opp-1', name: 'Test',
      timeToCashDays: verified(1), recurringTrigger: verified(true), retention: verified(85),
      grossMargin: verified(90), automationPotential: verified(95), founderBurden: verified(10),
      acquisition: verified('proven'), partnerLeverage: verified('moderate'), dataAsset: verified('some'),
      platformDependency: verified('low'), capital: verified('none'), moat: verified('moderate'),
      aiResilience: verified('resilient'), scale: verified('global'), acquisitionValue: verified('medium'),
      founderOwnershipRetainedPercent: verified(100)
    },
    date: monday
  });
  const buildDistanceResult = incrementalBuildDistance(['x'], ['x']);
  return compileUpgradeProposal({ opportunityScore, buildDistanceResult, date: monday });
}

test('malformed upgradeProposal is rejected cleanly', () => {
  const result = compileEngineeringMissionPacket({ upgradeProposal: null, date: monday });
  assert.equal(result.ok, false);
});

test('a REJECT/DEFER/BUY/PARTNER decision produces no packet -- nothing to commission', () => {
  const opportunityScore = scoreOpportunity({ candidate: { id: 'opp-1', name: 'Weak' }, date: monday });
  const proposal = compileUpgradeProposal({ opportunityScore, buildDistanceResult: incrementalBuildDistance(['x'], []), date: monday });
  assert.equal(proposal.decision, 'REJECT');
  const packet = compileEngineeringMissionPacket({ upgradeProposal: proposal, date: monday });
  assert.equal(packet.ok, false);
  assert.match(packet.reason, /not-applicable-for-decision/);
});

test('a BUILD decision produces a real packet', () => {
  const proposal = buildProposal();
  assert.equal(proposal.decision, 'BUILD');
  const packet = compileEngineeringMissionPacket({ upgradeProposal: proposal, date: monday });
  assert.equal(packet.ok, true);
  assert.equal(packet.missingCapability, 'Test');
});

test('lite/ is always forbidden, unconditionally, even if a caller tries to override it', () => {
  const proposal = buildProposal();
  const packet = compileEngineeringMissionPacket({
    upgradeProposal: proposal, repositoryContext: { additionalForbiddenPaths: [] }, date: monday
  });
  assert.ok(packet.forbiddenPaths.includes('lite/'));
});

test('forbiddenPaths merges additional paths without ever dropping the hardcoded ones', () => {
  const proposal = buildProposal();
  const packet = compileEngineeringMissionPacket({
    upgradeProposal: proposal, repositoryContext: { additionalForbiddenPaths: ['secrets/'] }, date: monday
  });
  assert.ok(packet.forbiddenPaths.includes('lite/'));
  assert.ok(packet.forbiddenPaths.includes('secrets/'));
});

test('proofRequirements always demands zero regressions and forbids unauthorized external effects', () => {
  const packet = compileEngineeringMissionPacket({ upgradeProposal: buildProposal(), date: monday });
  assert.ok(packet.proofRequirements.some(r => /zero regressions/.test(r)));
  assert.ok(packet.proofRequirements.some(r => /external network call|spend|credential/.test(r)));
});

test('rollback is always stated, never left implicit', () => {
  const packet = compileEngineeringMissionPacket({ upgradeProposal: buildProposal(), date: monday });
  assert.ok(packet.rollback.length > 0);
});
