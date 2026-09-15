import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppPeerRouter } from '../src/uber-socket-app-peer-router.mjs';

test('in-app router runs bounded A↔B dialogue without external-effect authority', async () => {
  const calls = [];
  const transcripts = [];
  const router = createAppPeerRouter({
    modelAdapter: {
      async respond({ conversationId, input, peerEnvelope }) {
        calls.push({ conversationId, input, peerEnvelope });
        return { text: `${conversationId}-reply-${calls.length}`, responseId: `r${calls.length}` };
      },
    },
    transcriptStore: { async append(entry) { transcripts.push(entry); } },
    authorizeModelCall: async () => true,
  });

  router.registerPeer({ peerId: 'chat-a', conversationId: 'conv-a' });
  router.registerPeer({ peerId: 'chat-b', conversationId: 'conv-b' });

  const result = await router.runDialogue({ fromPeer: 'chat-a', toPeer: 'chat-b', prompt: 'solve this together', maxTurns: 4 });
  assert.equal(result.ok, true);
  assert.equal(result.turnsCompleted, 4);
  assert.equal(result.externalEffectsAuthorized, false);
  assert.deepEqual(calls.map(x => x.conversationId), ['conv-b', 'conv-a', 'conv-b', 'conv-a']);
  assert.ok(calls.every(x => x.input.includes('not founder authorization')));
  assert.ok(calls.every(x => x.peerEnvelope.externalEffectsAuthorized === false));
  assert.equal(transcripts.length, 8);
});

test('in-app router rejects unknown peers and authorization denial', async () => {
  const router = createAppPeerRouter({
    modelAdapter: { async respond() { return { text: 'should-not-run' }; } },
    authorizeModelCall: async () => false,
  });
  router.registerPeer({ peerId: 'chat-a', conversationId: 'conv-a' });
  router.registerPeer({ peerId: 'chat-b', conversationId: 'conv-b' });
  await assert.rejects(() => router.runDialogue({ fromPeer: 'chat-a', toPeer: 'chat-b', prompt: 'x', maxTurns: 1 }), /model-call-not-authorized/);
  await assert.rejects(() => router.runDialogue({ fromPeer: 'chat-a', toPeer: 'missing', prompt: 'x', maxTurns: 1 }), /target-peer-not-registered/);
});
