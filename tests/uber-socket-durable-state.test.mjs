import test from 'node:test';
import assert from 'node:assert/strict';
import { getUberSocketRuntime, resetUberSocketRuntimeForTests } from '../src/uber-socket-runtime.mjs';
import { persistUberSocketState, restoreUberSocketState, UBER_SOCKET_STATE_KEY } from '../src/uber-socket-durable-state.mjs';

function memoryStore(){
  const settings={};
  return {
    async getSettings(){return structuredClone(settings);},
    async setSetting(key,value){settings[key]=structuredClone(value);return value;},
    settings,
  };
}

test('UberSocket peer registry and shared documents survive restart through durable state',async()=>{
  const store=memoryStore();
  resetUberSocketRuntimeForTests();
  const first=getUberSocketRuntime({apiKey:null});
  await first.registerChat({peerId:'chatgpt:archive-1',conversationId:'archive:1',projectId:'uberbond',title:'Outreach chat',tags:['outreach-100k'],metadata:{archivalOnly:true,source:'test'}});
  first.ingest({peerId:'chatgpt:archive-1',docId:'doc-one',title:'Runtime',text:'Durable sender capacity evidence and reconciliation.',tags:['outreach-100k'],createdAt:'2026-09-15T00:00:00.000Z'});
  const persisted=await persistUberSocketState({runtime:first,store});
  assert.equal(persisted.ok,true);
  assert.equal(persisted.peerCount,1);
  assert.equal(persisted.documentCount,1);
  assert.ok(store.settings[UBER_SOCKET_STATE_KEY]?.digest);

  resetUberSocketRuntimeForTests();
  const second=getUberSocketRuntime({apiKey:null});
  const restored=await restoreUberSocketState({runtime:second,store});
  assert.equal(restored.ok,true);
  assert.equal(restored.peersRestored,1);
  assert.equal(restored.documentsRestored,1);
  assert.equal(second.status().peers,1);
  assert.equal(second.status().sharedDocuments,1);
  assert.equal(second.mesh.getPeer('chatgpt:archive-1')?.metadata?.archivalOnly,true);
  assert.ok(second.fabric.retrieve({query:'sender capacity reconciliation',limit:5}).some(x=>x.docId==='doc-one'));

  const again=await restoreUberSocketState({runtime:second,store});
  assert.equal(again.peersRestored,0);
  assert.equal(again.documentsRestored,0);
});
