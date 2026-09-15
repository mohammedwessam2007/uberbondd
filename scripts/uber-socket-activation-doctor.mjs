import { getUberSocketRuntime, resetUberSocketRuntimeForTests } from '../src/uber-socket-runtime.mjs';

resetUberSocketRuntimeForTests();
const runtime = getUberSocketRuntime();
const status = runtime.status();
const ready = status.state === 'ACTIVE' && status.peers > 0;
const receipt = {
  schema: 'uberbond.uber-socket-activation-doctor.v1',
  checkedAt: new Date().toISOString(),
  ready,
  state: ready ? 'UBER_SOCKET_PROJECT_BRAIN_ACTIVE' : status.state,
  provider: status.provider,
  model: status.model,
  peers: status.peers,
  rooms: status.rooms,
  sharedDocuments: status.sharedDocuments,
  externalEffectsAuthorized: false,
  blockers: [
    ...(status.state === 'WAITING_FOR_OPENAI_KEY' ? ['OPENAI_API_KEY_NOT_CONFIGURED'] : []),
    ...(status.peers === 0 ? ['NO_PROJECT_CHATS_REGISTERED'] : []),
  ],
};
console.log(JSON.stringify(receipt, null, 2));
if (!ready) process.exitCode = 2;
