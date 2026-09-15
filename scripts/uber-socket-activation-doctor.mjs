import { getUberSocketRuntime, resetUberSocketRuntimeForTests } from '../src/uber-socket-runtime.mjs';

resetUberSocketRuntimeForTests();
const runtime = getUberSocketRuntime();
const status = runtime.status();
const connectome = runtime.connectomeDoctor();
const ready = status.state === 'ACTIVE'
  && status.peers > 0
  && status.sharedDocuments > 0
  && connectome.ok === true
  && connectome.structurallyIsolated.length === 0;
const receipt = {
  schema: 'uberbond.uber-socket-activation-doctor.v2',
  checkedAt: new Date().toISOString(),
  ready,
  state: ready ? 'UBER_SOCKET_WHOLE_BRAIN_ACTIVE' : status.state,
  provider: status.provider,
  model: status.model,
  peers: status.peers,
  rooms: status.rooms,
  sharedDocuments: status.sharedDocuments,
  cognitiveBackplane: status.cognitiveBackplane,
  wholeBrainOrchestrator: status.wholeBrainOrchestrator,
  connectome: {
    state: connectome.state,
    graphDigest: connectome.graphDigest,
    nodeCount: connectome.nodeCount,
    edgeCount: connectome.edgeCount,
    structurallyIsolated: connectome.structurallyIsolated,
    notReachableFromCore: connectome.notReachableFromCore,
  },
  externalEffectsAuthorized: false,
  blockers: [
    ...(status.state === 'WAITING_FOR_OPENAI_KEY' ? ['OPENAI_API_KEY_NOT_CONFIGURED'] : []),
    ...(status.peers === 0 ? ['NO_PROJECT_CHATS_REGISTERED'] : []),
    ...(status.sharedDocuments === 0 ? ['NO_PROJECT_CHAT_CONTENT_INGESTED'] : []),
    ...(!connectome.ok ? ['CANONICAL_CONNECTOME_NOT_STRUCTURALLY_CONNECTED'] : []),
    ...connectome.structurallyIsolated.map(id=>`ISOLATED_COGNITIVE_ORGAN:${id}`),
  ],
};
console.log(JSON.stringify(receipt, null, 2));
if (!ready) process.exitCode = 2;
