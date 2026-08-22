// Pure, network-free helpers for inbound email classification.
// This module intentionally has no imports and no capability to send, reply,
// draft, forward, modify, delete, deploy, or mutate production state.

const DEFAULT_LIMITS = {
  maxMimeDepth: 10,
  maxMimePartCount: 200,
  maxDecodedBodyBytes: 262144,
  maxHeaderCount: 100,
  maxHeaderValueBytes: 8192
};

export function boundHeaders(rawHeaders, limits = {}) {
  const cfg = { ...DEFAULT_LIMITS, ...limits };
  const list = Array.isArray(rawHeaders) ? rawHeaders : [];
  const capped = list.slice(0, cfg.maxHeaderCount);
  let truncated = list.length > capped.length;
  const headers = {};
  for (const entry of capped) {
    const name = String(entry?.name || '').toLowerCase();
    if (!name) continue;
    let value = String(entry?.value ?? '');
    if (Buffer.byteLength(value, 'utf8') > cfg.maxHeaderValueBytes) {
      value = Buffer.from(value, 'utf8').subarray(0, cfg.maxHeaderValueBytes).toString('utf8');
      truncated = true;
    }
    headers[name] = value;
  }
  return { headers, truncated, headerCount: list.length };
}

export function parseInboundMime(payload, limits = {}) {
  const cfg = { ...DEFAULT_LIMITS, ...limits };
  let partCount = 0;
  let truncated = false;
  let maxDepthSeen = 0;
  let bytesUsed = 0;
  const chunks = [];

  function visit(part, depth) {
    maxDepthSeen = Math.max(maxDepthSeen, depth);
    if (depth > cfg.maxMimeDepth) { truncated = true; return; }
    partCount += 1;
    if (partCount > cfg.maxMimePartCount) { truncated = true; return; }
    if (!part || typeof part !== 'object') return;
    if (part.mimeType === 'text/plain' && part.body?.data) {
      if (bytesUsed >= cfg.maxDecodedBodyBytes) { truncated = true; return; }
      let decoded;
      try { decoded = Buffer.from(String(part.body.data), 'base64url').toString('utf8'); }
      catch { truncated = true; return; }
      const remaining = cfg.maxDecodedBodyBytes - bytesUsed;
      const decodedBytes = Buffer.from(decoded, 'utf8');
      const pieceBytes = decodedBytes.subarray(0, remaining);
      if (pieceBytes.length < decodedBytes.length) truncated = true;
      const piece = pieceBytes.toString('utf8');
      chunks.push(piece);
      bytesUsed += pieceBytes.length;
      return;
    }
    const parts = Array.isArray(part.parts) ? part.parts : [];
    for (const child of parts) {
      if (bytesUsed >= cfg.maxDecodedBodyBytes || partCount > cfg.maxMimePartCount) { truncated = true; break; }
      visit(child, depth + 1);
    }
  }

  try { visit(payload, 0); } catch { truncated = true; }
  return { body: chunks.join('\n'), truncated, partCount, maxDepthSeen, bytesUsed };
}

const BOUNCE_MARKERS = [/mailer-daemon/i, /delivery status notification/i, /undelivered mail/i, /failed delivery/i, /returned to sender/i];
const COMPLAINT_MARKERS = [/complaint/i, /abuse report/i, /spam report/i, /this is spam/i];
const UNSUB_MARKERS = [/unsubscribe/i, /opt.?out/i, /remove me/i, /stop emailing/i];
const OOO_MARKERS = [/out of office/i, /automatic reply/i, /auto.?reply/i, /vacation/i, /away from (the )?office/i];

export function classifyInboundEvent({ headers = {}, body = '' } = {}) {
  const lowerHeaders = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), String(value ?? '')]));
  const from = lowerHeaders.from?.toLowerCase() || '';
  const subject = lowerHeaders.subject?.toLowerCase() || '';
  const autoSubmitted = lowerHeaders['auto-submitted']?.toLowerCase() || '';
  const text = `${subject}\n${String(body || '')}`.toLowerCase().slice(0, 20000);

  if (from.includes('mailer-daemon') || from.includes('postmaster@') || BOUNCE_MARKERS.some(rx => rx.test(subject) || rx.test(text))) {
    return { category: 'bounce', confidence: 'high' };
  }
  if (lowerHeaders['x-failed-recipients']) return { category: 'bounce', confidence: 'medium' };
  if (COMPLAINT_MARKERS.some(rx => rx.test(subject) || rx.test(text))) return { category: 'complaint', confidence: 'high' };
  if (lowerHeaders['list-unsubscribe'] && UNSUB_MARKERS.some(rx => rx.test(text))) return { category: 'unsubscribe', confidence: 'medium' };
  if (UNSUB_MARKERS.some(rx => rx.test(subject))) return { category: 'unsubscribe', confidence: 'high' };
  if (autoSubmitted === 'auto-replied' || OOO_MARKERS.some(rx => rx.test(subject))) return { category: 'out-of-office', confidence: 'high' };
  if (lowerHeaders['in-reply-to'] || lowerHeaders.references) return { category: 'reply', confidence: 'high' };
  return { category: 'unknown', confidence: 'low' };
}
