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
  assert.deepEqual(coverage.gaps, ['general']);
  assert.deepEqual(coverage.coverage.general, []);
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



test('candidate registry permits discovery-only and strictly evidenced direct-transport candidates without inventing Gateway reachability', () => {
  const expanded = structuredClone(registry);
  expanded.candidates.push(
    {
      id: 'direct-opus', provider: 'anthropic', canonicalModel: 'claude-opus-5-5',
      rolePriors: ['planner', 'researcher'], taskClassPriors: ['research'],
      officialEvidenceRefs: ['https://example.com/opus'], configured: false,
      directTransportCandidate: {
        transportProvider: 'anthropic',
        transportModel: 'claude-opus-5-5',
        reasoningSettingRefs: ['anthropic:effort=max'],
        sourceRefs: ['https://example.com/opus-direct'],
        observedAt: '2026-09-29T00:00:00.000Z',
        evidenceClass: 'OFFICIAL_SOURCE',
        runtimeProof: 'REQUIRED_BEFORE_ROUTING',
        pricingHintUsdPerMillion: {
          input: 4, output: 20,
          truth: 'OFFICIAL_LIST_PRICE_DISCOVERY_HINT_NOT_RUNTIME_BILLING_RECEIPT'
        }
      }
    },
    {
      id: 'discovery-only', provider: 'future-lab', canonicalModel: 'future-model',
      rolePriors: ['general'], taskClassPriors: ['general'],
      officialEvidenceRefs: ['https://example.com/future-model'], configured: false
    }
  );
  const out = validateFrontierModelCandidateRegistry(expanded);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.directTransportCandidateCount, 1);
  assert.equal(out.discoveryOnlyCandidateCount, 1);
});

test('malformed direct transport is rejected and discovery evidence cannot self-promote to callability', () => {
  const malformed = structuredClone(registry);
  malformed.candidates.push({
    id: 'bad-direct', provider: 'anthropic', canonicalModel: 'claude-opus-5-5',
    rolePriors: ['planner'], taskClassPriors: ['research'],
    officialEvidenceRefs: ['https://example.com/opus'], configured: false,
    directTransportCandidate: {
      transportProvider: 'openai',
      transportModel: 'wrong-model',
      reasoningSettingRefs: [],
      sourceRefs: [],
      observedAt: 'not-a-date',
      evidenceClass: 'SELF_CLAIM',
      runtimeProof: 'CALLABLE_NOW',
      pricingHintUsdPerMillion: { truth: 'TRUST_ME' }
    }
  });
  const out = validateFrontierModelCandidateRegistry(malformed);
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.some(code => code.startsWith('direct-transport-provider-must-match-cognitive-provider')));
  assert.ok(out.reasonCodes.some(code => code.startsWith('direct-runtime-proof-gate-required')));
  assert.ok(out.reasonCodes.some(code => code.startsWith('direct-pricing-hint-truth-boundary-required')));
});

test('profile matching supports direct transport but leaves transportless discovery candidates unconfigured', () => {
  const expanded = structuredClone(registry);
  expanded.candidates.push(
    {
      id: 'direct-opus', provider: 'anthropic', canonicalModel: 'claude-opus-5-5',
      rolePriors: ['planner'], taskClassPriors: ['research'],
      officialEvidenceRefs: ['https://example.com/opus'], configured: false,
      directTransportCandidate: {
        transportProvider: 'anthropic', transportModel: 'claude-opus-5-5',
        reasoningSettingRefs: ['anthropic:effort=max'],
        sourceRefs: ['https://example.com/opus-direct'],
        observedAt: '2026-09-29T00:00:00.000Z', evidenceClass: 'OFFICIAL_SOURCE',
        runtimeProof: 'REQUIRED_BEFORE_ROUTING',
        pricingHintUsdPerMillion: { input: 4, output: 20, truth: 'NOT_RUNTIME_BILLING_RECEIPT' }
      }
    },
    {
      id: 'watch-only', provider: 'future-lab', canonicalModel: 'future-model',
      rolePriors: ['general'], taskClassPriors: ['general'],
      officialEvidenceRefs: ['https://example.com/future'], configured: false
    }
  );
  const matched = matchObservedProfilesToCandidates({
    registry: expanded,
    profiles: [
      {
        id: 'opus-live', provider: 'anthropic', model: 'claude-opus-5-5', revision: 'r1',
        transportProvider: 'anthropic', transportModel: 'claude-opus-5-5', enabled: true
      },
      {
        id: 'future-unrouted', provider: 'future-lab', model: 'future-model', revision: 'r1',
        transportProvider: 'future-lab', transportModel: 'future-model', enabled: true
      }
    ]
  });
  assert.equal(matched.ok, true);
  assert.deepEqual(matched.configuredCandidateIds, ['direct-opus']);
  assert.equal(matched.matches.find(row => row.candidateId === 'direct-opus').directTransportMatches, true);
  assert.equal(matched.matches.find(row => row.candidateId === 'watch-only').transportCandidateMatches, false);
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
