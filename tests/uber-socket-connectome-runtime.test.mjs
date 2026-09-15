import test from 'node:test';
import assert from 'node:assert/strict';
import { getUberSocketRuntime, resetUberSocketRuntimeForTests } from '../src/uber-socket-runtime.mjs';
import { createProjectMesh } from '../src/uber-socket-project-mesh.mjs';
import { createSharedContentFabric } from '../src/uber-socket-shared-content-fabric.mjs';
import { createUberSocketCognitiveBackplane } from '../src/uber-socket-cognitive-backplane.mjs';
import { createUberSocketWholeBrainOrchestrator } from '../src/uber-socket-whole-brain-orchestrator.mjs';
import { createUberSocketConnectomeRuntime } from '../src/uber-socket-connectome-runtime.mjs';

test('cold UberSocket runtime attaches canonical connectome without API key',()=>{
  resetUberSocketRuntimeForTests();
  const runtime=getUberSocketRuntime({apiKey:null});
  const status=runtime.status();
  assert.equal(status.state,'WAITING_FOR_OPENAI_KEY');
  assert.equal(status.connectome,'CONNECTOME_STRUCTURALLY_CONNECTED');
  assert.ok(status.canonicalCognitiveNodes>=30);
  assert.ok(status.canonicalCognitiveEdges>=80);
  const doctor=runtime.connectomeDoctor();
  assert.equal(doctor.ok,true);
  assert.deepEqual(doctor.structurallyIsolated,[]);
  assert.equal(doctor.externalEffectsAuthorized,false);
});

test('shared chats compile a bounded whole-organism mission fanout',async()=>{
  const calls=[];
  const modelAdapter={async respond({conversationId,input}){calls.push({conversationId,input}); return {text:`MODEL:${conversationId}:${String(input).slice(0,300)}`,responseId:`r${calls.length}`};}};
  const mesh=createProjectMesh({modelAdapter});
  const fabric=createSharedContentFabric({mesh,modelAdapter});
  const backplane=createUberSocketCognitiveBackplane();
  for(let i=1;i<=10;i++) mesh.registerChat({peerId:`chat-${i}`,conversationId:`conv-${i}`,projectId:'uberbond',title:`UberBond outreach ${i}`,tags:['outreach-100k',i%2?'runtime':'deliverability']});
  fabric.ingest({peerId:'chat-1',docId:'outreach-runtime',title:'100K runtime',text:'100K runtime uses durable reconciliation, 250 item batches, exact readiness gates, and must not fabricate sender capacity.',tags:['outreach-100k','runtime']});
  fabric.ingest({peerId:'chat-2',docId:'outreach-delivery',title:'Deliverability',text:'Observed sender capacity, domain health, suppression, lawful recipient eligibility and ambiguous provider quarantine constrain actual sends.',tags:['outreach-100k','deliverability']});
  fabric.ingest({peerId:'chat-3',docId:'outreach-economics',title:'Economics',text:'Preserve four offer portfolio split and optimize cleared contribution economics rather than raw volume.',tags:['outreach-100k','economics']});
  const base={mesh,fabric,backplane};
  const wholeBrain=createUberSocketWholeBrainOrchestrator({runtime:base});
  const runtime={...base,wholeBrain};
  const connectome=createUberSocketConnectomeRuntime({runtime});
  const out=await connectome.compileMissionFanout({mission:'Complete the 100K outreach system with runtime deliverability economic truth and hostile verification',councilSize:6});
  assert.equal(out.state,'CONNECTOME_MISSION_FANOUT_COMPILED');
  assert.equal(out.externalEffectsAuthorized,false);
  assert.ok(out.wholeBrain.discoveredPeers.length>=3);
  assert.ok(out.packets.length>=1);
  assert.ok(out.packets.every(p=>p.externalEffectsAuthorized===false&&p.businessEffectAuthority==='NONE'));
  assert.ok(out.organs.some(o=>['distribution-os','truth-evidence','max-council','agent-mesh','economic-memory'].includes(o.id)));
  assert.equal(out.doctor.ok,true);
  const expectedCouncilCalls=Math.min(6,out.wholeBrain.discoveredPeers.length);
  assert.ok(calls.length>=expectedCouncilCalls+1);
});
