// Pure, network-free helpers: parse an already-fetched Gmail message payload and classify it.
// Deliberately has no imports at all (not even ./utils.mjs) and no way to send, reply, or modify
// anything — it only ever turns data already in memory into a label or a bounded string.

const DEFAULT_LIMITS = { maxMimeDepth: 10, maxMimePartCount: 200, maxDecodedBodyBytes: 262144, maxHeaderCount: 100, maxHeaderValueBytes: 8192 };

// GM-17: bounds the raw Gmail envelope header array before anything downstream (classification,
// extractEmailAddress) ever sees it, regardless of how many headers a hostile/malformed message
// declares or how long any single value is. A header past maxHeaderCount is dropped rather than
// processed; a value past maxHeaderValueBytes is cut down to that size rather than kept whole --
// either case sets `truncated` so callers can tell the envelope was capped.
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

// Bounded recursive MIME body extractor. Depth, part count, and total decoded bytes are all
// capped regardless of what the input claims or how it's shaped, so a hostile or malformed
// message can only ever cost a fixed amount of work, never an unbounded amount.
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
      const piece = Buffer.byteLength(decoded, 'utf8') > remaining ? decoded.slice(0, remaining) : decoded;
      if (piece.length < decoded.length) truncated = true;
      chunks.push(piece);
      bytesUsed += Buffer.byteLength(piece, 'utf8');
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

// Classifies an already-parsed message into a category. Never generates, drafts, or dispatches
// any reply of its own — the return value is a label plus a confidence, nothing else.
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
