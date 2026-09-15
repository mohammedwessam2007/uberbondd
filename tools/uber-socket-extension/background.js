const PROJECT_REF = 'lslifasfebpjbtqmkitm';
const PUBLISHABLE_KEY = 'sb_publishable_lKlb6YYRRPVplCJIj128cA_pzhlnbPd';
const WS_URL = `wss://${PROJECT_REF}.supabase.co/realtime/v1/websocket?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`;

const tabConfigs = new Map();
const rooms = new Map();

const bytesToB64u = bytes => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const b64uToBytes = s => {
  const p = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(p + '='.repeat((4 - p.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
async function cryptoKey(secret) {
  const raw = b64uToBytes(secret);
  if (raw.byteLength !== 32) throw new Error('pair-key-must-be-32-bytes');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encrypt(secret, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await cryptoKey(secret);
  const clear = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, clear));
  return { v: 1, alg: 'A256GCM', iv: bytesToB64u(iv), ct: bytesToB64u(ct) };
}
async function decrypt(secret, packet) {
  if (!packet || packet.v !== 1 || packet.alg !== 'A256GCM') throw new Error('packet-invalid');
  const key = await cryptoKey(secret);
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uToBytes(packet.iv) }, key, b64uToBytes(packet.ct));
  return JSON.parse(new TextDecoder().decode(clear));
}

function validateConfig(c) {
  const id = v => /^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(String(v || ''));
  if (!id(c?.roomId) || !id(c?.peerId) || !id(c?.targetPeer)) return 'invalid-id';
  try { if (b64uToBytes(c?.pairKey || '').byteLength !== 32) return 'invalid-pair-key'; } catch { return 'invalid-pair-key'; }
  return null;
}

class RoomSocket {
  constructor(roomId, pairKey) {
    this.roomId = roomId;
    this.pairKey = pairKey;
    this.ws = null;
    this.ref = 1;
    this.pending = new Map();
    this.joined = false;
    this.closed = false;
    this.heartbeat = null;
    this.reconnectTimer = null;
  }
  topic() { return `realtime:${this.roomId}`; }
  connect() {
    if (this.closed || this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    ws.onopen = () => this.join();
    ws.onmessage = e => this.onMessage(e.data);
    ws.onerror = () => {};
    ws.onclose = () => {
      this.joined = false;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      for (const resolve of this.pending.values()) resolve({ ok: false, reason: 'socket-closed' });
      this.pending.clear();
      if (!this.closed) this.reconnectTimer = setTimeout(() => this.connect(), 1500);
    };
  }
  push(topic, event, payload, timeout = 8000) {
    return new Promise(resolve => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return resolve({ ok: false, reason: 'socket-not-open' });
      const ref = String(this.ref++);
      const timer = setTimeout(() => { this.pending.delete(ref); resolve({ ok: false, reason: 'socket-timeout' }); }, timeout);
      this.pending.set(ref, reply => { clearTimeout(timer); resolve(reply); });
      this.ws.send(JSON.stringify({ topic, event, payload, ref }));
    });
  }
  async join() {
    const r = await this.push(this.topic(), 'phx_join', {
      config: { broadcast: { ack: true, self: false }, presence: { enabled: false }, postgres_changes: [], private: false },
      access_token: PUBLISHABLE_KEY
    });
    this.joined = Boolean(r?.ok);
    if (this.joined) {
      this.heartbeat = setInterval(() => this.push('phoenix', 'heartbeat', {}, 5000), 25000);
      broadcastStatus(this.roomId, 'CONNECTED');
    } else this.ws?.close();
  }
  async onMessage(raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.event === 'phx_reply' && m.ref && this.pending.has(String(m.ref))) {
      const resolve = this.pending.get(String(m.ref));
      this.pending.delete(String(m.ref));
      resolve({ ok: m.payload?.status === 'ok', payload: m.payload });
      return;
    }
    if (m.event !== 'broadcast' || m.payload?.event !== 'uber-peer') return;
    let msg;
    try { msg = await decrypt(this.pairKey, m.payload?.payload?.packet); } catch { return; }
    if (msg?.schema !== 'uberbond.peer.v1' || msg?.externalEffectsAuthorized !== false) return;
    for (const [tabId, cfg] of tabConfigs) {
      if (!cfg.armed || cfg.roomId !== this.roomId) continue;
      if (msg.toPeer !== cfg.peerId && msg.toPeer !== 'broadcast') continue;
      chrome.tabs.sendMessage(tabId, { type: 'UBER_SOCKET_INBOUND', message: msg }).catch(() => {});
    }
  }
  async send(message) {
    if (!this.joined) return { ok: false, reason: 'room-not-joined' };
    const packet = await encrypt(this.pairKey, message);
    return this.push(this.topic(), 'broadcast', { type: 'broadcast', event: 'uber-peer', payload: { packet } });
  }
  stop() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
  }
}

