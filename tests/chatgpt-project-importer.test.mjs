import test from 'node:test';
import assert from 'node:assert/strict';
import { getUberSocketRuntime, resetUberSocketRuntimeForTests } from '../src/uber-socket-runtime.mjs';

const msg=(id,role,body,t)=>({id,message:{id:`m-${id}`,author:{role},create_time:t,content:{content_type:'text',parts:[body]}}});

test('bulk ChatGPT export imports UberBond chats, preserves provenance, and keeps archival peers fail-closed',async()=>{
  resetUberSocketRuntimeForTests();
  const runtime=getUberSocketRuntime({apiKey:null});
  const exportData=[
    {
      id:'ub-100k-chat',title:'UberBond 100K Outreach',create_time:1700000000,update_time:1700000100,
      mapping:{a:msg('a','user','Finish the UberBond 100K outreach runtime.',1700000001),b:msg('b','assistant','Runtime uses durable batches and evidence gates.',1700000002)}
    },
    {
      id:'recipe-chat',title:'Dinner recipes',create_time:1700000200,
      mapping:{a:msg('c','user','How do I make pasta?',1700000201),b:msg('d','assistant','Boil water.',1700000202)}
    }
  ];
  const receipt=await runtime.importChatGPTProject({exportData});
  assert.equal(receipt.ok,true);
  assert.equal(receipt.importedConversations,1);
  assert.ok(receipt.importedDocuments>=1);
  assert.equal(receipt.liveModelBound,false);
  assert.equal(receipt.receipts[0].peerId,'chatgpt:ub-100k-chat');
  assert.equal(receipt.receipts[0].archivalOnly,true);
  const status=runtime.status();
  assert.equal(status.peers,1);
  assert.equal(status.archivalPeers,1);
  assert.ok(status.sharedDocuments>=1);
  const hits=runtime.fabric.retrieve({query:'100K outreach runtime durable evidence',limit:10});
  assert.ok(hits.some(h=>h.peerId==='chatgpt:ub-100k-chat'));
  assert.equal(runtime.mesh.getPeer('chatgpt:ub-100k-chat')?.metadata?.archivalOnly,true);
  await assert.rejects(()=>runtime.ask({fromPeer:'chatgpt:ub-100k-chat',toPeer:'chatgpt:ub-100k-chat',question:'What is missing?'}),/archival-only/);
  const cycle=runtime.cognitiveCycle();
  assert.equal(cycle.ok,true);
  assert.ok(cycle.eventCount>=1);
});
