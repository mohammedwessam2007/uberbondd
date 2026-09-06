import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFrontierModelCandidateRegistry,
  frontierRoleCoverage,
  matchObservedProfilesToCandidates,
  compileFrontierModelTeamMission
} from '../src/frontier-model-team.mjs';

const registry = {
  schemaVersion: 'uberbond.frontier-model-candidates.v1',
  candidates: [
    {
      id: 'a', provider: 'openai', canonicalModel: 'alpha',
      rolePriors: ['planner', 'builder', 'verifier', 'adjudicator'], taskClassPriors: ['coding'],
      officialEvidenceRefs: ['https://example.com/a'], configured: false,
      gatewayTransport: {
        transportProvider: 'ai-gateway', transportModel: 'openai/alpha',
        sourceRef: 'https://vercel.com/ai-gateway/models/openai/alpha',
        observedAt: '2026-09-06T00:00:00.000Z', evidenceClass: 'OFFICIAL_SOURCE',
        pricingHintUsdPerMillion: { input: 1, output: 2, truth: 'NOT_PROFILE_PRICING_EVIDENCE' }
      }
    },
    {
      id: 'b', provider: 'anthropic', canonicalModel: 'beta',
      rolePriors: ['researcher', 'critic', 'builder', 'adjudicator'], taskClassPriors: ['research'],
      officialEvidenceRefs: ['https://example.com/b'], configured: false,
      gatewayTransport: {
        transportProvider: 'ai-gateway', transportModel: 'anthropic/beta',
        sourceRef: 'https://vercel.com/ai-gateway/models/anthropic/beta',
        observedAt: '2026-09-06T00:00:00.000Z', evidenceClass: 'OFFICIAL_SOURCE',
        pricingHintUsdPerMillion: { input: 1, output: 2, truth: 'NOT_PROFILE_PRICING_EVIDENCE' }
      }
    }
  ]
};

test('candidate registry is discovery evidence and cannot self-claim configured', () => {
  const ok = validateFrontierModelCandidateRegistry(registry);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const forged = structuredClone(registry);
  forged.candidates[0].configured = true;
  const rejected = validateFrontierModelCandidateRegistry(forged);
  assert.equal(rejected.ok, false);
  assert.ok(rejected.reasonCodes.some(code => code.startsWith('catalog-candidate-must-not-self-claim-configured')));
});

test('role coverage exposes gaps instead of inventing a specialist', () => {
  const coverage = frontierRoleCoverage(registry);
  assert.equal(coverage.ok, true);
  assert.deepEqual(coverage.gaps, []);
});

test('observed profile matching associates identity but does not claim callability', () => {
  const matched = matchObservedProfilesToCandidates({
    registry,
    profiles: [
      { id: 'alpha-live', provider: 'openai', model: 'alpha', revision: 'r1', transportProvider: 'ai-gateway', transportModel: 'openai/alpha', enabled: true },
      { id: 'unknown-live', provider: 'google', model: 'gamma', revision: 'r2', enabled: true }
    ]
  });
  assert.equal(matched.ok, true);
  assert.deepEqual(matched.configuredCandidateIds, ['a']);
  assert.deepEqual(matched.unmatchedProfiles, ['unknown-live']);
  assert.match(matched.truthBoundary, /CALLABILITY/);
});

test('frontier model team mission forces unknown-unknown search before convergence and independent verification after build', () => {
  const plan = compileFrontierModelTeamMission({ objective: 'Improve UberBond safely', complexity: 10, maxParallel: 6 });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const stages = new Map(plan.mission.stages.map(stage => [stage.id, stage]));
  assert.deepEqual(stages.get('unknown_unknown_scouts').dependencies, []);
  assert.ok(stages.get('mechanism_recombination').dependencies.includes('unknown_unknown_scouts'));
  assert.equal(stages.get('max_council').reasoningTier, 'COUNCIL_MAX');
  assert.ok(stages.get('independent_verification').dependencies.includes('bounded_builder'));
  assert.equal(plan.mission.businessEffectAuthority, 'NONE');
  assert.ok(plan.mission.invariants.some(line => /model agreement cannot create demand/i.test(line)));
});
