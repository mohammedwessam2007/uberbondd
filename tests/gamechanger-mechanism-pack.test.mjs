import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileGamechangerMechanismPack, GAMECHANGER_MECHANISM_BINDINGS } from '../src/gamechanger-mechanism-pack.mjs';

const seedManifest=JSON.parse(fs.readFileSync(new URL('../data/gamechanger-mesh/manual-integration-seeds.json',import.meta.url),'utf8'));
const integrationQueue={queue:{entries:seedManifest.seeds.map((seed,index)=>({canonicalMechanismId:seed.id,queueState:index%2===0?'BOUNDED_EXPERIMENT_READY_FOR_PROPOSAL':'PRIMARY_EVIDENCE_REBINDING_REQUIRED',evidenceState:index%2===0?'LIVE_PUBLIC_EVIDENCE_MATCHED_NOT_ECONOMIC_PROOF':seed.evidenceState,evidenceRefs:index%2===0?[`https://example.com/evidence/${seed.id}`]:[],liveFingerprint:index%2===0?'a'.repeat(64):null,engineeringEligible:index%2===0}))}};

test('all 25 seeded ideas compile into first-class internally integrated mechanisms',()=>{
  const result=compileGamechangerMechanismPack({seedManifest,integrationQueue,observedAt:'2026-09-06T12:00:00Z'});
  assert.equal(result.ok,true);
  assert.equal(result.status,'ALL_GAMECHANGER_MECHANISMS_INTEGRATED');
  assert.equal(result.pack.mechanismCount,25);
  assert.equal(result.pack.runtimePrimitiveCount,25);
  assert.equal(result.pack.internallyIntegratedCount,25);
  assert.equal(result.pack.allIdeasOperationalized,true);
  assert.equal(result.pack.allIdeasBoundToExistingOrgans,true);
  assert.ok(result.pack.targetOrganCount>=10);
  assert.equal(result.pack.promotionAuthority,'NONE');
  assert.equal(result.pack.executableExternalAuthority,'NONE');
  assert.equal(result.pack.commercialTruthAuthority,'NONE');
  assert.ok(Object.values(result.externalEffectLedger).every(value=>value===0));
});

test('every seed has exactly one declared binding and every mechanism has explicit organ activations',()=>{
  const ids=seedManifest.seeds.map(seed=>seed.id).sort();
  assert.deepEqual(Object.keys(GAMECHANGER_MECHANISM_BINDINGS).sort(),ids);
  const result=compileGamechangerMechanismPack({seedManifest,integrationQueue,observedAt:'2026-09-06T12:00:00Z'});
  for(const mechanism of result.pack.mechanisms){
    assert.equal(mechanism.integrationState,'INTERNAL_CONTROL_PLANE_INTEGRATED');
    assert.equal(mechanism.primitive.implemented,true);
    assert.ok(mechanism.targetOrgans.length>0,mechanism.mechanismId);
    assert.equal(mechanism.organActivations.length,mechanism.targetOrgans.length);
    assert.equal(mechanism.cognitiveEvent.ok,true);
    assert.equal(mechanism.cognitiveRoute.ok,true);
    assert.equal(mechanism.promotionAuthority,'NONE');
    assert.equal(mechanism.executableExternalAuthority,'NONE');
    assert.equal(mechanism.economicProof,'NONE');
  }
});

test('pack emits organ-specific work queues for security, capability, engineering, commerce and economics organs',()=>{
  const result=compileGamechangerMechanismPack({seedManifest,integrationQueue,observedAt:'2026-09-06T12:00:00Z'});
  for(const organ of ['capability-genome','max-council','wallbreaker','self-maintainer','omnia','event-horizon','payment-reconciliation','fulfilment-qa','open-model-universe','economic-memory']){
    assert.ok(Array.isArray(result.pack.organWorkQueues[organ]),`missing ${organ}`);
    assert.ok(result.pack.organWorkQueues[organ].length>0,`empty ${organ}`);
  }
});

test('missing a runtime or binding fails closed instead of silently dropping an idea',()=>{
  const augmented={...seedManifest,seeds:[...seedManifest.seeds,{id:'brand-new-unbound-idea',title:'Unbound',mechanism:'No binding yet',smallestExperiment:'Test it',attentionState:'RESEARCH',evidenceState:'UNKNOWN',keywords:['unbound']}]};
  const result=compileGamechangerMechanismPack({seedManifest:augmented,observedAt:'2026-09-06T12:00:00Z'});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('complete-mechanism-binding-and-runtime-coverage-required'));
});
