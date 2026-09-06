import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileGamechangerMechanismPack } from '../src/gamechanger-mechanism-pack.mjs';
import { augmentCognitiveReceiptWithGamechangerMechanisms } from '../src/gamechanger-mechanism-cognitive.mjs';

const seedManifest=JSON.parse(fs.readFileSync(new URL('../data/gamechanger-mesh/manual-integration-seeds.json',import.meta.url),'utf8'));
const compiled=compileGamechangerMechanismPack({seedManifest,observedAt:'2026-09-06T12:00:00Z'});
const baseReceipt={schemaVersion:'uberbond.cognitive-cycle.v1',events:[],routes:[],sources:{gamechanger:true},activationSummary:{eventCount:0,activationCount:0,targetCounts:{}},truthBoundary:'BASE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};

test('all 25 mechanisms join the same whole-brain receipt with explicit organ activations',()=>{
  assert.equal(compiled.ok,true);
  const result=augmentCognitiveReceiptWithGamechangerMechanisms({receipt:baseReceipt,mechanismPack:compiled});
  assert.equal(result.ok,true);
  assert.equal(result.addedEvents,25);
  assert.equal(result.addedRoutes,25);
  assert.ok(result.addedActivations>=25);
  assert.equal(result.receipt.gamechangerMechanisms.mechanismCount,25);
  assert.equal(result.receipt.gamechangerMechanisms.runtimePrimitiveCount,25);
  assert.equal(result.receipt.gamechangerMechanisms.internallyIntegratedCount,25);
  assert.equal(result.receipt.sources.gamechangerMechanisms,true);
  for(const target of ['capability-genome','max-council','self-maintainer','omnia','event-horizon','payment-reconciliation','open-model-universe'])assert.ok(result.receipt.activationSummary.targetCounts[target]>0,target);
  assert.equal(result.receipt.businessEffectAuthority,'NONE');
  assert.equal(result.receipt.externalEffectAuthority,'NONE');
});

test('whole-brain augmentation is idempotent and does not duplicate mechanism events or routes',()=>{
  const first=augmentCognitiveReceiptWithGamechangerMechanisms({receipt:baseReceipt,mechanismPack:compiled});
  const second=augmentCognitiveReceiptWithGamechangerMechanisms({receipt:first.receipt,mechanismPack:compiled});
  assert.equal(second.ok,true);
  assert.equal(second.addedEvents,0);
  assert.equal(second.addedRoutes,0);
  assert.equal(second.addedActivations,0);
  assert.equal(second.receipt.events.length,25);
  assert.equal(second.receipt.routes.length,25);
});

test('an incomplete or authority-inflated pack is rejected atomically',()=>{
  const incomplete=structuredClone(compiled);
  incomplete.pack.mechanismCount=24;
  assert.equal(augmentCognitiveReceiptWithGamechangerMechanisms({receipt:baseReceipt,mechanismPack:incomplete}).ok,false);
  const inflated=structuredClone(compiled);
  inflated.pack.promotionAuthority='MERGE';
  assert.equal(augmentCognitiveReceiptWithGamechangerMechanisms({receipt:baseReceipt,mechanismPack:inflated}).ok,false);
});