function broadcastStatus(roomId, status) {
  for (const [tabId, cfg] of tabConfigs) if (cfg.roomId === roomId) chrome.tabs.sendMessage(tabId, { type: 'UBER_SOCKET_STATUS', status }).catch(() => {});
}
function ensureRoom(cfg) {
  const existing = rooms.get(cfg.roomId);
  if (existing && existing.pairKey === cfg.pairKey) return existing;
  if (existing) existing.stop();
  const room = new RoomSocket(cfg.roomId, cfg.pairKey);
  rooms.set(cfg.roomId, room);
  room.connect();
  return room;
}
function cleanupRooms() {
  for (const [roomId, room] of rooms) {
    if (![...tabConfigs.values()].some(c => c.armed && c.roomId === roomId)) { room.stop(); rooms.delete(roomId); }
  }
}
function uuid() { return crypto.randomUUID(); }

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  (async () => {
    const tabId = req.tabId || sender.tab?.id;
    if (req.type === 'UBER_SOCKET_CONFIGURE') {
      const cfg = { roomId: String(req.config?.roomId || ''), pairKey: String(req.config?.pairKey || ''), peerId: String(req.config?.peerId || ''), targetPeer: String(req.config?.targetPeer || ''), armed: Boolean(req.config?.armed) };
      const error = validateConfig(cfg);
      if (error) return sendResponse({ ok: false, error });
      tabConfigs.set(tabId, cfg);
      if (cfg.armed) ensureRoom(cfg); else cleanupRooms();
      return sendResponse({ ok: true, config: { ...cfg, pairKey: cfg.pairKey ? 'present' : '' } });
    }
    if (req.type === 'UBER_SOCKET_GET_CONFIG') {
      const cfg = tabConfigs.get(tabId);
      return sendResponse({ ok: true, config: cfg || null });
    }
    if (req.type === 'UBER_SOCKET_REPLY') {
      const cfg = tabConfigs.get(tabId);
      if (!cfg?.armed) return sendResponse({ ok: false, error: 'tab-not-armed' });
      const room = ensureRoom(cfg);
      const message = {
        schema: 'uberbond.peer.v1', threadId: cfg.roomId, messageId: uuid(), fromPeer: cfg.peerId, toPeer: cfg.targetPeer,
        replyTo: req.replyTo || null, kind: 'RESPONSE', body: String(req.body || ''), externalEffectsAuthorized: false, createdAt: new Date().toISOString()
      };
      return sendResponse(await room.send(message));
    }
    if (req.type === 'UBER_SOCKET_PROMPT') {
      const cfg = tabConfigs.get(tabId);
      if (!cfg?.armed) return sendResponse({ ok: false, error: 'tab-not-armed' });
      const room = ensureRoom(cfg);
      const message = {
        schema: 'uberbond.peer.v1', threadId: cfg.roomId, messageId: uuid(), fromPeer: cfg.peerId, toPeer: cfg.targetPeer,
        replyTo: req.replyTo || null, kind: 'PROMPT', body: String(req.body || ''), externalEffectsAuthorized: false, createdAt: new Date().toISOString()
      };
      return sendResponse(await room.send(message));
    }
    sendResponse({ ok: false, error: 'unsupported-message' });
  })().catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => { tabConfigs.delete(tabId); cleanupRooms(); });
