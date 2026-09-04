import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGenesisMetabolism } from '../src/genesis-metabolism.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

test('metabolism reaches sensing, economic, venture, resilience and final-frontier organs without external authority', () => {
  const result = buildGenesisMetabolism({
    gamechanger: {
      frontierSignals: [
        { id: 's1', source: 'source-a', domains: ['AI_MODELS'], confidence: 80, scores: { consequence: 20 } },
        { id: 's2', source: 'source-b', domains: ['PAYMENTS'], confidence: 60, scores: { consequence: 40 } },
        { id: 's3', source: 'source-c', domains: ['AI_MODELS'], confidence: 20, scores: { consequence: 10 } }
      ],
      providers: [
        { id: 'p1', capabilities: ['search', 'reason'] },
        { id: 'p2', capabilities: ['reason'] }
      ],
      removedProvider: 'p1',
      providerDependencies: [{ id: 'worker', dependencies: ['p1'] }],
      providerShocks: [{ provider: 'p1' }]
    },
    evolution: {
      cycles: [{
        portfolio: { options: [{ hypothesis: { buyer: 'agency', mechanismSketch: 'evidence reconciliation', laborCost: 10 } }] }
      }]
    },
    scientist: {
      laboratories: [{ signalId: 's1', status: 'SCIENTIST_LAB_READY' }],
      observations: [{ supports: 's1', weight: 2 }]
    },
    ontology: {
      cycle: { candidates: [{ name: 'evidence latency', uncertainty: 70, consequence: 30 }] }
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'GENESIS_METABOLISM_READY');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
  assert.equal(result.organs.sensing.status, 'WEAK_SIGNAL_FUSION_READY');
  assert.equal(result.organs.trust.status, 'TRUST_FRICTION_SCAN_READY');
  assert.equal(result.organs.venture.status, 'COMPANY_PHENOTYPE_COMPILED');
  assert.equal(result.organs.shocks.status, 'INFRASTRUCTURE_SHOCK_UNIVERSE_READY');
  assert.equal(result.organs.extinction.status, 'PROVIDER_EXTINCTION_DRILL_READY');
  assert.equal(result.organs.theoryTournament.truthClaim, false);
  assert.equal(result.activationAuthority, 'NONE');
  assert.equal(result.promotionAuthority, 'NONE');
});

test('metabolism fails venture activation closed when upstream evidence has no buyer or mechanism', () => {
  const result = buildGenesisMetabolism({ gamechanger: {}, evolution: {}, scientist: {}, ontology: {} });
  assert.equal(result.ok, true);
  assert.equal(result.organs.venture.ok, false);
  assert.equal(result.organs.venture.status, 'MORPHOGENESIS_BLOCKED');
  assert.equal(result.organs.venture.activationAuthority, 'NONE');
  assert.match(result.truthBoundary, /CANNOT_CREATE_MARKET_DEMAND/);
});
