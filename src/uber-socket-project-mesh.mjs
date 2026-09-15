import { createAppPeerRouter } from './uber-socket-app-peer-router.mjs';

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

export function createProjectMesh({ modelAdapter, transcriptStore = null, authorizeModelCall = null } = {}) {
  const router = createAppPeerRouter({ modelAdapter, transcriptStore, authorizeModelCall });
  const rooms = new Map();
  const peerMeta = new Map();

  function registerChat({ peerId, conversationId, projectId = 'uberbond', title = '', tags = [], metadata = {} } = {}) {
    if (!ID.test(String(peerId || ''))) throw new Error('peerId-invalid');
    const peer = router.registerPeer({ peerId, conversationId, metadata: { projectId, title, tags: [...tags], ...metadata } });
    peerMeta.set(peer.peerId, peer.metadata);
    joinRoom({ roomId: `project:${projectId}`, peerIds: [peer.peerId] });
    for (const tag of tags) joinRoom({ roomId: `tag:${tag}`, peerIds: [peer.peerId] });
    return peer;
  }

  function joinRoom({ roomId, peerIds = [] } = {}) {
    if (!ID.test(String(roomId || ''))) throw new Error('roomId-invalid');
    const set = rooms.get(roomId) || new Set();
    for (const peerId of peerIds) {
      if (!router.getPeer(peerId)) throw new Error(`peer-not-registered:${peerId}`);
      set.add(String(peerId));
    }
    rooms.set(String(roomId), set);
    return [...set];
  }

  function leaveRoom({ roomId, peerId } = {}) {
    const set = rooms.get(String(roomId));
    if (!set) return false;
    const deleted = set.delete(String(peerId));
    if (set.size === 0) rooms.delete(String(roomId));
    return deleted;
  }

  function listRoom(roomId) { return [...(rooms.get(String(roomId)) || [])]; }
  function listRooms() { return [...rooms.entries()].map(([roomId, members]) => ({ roomId, members: [...members] })); }

  async function ask({ fromPeer, toPeer, prompt, maxTurns = 1, autoDialogue = false } = {}) {
    return router.runDialogue({ fromPeer, toPeer, prompt, maxTurns, autoDialogue });
  }

  async function council({ fromPeer, roomId, prompt, maxResponders = 12 } = {}) {
    const members = listRoom(roomId).filter(peerId => peerId !== fromPeer).slice(0, Math.max(1, Math.min(50, Number(maxResponders) || 12)));
    const replies = [];
    for (const toPeer of members) {
      const result = await router.runDialogue({ fromPeer, toPeer, prompt, maxTurns: 1, autoDialogue: false });
      replies.push({ peerId: toPeer, text: result.trace[0]?.output || '', responseId: result.trace[0]?.responseId || null });
    }
    return Object.freeze({ ok: true, roomId, fromPeer, responders: replies.length, replies: Object.freeze(replies), externalEffectsAuthorized: false });
  }

  async function synthesizeCouncil({ fromPeer, roomId, prompt, synthesizerPeer, maxResponders = 12 } = {}) {
    const councilResult = await council({ fromPeer, roomId, prompt, maxResponders });
    if (!router.getPeer(synthesizerPeer)) throw new Error('synthesizer-peer-not-registered');
    const digest = councilResult.replies.map((r, i) => `Peer ${i + 1} (${r.peerId}):\n${r.text}`).join('\n\n');
    const synthesisPrompt = `Synthesize the following peer responses for the originating question. Preserve disagreements and provenance.\n\nQuestion:\n${prompt}\n\nResponses:\n${digest}`;
    const synthesis = await router.runDialogue({ fromPeer, toPeer: synthesizerPeer, prompt: synthesisPrompt, maxTurns: 1, autoDialogue: false });
    return Object.freeze({ ...councilResult, synthesis: synthesis.trace[0]?.output || '', synthesizerPeer });
  }

  function snapshot() {
    return Object.freeze({
      peers: Object.freeze(router.listPeers().map(p => ({ ...p, metadata: { ...p.metadata } }))),
      rooms: Object.freeze(listRooms()),
      externalEffectsAuthorized: false,
    });
  }

  return Object.freeze({ registerChat, joinRoom, leaveRoom, listRoom, listRooms, ask, council, synthesizeCouncil, snapshot, getPeer: router.getPeer, listPeers: router.listPeers });
}
