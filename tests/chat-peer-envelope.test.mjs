import test from 'node:test';
import assert from 'node:assert/strict';
import { makePeerMessage, PEER_SCHEMA } from '../src/chat-peer-envelope.mjs';

test('peer envelope is bounded and cannot mint external-effect authority', () => {
  const r = makePeerMessage({
    threadId: 'uber-room', messageId: 'm-1', fromPeer: 'chat-a', toPeer: 'chat-b',
    kind: 'PROMPT', body: 'hello'
  });
  assert.equal(r.ok, true);
  assert.equal(r.message.schema, PEER_SCHEMA);
  assert.equal(r.message.externalEffectsAuthorized, false);
  assert.equal(Object.isFrozen(r.message), true);
});

test('peer envelope rejects malformed identities and oversized bodies', () => {
  assert.equal(makePeerMessage({ threadId: 'bad space', messageId: 'm', fromPeer: 'a', toPeer: 'b', body: 'x' }).ok, false);
  assert.equal(makePeerMessage({ threadId: 'r', messageId: 'm', fromPeer: 'a', toPeer: 'b', body: 'x'.repeat(65537) }).ok, false);
});
