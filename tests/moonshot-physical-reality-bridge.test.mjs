import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileRealityBridgeShellFromPacket,
  compileRealityProbeContract,
  ingestRealityProbeResult
} from '../src/moonshot-physical-reality-bridge.mjs';

test('external packet becomes a bridge shell without gaining authority',()=>{
  const r=compileRealityBridgeShellFromPacket({
    stableId:'founder-moonshot-0004',
    literalTitle:'COUNTERFACTUAL MICROSCOPE',
    realizationSurface:'PHYSICAL'
  });
  assert.equal(r.ok,true);
  assert.equal(r.adapterClass,'PHYSICAL_LAB');
  assert.equal(r.executionAuthority,'NONE');
  assert.equal(r.specialistProtocolState,'DOMAIN_SPECIALIST_PROTOCOL_REQUIRED');
});

test('effectful human probe remains gated without authority and consent',()=>{
  const r=compileRealityProbeContract({
    stableId:'x',title:'human test',realizationSurface:'HUMAN',
    hypothesis:'A improves outcome.',rivalHypothesis:'A does not improve outcome.',
    predictedObservation:'metric increases',rivalPredictedObservation:'metric does not increase',
    measurement:'pre-registered metric',interventionType:'INTERVENTION',
    interventionDescription:'bounded reversible intervention',
    reversibility:'REVERSIBLE',riskClass:'LOW',
    estimatedCostCents:0,estimatedTimeMinutes:30
  });
  assert.equal(r.ok,true);
  assert.equal(r.status,'REALITY_PROBE_CONTRACT_GATED');
  assert.ok(r.gateReasons.includes('explicit-authority-ref-required'));
  assert.ok(r.gateReasons.includes('recorded-consent-required'));
  assert.equal(r.executionAuthority,'NONE');
});

test('generic bridge refuses high-risk experiment admission',()=>{
  const r=compileRealityProbeContract({
    stableId:'x',title:'lab test',realizationSurface:'PHYSICAL',
    hypothesis:'A',rivalHypothesis:'B',
    predictedObservation:'x',rivalPredictedObservation:'y',
    measurement:'m',interventionType:'INTERVENTION',
    interventionDescription:'bounded experiment',
    reversibility:'REVERSIBLE',riskClass:'HIGH',
    specialistProtocolRef:'protocol:expert',authorityRef:'authority:owner',
    rollbackPlan:'stop and restore declared baseline'
  });
  assert.equal(r.status,'REALITY_PROBE_CONTRACT_GATED');
  assert.ok(r.gateReasons.includes('high-risk-probe-not-admitted-by-generic-bridge'));
});

test('synthetic ancestry cannot be ingested as clean observed proof',()=>{
  const r=ingestRealityProbeResult({
    contract:{stableId:'x'},
    observationRef:'receipt:lab-observation',
    verifierRef:'verifier:lab',
    observedAt:'2026-09-20T19:00:00+03:00',
    measurements:{value:1},
    resultSummary:'observed',
    syntheticAncestors:['artifact:simulation']
  });
  assert.equal(r.ok,false);
  assert.equal(r.status,'REALITY_PROBE_RESULT_CONTAMINATED');
});

test('clean external observation ingests without auto-promotion',()=>{
  const r=ingestRealityProbeResult({
    contract:{stableId:'x'},
    observationRef:'receipt:lab-observation',
    verifierRef:'verifier:lab',
    observedAt:'2026-09-20T19:00:00+03:00',
    measurements:{value:1},
    resultSummary:'observed'
  });
  assert.equal(r.ok,true);
  assert.equal(r.status,'REALITY_PROBE_OBSERVATION_INGESTED');
  assert.equal(r.promotionAuthority,'NONE');
});
