import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectMesh } from '../src/uber-socket-project-mesh.mjs';

test('project mesh registers 50 chats and runs councils with bounded authority', async () => {
  const calls = [];
  const mesh = createProjectMesh({
    modelAdapter: {
      async respond({ conversationId, input, peerEnvelope }) {
        calls.push({ conversationId, input, peerEnvelope });
        return { text: `reply:${conversationId}:${calls.length}`, responseId: `r${calls.length}` };
      },
    },
    authorizeModelCall: async () => true,
  });

  for (let i = 0; i < 50; i += 1) {
    mesh.registerChat({
      peerId: `chat-${i}`,
      conversationId: `conv-${i}`,
      projectId: 'uberbond',
      title: `UberBond Chat ${i}`,
      tags: [i % 2 ? 'runtime' : 'research', i % 5 === 0 ? 'council' : 'general'],
    });
  }

  assert.equal(mesh.listPeers().length, 50);
  assert.equal(mesh.listRoom('project:uberbond').length, 50);
  assert.equal(mesh.listRoom('tag:research').length, 25);
  assert.equal(mesh.listRoom('tag:council').length, 10);

  const targeted = await mesh.ask({ fromPeer: 'chat-0', toPeer: 'chat-1', prompt: 'status?' });
  assert.equal(targeted.ok, true);
  assert.equal(targeted.turnsCompleted, 1);

  const council = await mesh.council({ fromPeer: 'chat-1', roomId: 'tag:council', prompt: 'review frontier', maxResponders: 10 });
  assert.equal(council.ok, true);
  assert.equal(council.responders, 10);
  assert.equal(council.externalEffectsAuthorized, false);

  const synthesis = await mesh.synthesizeCouncil({ fromPeer: 'chat-1', roomId: 'tag:council', prompt: 'merge findings', synthesizerPeer: 'chat-2', maxResponders: 10 });
  assert.equal(synthesis.ok, true);
  assert.equal(synthesis.responders, 10);
  assert.match(synthesis.synthesis, /^reply:conv-2:/);

  assert.ok(calls.every(c => c.peerEnvelope.externalEffectsAuthorized === false));
  assert.ok(mesh.snapshot().externalEffectsAuthorized === false);
});
