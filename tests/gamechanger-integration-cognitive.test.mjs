import test from 'node:test';
import assert from 'node:assert/strict';
import { augmentCognitiveReceiptWithGamechangerIntegration } from '../src/gamechanger-integration-cognitive.mjs';

function receipt() {
  return {
    schemaVersion:'uberbond.cognitive-cycle.v1',
    generatedAt:'2026-09-06T11:00:00.000Z',
    events:[],
    routes:[],
    activationSummary:{eventCount:0,activationCount:0,targetCounts:{}},
    sources:{gamechanger:true},
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'BASE COGNITIVE TRUTH BOUNDARY.'
  };
}
function queue({eligible=true}={}) {
  return {
    ok:true,
    status:'GAMECHANGER_INTEGRATION_QUEUE_READY',
    queue:{
      schemaVersion:'uberbond.gamechanger-integration-queue.v1',
      generatedAt:'2026-09-06T11:01:00.000Z',
      entries:[{
        canonicalMechanismId:'capability-distillation-factory',
        queueState:eligible?'BOUNDED_EXPERIMENT_READY_FOR_PROPOSAL':'PRIMARY_EVIDENCE_REBINDING_REQUIRED',
        engineeringEligible:eligible,
        promotionAuthority:'NONE',
        executableAuthority:'NONE'
      }],
      promotionAuthority:'NONE',
      executableAuthority:'NONE',
      commercialTruthAuthority:'NONE'
    }
  };
}

test('integration queue becomes a routed cognitive event without consequence authority', () => {
  const result = augmentCognitiveReceiptWithGamechangerIntegration({receipt:receipt(),integrationQueue:queue()});
  assert.equal(result.ok,true);
  assert.equal(result.status,'GAMECHANGER_INTEGRATION_COGNITIVE_AUGMENTED');
  assert.equal(result.receipt.events.length,1);
  assert.equal(result.receipt.routes.length,1);
  assert.equal(result.receipt.gamechangerIntegration.queueCount,1);
  assert.equal(result.receipt.gamechangerIntegration.engineeringEligibleCount,1);
  assert.equal(result.receipt.gamechangerIntegration.promotionAuthority,'NONE');
  assert.equal(result.receipt.events[0].event.consequenceAuthority,'NONE');
  assert.equal(result.receipt.events[0].event.businessEffectAuthority,'NONE');
  assert.ok(result.targetNodeIds.includes('capability-genome'));
  assert.ok(result.targetNodeIds.includes('max-council'));
});

test('research-only queue routes as capability gap and remains non-executable', () => {
  const result = augmentCognitiveReceiptWithGamechangerIntegration({receipt:receipt(),integrationQueue:queue({eligible:false})});
  assert.equal(result.ok,true);
  assert.equal(result.receipt.events[0].event.kind,'CAPABILITY_GAP');
  assert.equal(result.receipt.gamechangerIntegration.engineeringEligibleCount,0);
  assert.equal(result.receipt.externalEffectAuthority,'NONE');
  assert.match(result.receipt.truthBoundary,/DO NOT BECOME IMPLEMENTATION PROOF/);
});

test('cognitive augmentation is idempotent for the same queue event', () => {
  const first = augmentCognitiveReceiptWithGamechangerIntegration({receipt:receipt(),integrationQueue:queue()});
  assert.equal(first.ok,true);
  const second = augmentCognitiveReceiptWithGamechangerIntegration({receipt:first.receipt,integrationQueue:queue()});
  assert.equal(second.ok,true);
  assert.equal(second.status,'GAMECHANGER_INTEGRATION_COGNITIVE_ALREADY_PRESENT');
  assert.equal(second.receipt.events.length,1);
  assert.equal(second.receipt.routes.length,1);
});

test('malformed queue fails closed instead of minting a cognitive candidate', () => {
  const result = augmentCognitiveReceiptWithGamechangerIntegration({receipt:receipt(),integrationQueue:{queue:{schemaVersion:'wrong',entries:[]}}});
  assert.equal(result.ok,true);
  assert.equal(result.receipt.events[0].event.kind,'BLOCKER');
  assert.equal(result.receipt.events[0].event.consequenceAuthority,'NONE');
});
