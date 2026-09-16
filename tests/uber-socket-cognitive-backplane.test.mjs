import test from 'node:test';
import assert from 'node:assert/strict';
import { createUberSocketCognitiveBackplane } from '../src/uber-socket-cognitive-backplane.mjs';
import { getUberSocketRuntime, resetUberSocketRuntimeForTests } from '../src/uber-socket-runtime.mjs';

test('UberSocket events enter canonical cognitive bus and closed loop',()=>{
  const bp=createUberSocketCognitiveBackplane();
  const memory=bp.publishChatContent({peerId:'chat-outreach',docId:'doc-runtime',title:'100K runtime',summary:'Worker and launch evidence.'});
  assert.equal(memory.ok,true);
  assert.equal(memory.compiled.event.kind,'MEMORY_UPDATE');
  assert.equal(memory.compiled.event.sourceNodeId,'context-spine');
  assert.ok(memory.route.activations.some(x=>x.targetNodeId==='world-brain'));
  const council=bp.publishCouncilResult({councilId:'council-100k',summary:'Council identified a missing materializer seam.'});
  assert.equal(council.ok,true);
  assert.ok(council.route.activations.some(x=>x.targetNodeId==='wallbreaker'));
  const cycle=bp.closeLoop();
  assert.equal(cycle.ok,true);
  assert.ok(cycle.activationCount>0);
  assert.equal(cycle.businessEffectAuthority,'NONE');
});

test('runtime ingestion automatically wakes canonical cognitive backplane without model key',async()=>{
  resetUberSocketRuntimeForTests();
  const rt=getUberSocketRuntime({apiKey:null});
  await rt.registerChat({peerId:'chat-1',conversationId:'conv-1',projectId:'uberbond',tags:['outreach-100k']});
  const ingested=rt.ingest({peerId:'chat-1',docId:'doc-1',title:'Outreach truth',text:'100K outreach launch remains evidence gated.',tags:['outreach-100k']});
  assert.equal(ingested.cognitive.ok,true);
  const status=rt.status();
  assert.equal(status.cognitiveBackplane,'CONNECTED');
  assert.equal(status.sharedDocuments,1);
  const cycle=rt.cognitiveCycle();
  assert.equal(cycle.ok,true);
  assert.ok(cycle.targetCounts['world-brain']>=1);
  resetUberSocketRuntimeForTests();
});
