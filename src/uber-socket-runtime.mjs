import { createOpenAIConversationModelAdapter } from './openai-conversation-model-adapter.mjs';
import { createProjectMesh } from './uber-socket-project-mesh.mjs';
import { createSharedContentFabric } from './uber-socket-shared-content-fabric.mjs';

let singleton = null;

function makeRuntime({ apiKey = process.env.OPENAI_API_KEY, model = process.env.UBER_SOCKET_MODEL || 'gpt-5', authorizeModelCall = async () => true } = {}) {
  const configured = Boolean(apiKey);
  const modelAdapter = configured
    ? createOpenAIConversationModelAdapter({ apiKey, model })
    : { async respond(){ throw new Error('openai-api-key-not-configured'); } };
  const mesh = createProjectMesh({ modelAdapter, authorizeModelCall });
  const fabric = createSharedContentFabric({ mesh, modelAdapter });

  function status(){
    const snap = mesh.snapshot();
    return Object.freeze({
      ok: true,
      state: configured ? 'ACTIVE' : 'WAITING_FOR_OPENAI_KEY',
      provider: configured ? 'openai' : null,
      model: configured ? model : null,
      peers: snap.peers.length,
      rooms: snap.rooms.length,
      sharedDocuments: snap.peers.reduce((n,p)=>n+fabric.listPeerDocs(p.peerId).length,0),
      externalEffectsAuthorized: false,
    });
  }

  async function registerChat({ peerId, conversationId, projectId='uberbond', title='', tags=[], metadata={} }={}){
    if(!conversationId){
      if(!configured) throw new Error('openai-api-key-not-configured');
      const created = await modelAdapter.createConversation({ metadata:{ projectId, peerId, title } });
      conversationId = created.conversationId;
    }
    return mesh.registerChat({ peerId, conversationId, projectId, title, tags, metadata });
  }

  function ingest(doc){ return fabric.ingest(doc); }
  async function ask(args){ return fabric.askWithSharedContext(args); }
  async function council(args){ return mesh.council(args); }
  async function monster(args){ return fabric.compileMonsterPrompt(args); }
  async function outreach100kCouncil({ fromPeer, synthesizerPeer=null, maxResponders=12 }={}){
    const roomId = 'tag:outreach-100k';
    const prompt = 'Complete the UberBond 100K/day outreach mission. Identify what is already implemented, what is missing, contradictions, current evidence, bottlenecks, unsafe assumptions, and the strongest next execution prompt. Preserve source provenance and do not fabricate readiness.';
    if(synthesizerPeer) return mesh.synthesizeCouncil({ fromPeer, roomId, prompt, synthesizerPeer, maxResponders });
    return mesh.council({ fromPeer, roomId, prompt, maxResponders });
  }

  return Object.freeze({ status, registerChat, ingest, ask, council, monster, outreach100kCouncil, mesh, fabric });
}

export function getUberSocketRuntime(options={}){
  if(!singleton) singleton = makeRuntime(options);
  return singleton;
}

export function resetUberSocketRuntimeForTests(){ singleton = null; }
