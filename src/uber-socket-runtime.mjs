import crypto from 'node:crypto';
import { createOpenAIConversationModelAdapter } from './openai-conversation-model-adapter.mjs';
import { createProjectMesh } from './uber-socket-project-mesh.mjs';
import { createSharedContentFabric } from './uber-socket-shared-content-fabric.mjs';
import { createUberSocketCognitiveBackplane } from './uber-socket-cognitive-backplane.mjs';
import { createUberSocketWholeBrainOrchestrator } from './uber-socket-whole-brain-orchestrator.mjs';
import { createUberSocketConnectomeRuntime } from './uber-socket-connectome-runtime.mjs';

let singleton = null;

function makeRuntime({ apiKey = process.env.OPENAI_API_KEY, model = process.env.UBER_SOCKET_MODEL || 'gpt-5', authorizeModelCall = async () => true, cognitiveJournalPath = process.env.UBER_SOCKET_COGNITIVE_JOURNAL || null } = {}) {
  const configured = Boolean(apiKey);
  const modelAdapter = configured
    ? createOpenAIConversationModelAdapter({ apiKey, model })
    : { async respond(){ throw new Error('openai-api-key-not-configured'); } };
  const mesh = createProjectMesh({ modelAdapter, authorizeModelCall });
  const fabric = createSharedContentFabric({ mesh, modelAdapter });
  const backplane = createUberSocketCognitiveBackplane({ journalPath: cognitiveJournalPath });
  let connectome = null;

  function status(){
    const snap = mesh.snapshot();
    const connectomeDoctor = connectome ? connectome.doctor() : null;
    return Object.freeze({
      ok: true,
      state: configured ? 'ACTIVE' : 'WAITING_FOR_OPENAI_KEY',
      provider: configured ? 'openai' : null,
      model: configured ? model : null,
      peers: snap.peers.length,
      rooms: snap.rooms.length,
      sharedDocuments: snap.peers.reduce((n,p)=>n+fabric.listPeerDocs(p.peerId).length,0),
      cognitiveBackplane: 'CONNECTED',
      wholeBrainOrchestrator: 'CONNECTED',
      connectome: connectomeDoctor?.state || 'INITIALIZING',
      canonicalCognitiveNodes: connectomeDoctor?.nodeCount || 0,
      canonicalCognitiveEdges: connectomeDoctor?.edgeCount || 0,
      cognitiveJournal: cognitiveJournalPath ? 'ENABLED' : 'DISABLED',
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

  function ingest(doc){
    const saved = fabric.ingest(doc);
    const cognitive = backplane.publishChatContent({
      peerId:saved.peerId,
      docId:saved.docId,
      title:saved.title,
      summary:`Shared project document ingested with ${saved.text.length} characters and tags ${(saved.tags||[]).join(', ')||'none'}.`,
      evidenceRefs:[`uber-socket://peer/${saved.peerId}/doc/${saved.docId}`],
      observedAt:saved.createdAt,
    });
    return Object.freeze({ ...saved, cognitive });
  }

  async function ask(args){
    const result = await fabric.askWithSharedContext(args);
    const peerId = String(args?.toPeer || 'unknown-peer');
    const cognitive = backplane.publishPeerFinding({
      peerId,
      subjectId:`ask:${crypto.randomUUID()}`,
      summary:`UberSocket peer ${peerId} answered a shared-context question.`,
      evidenceRefs:(result.sharedDocIds||[]).map(id=>`uber-socket://doc/${id}`),
    });
    return Object.freeze({ ...result, cognitive });
  }

  async function council(args){
    const result = await mesh.council(args);
    const councilId = `council:${crypto.randomUUID()}`;
    const cognitive = backplane.publishCouncilResult({
      councilId,
      summary:`UberSocket council ${args?.roomId || 'ad-hoc'} produced ${result.responders || result.replies?.length || 0} peer responses.`,
      evidenceRefs:(result.replies||[]).map(r=>`uber-socket://peer/${r.peerId}/response/${r.responseId||'unknown'}`),
    });
    return Object.freeze({ ...result, councilId, cognitive });
  }

  async function monster(args){
    const result = await fabric.compileMonsterPrompt(args);
    const promptId = `monster:${crypto.randomUUID()}`;
    const cognitive = backplane.publishMonsterPrompt({
      promptId,
      summary:`UberSocket monster prompt compiled from ${result.councilPeers?.length || 0} council peers and ${result.sharedDocIds?.length || 0} shared documents.`,
      evidenceRefs:[...(result.sharedDocIds||[]).map(id=>`uber-socket://doc/${id}`),...(result.councilPeers||[]).map(id=>`uber-socket://peer/${id}`)],
    });
    return Object.freeze({ ...result, promptId, cognitive });
  }

  async function outreach100kCouncil({ fromPeer, synthesizerPeer=null, maxResponders=12 }={}){
    const roomId = 'tag:outreach-100k';
    const prompt = 'Complete the UberBond 100K/day outreach mission. Identify what is already implemented, what is missing, contradictions, current evidence, bottlenecks, unsafe assumptions, and the strongest next execution prompt. Preserve source provenance and do not fabricate readiness.';
    const result = synthesizerPeer
      ? await mesh.synthesizeCouncil({ fromPeer, roomId, prompt, synthesizerPeer, maxResponders })
      : await mesh.council({ fromPeer, roomId, prompt, maxResponders });
    const councilId = `outreach100k:${crypto.randomUUID()}`;
    const cognitive = backplane.publishCouncilResult({
      councilId,
      summary:`100K outreach council produced ${result.responders || result.replies?.length || 0} responses${synthesizerPeer ? ' plus synthesis' : ''}.`,
      evidenceRefs:(result.replies||[]).map(r=>`uber-socket://peer/${r.peerId}/response/${r.responseId||'unknown'}`),
    });
    return Object.freeze({ ...result, councilId, cognitive });
  }

  function cognitiveCycle(){ return backplane.closeLoop(); }
  function reportContradiction(args){ return backplane.publishContradiction(args); }
  function reportBlocker(args){ return backplane.publishBlocker(args); }

  const baseRuntime={ status, registerChat, ingest, ask, council, monster, outreach100kCouncil, cognitiveCycle, reportContradiction, reportBlocker, mesh, fabric, backplane };
  const wholeBrain=createUberSocketWholeBrainOrchestrator({runtime:baseRuntime});
  const wholeRuntime={...baseRuntime,wholeBrain};
  connectome=createUberSocketConnectomeRuntime({runtime:wholeRuntime});
  async function compileWholeBrainMission(args){ return wholeBrain.compileMission(args); }
  function discoverMissionPeers(args){ return wholeBrain.discoverPeers(args); }
  async function compileConnectomeMission(args){ return connectome.compileMissionFanout(args); }
  function connectomeDoctor(){ return connectome.doctor(); }
  function discoverMissionOrgans(args){ return connectome.discoverOrgans(args); }

  return Object.freeze({ ...baseRuntime, compileWholeBrainMission, discoverMissionPeers, wholeBrain, compileConnectomeMission, connectomeDoctor, discoverMissionOrgans, connectome });
}

export function getUberSocketRuntime(options={}){
  if(!singleton) singleton = makeRuntime(options);
  return singleton;
}

export function resetUberSocketRuntimeForTests(){ singleton = null; }
