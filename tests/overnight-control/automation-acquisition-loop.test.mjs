import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURATED_AUTOMATION_CANDIDATES,
  compileAcquisitionEngineeringPacket,
  normalizeAutomationCandidate,
  runAutomationAcquisitionLoop,
  scoreAutomationCandidate
} from '../../src/overnight/control/automation-acquisition-loop.mjs';

function candidate(overrides = {}) {
  return {
    repo: 'example/tool',
    capabilityKey: 'example-gap',
    capabilityLabel: 'Example gap',
    coverage: 'MISSING',
    sourceMode: 'API_ADAPTER',
    licenseSpdx: 'MIT',
    stars: 10000,
    pushedAt: '2026-08-28T12:00:00.000Z',
    observedAt: '2026-08-28T15:00:00.000Z',
    patterns: ['bounded adapter'],
    existingUberBondModules: ['src/provider-adapter-contract.mjs'],
    priorities: {
      economicLeverage: 8,
      founderMinuteReduction: 8,
      reuseAcrossOffers: 8,
      maintenanceBurden: 4,
      externalEffectRisk: 4
    },
    ...overrides
  };
}

test('curated tournament selects the genuinely missing voice/telephony surface before redundant workflow engines', () => {
  const result = runAutomationAcquisitionLoop();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'GAP_SELECTED');
  assert.equal(result.selected.candidate.capabilityKey, 'voice-reception-and-call-lifecycle');
  const n8n = result.ranked.find(item => item.candidate.repo === 'n8n-io/n8n');
  assert.equal(n8n.decision, 'REFERENCE_ONLY');
  assert.ok(n8n.reasonCodes.includes('canonical-capability-already-reuse-ready'));
});

test('acquisition decisions never grant business effects', () => {
  const result = runAutomationAcquisitionLoop();
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
  for (const item of result.ranked) {
    assert.equal(item.businessEffectAuthority, 'NONE');
    assert.equal(item.externalEffectLedger.spendCents, 0);
    assert.equal(item.externalEffectLedger.messages, 0);
  }
});

test('AGPL and license-unknown repositories are blocked from automatic core code copying', () => {
  const agpl = scoreAutomationCandidate(candidate({ licenseSpdx: 'AGPL-3.0' }));
  assert.equal(agpl.ok, true);
  assert.equal(agpl.licenseCopyPolicy, 'NO_CORE_CODE_COPY');
  assert.ok(agpl.reasonCodes.includes('license-prohibits-automatic-core-copy'));

  const unknown = scoreAutomationCandidate(candidate({ licenseSpdx: 'NOASSERTION' }));
  assert.equal(unknown.ok, true);
  assert.equal(unknown.licenseCopyPolicy, 'NO_CORE_CODE_COPY');
});

test('permissive licenses still require review before source-code reuse', () => {
  const scored = scoreAutomationCandidate(candidate({ licenseSpdx: 'MIT' }));
  assert.equal(scored.licenseCopyPolicy, 'REVIEW_REQUIRED_BEFORE_CODE_REUSE');
  assert.equal(scored.decision, 'BUILD_ADAPTER');
});

test('stale repository evidence fails closed to DEFER', () => {
  const stale = scoreAutomationCandidate(candidate({
    pushedAt: '2025-01-01T00:00:00.000Z',
    observedAt: '2026-08-28T15:00:00.000Z'
  }));
  assert.equal(stale.ok, true);
  assert.equal(stale.decision, 'DEFER');
  assert.ok(stale.reasonCodes.includes('stale-source-evidence'));
});

test('future-dated repository evidence is rejected instead of treated as fresh', () => {
  const normalized = normalizeAutomationCandidate(candidate({
    pushedAt: '2026-08-29T00:00:00.000Z',
    observedAt: '2026-08-28T15:00:00.000Z'
  }));
  assert.equal(normalized.ok, false);
  assert.ok(normalized.reasonCodes.includes('future-dated-source-evidence'));
});

test('conflicting evidence for one repository fails the whole loop closed', () => {
  const result = runAutomationAcquisitionLoop({
    candidates: [
      candidate(),
      candidate({ capabilityKey: 'different-gap' })
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('conflicting-repository-evidence'));
  assert.equal(result.selected, null);
});

test('exact duplicate repository observations are deduplicated deterministically', () => {
  const first = candidate();
  const result = runAutomationAcquisitionLoop({ candidates: [first, structuredClone(first)] });
  assert.equal(result.ok, true);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.duplicateCount, 1);
});

test('acquisition digest is invariant to candidate ordering', () => {
  const forward = runAutomationAcquisitionLoop({ candidates: CURATED_AUTOMATION_CANDIDATES });
  const reverse = runAutomationAcquisitionLoop({ candidates: [...CURATED_AUTOMATION_CANDIDATES].reverse() });
  assert.equal(forward.ok, true);
  assert.equal(reverse.ok, true);
  assert.equal(forward.acquisitionDigest, reverse.acquisitionDigest);
});

test('engineering packet keeps live activation external and preserves canonical authority boundaries', () => {
  const result = compileAcquisitionEngineeringPacket();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ENGINEERING_PACKET_READY');
  assert.equal(result.packet.capabilityKey, 'voice-reception-and-call-lifecycle');
  assert.equal(result.packet.externalActivation, 'EXTERNAL_PROOF_REQUIRED');
  assert.equal(result.packet.businessEffectAuthority, 'NONE');
  assert.equal(result.packet.externalEffectLedger.providerCalls, 0);
  assert.equal(result.packet.externalEffectLedger.messages, 0);
  assert.ok(result.packet.acceptance.some(item => item.includes('disabled by default')));
  assert.ok(result.packet.implementationLaw.some(item => item.includes('do not vendor')));
});

test('malformed repository names and non-finite priorities are rejected', () => {
  const badRepo = normalizeAutomationCandidate(candidate({ repo: '../../evil' }));
  assert.equal(badRepo.ok, false);
  assert.ok(badRepo.reasonCodes.includes('invalid-repository'));

  const badScore = normalizeAutomationCandidate(candidate({
    priorities: {
      economicLeverage: Number.NaN,
      founderMinuteReduction: 8,
      reuseAcrossOffers: 8,
      maintenanceBurden: 4,
      externalEffectRisk: 4
    }
  }));
  assert.equal(badScore.ok, false);
  assert.ok(badScore.reasonCodes.includes('invalid-priority-economicLeverage'));
});
