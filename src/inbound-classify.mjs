// Pure, network-free helpers for inbound email classification.
// This module reads no store, opens no socket, and has no capability to send, reply,
// draft, forward, modify, delete, deploy, or mutate production state. Its only import
// is the Node crypto module, used for digests.
import crypto from 'node:crypto';

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
  if (UNSUB_AR_PHRASES.some(phrase => normalizeInboundText(text).includes(phrase))) return { category: 'unsubscribe', confidence: 'medium' };
  if (autoSubmitted === 'auto-replied' || OOO_MARKERS.some(rx => rx.test(subject))) return { category: 'out-of-office', confidence: 'high' };
  if (lowerHeaders['in-reply-to'] || lowerHeaders.references) return { category: 'reply', confidence: 'high' };
  return { category: 'unknown', confidence: 'low' };
}

// Arabic and English unsubscribe intent. Text is folded before matching (diacritics, tatweel and bidi controls removed;
// alef, alef-maksura, hamza-on-carrier and ta-marbuta spellings unified), so one reviewed phrase covers its variants.
// Phrases are a floor for opt-out detection: a missed opt-out is the unsafe direction, so the scan errs toward a match.
export function normalizeInboundText(value = '') {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .toLowerCase();
}

// The reply's own words: the text above the first quote boundary. A footer or signature inside quoted text is not the
// recipient speaking, so opt-out and classification read this slice. A reply made only of quoted text yields ''.
const REPLY_QUOTE_BOUNDARIES = [
  /^-{2,}\s*original message\s*-{2,}\s*$/im,
  /^_{10,}\s*$/m,
  /^from:\s.+\r?\nsent:\s/im,
  /^on\s.{3,200}\swrote:\s*$/im,
  /^>/m
];
export function leadingReplyText(body = '') {
  const text = String(body ?? '');
  let cut = text.length;
  for (const boundary of REPLY_QUOTE_BOUNDARIES) {
    const hit = boundary.exec(text);
    if (hit && hit.index < cut) cut = hit.index;
  }
  return text.slice(0, cut).trim();
}

const UNSUBSCRIBE_SCAN_CHARS = 4000;
const UNSUB_EN_PATTERNS = [
  /\bunsubscribe\b/, /\bopt[- ]?out\b/, /\bremove me\b/, /\btake me off\b/,
  /\bstop (?:emailing|contacting|sending|messaging)\b/, /\b(?:do not|don'?t) contact\b/, /\bno more emails?\b/
];
// Only a negation immediately before the phrase cancels it ("do not unsubscribe"). Looser negation is not allowed to hide an opt-out.
const EN_NEGATION_IMMEDIATE = /\b(?:not|don'?t|do not|never|won'?t|no need to)\s+(?:to\s+)?$/;
const UNSUB_AR_PHRASES = [
  'إلغاء الاشتراك', 'الغاء اشتراكي', 'ألغوا اشتراكي', 'الغي اشتراكي',
  'لا ترسلوا لي', 'لا ترسل لي', 'لا تراسلني', 'لا تراسلوني',
  'توقفوا عن الإرسال', 'توقف عن الإرسال',
  'امسحني من القائمة', 'امسحوني من القائمة', 'احذفني من القائمة', 'احذفوني من القائمة',
  'أزلني من القائمة', 'أزيلوني من القائمة', 'شيلني من القائمة', 'شيلوني من القائمة',
  'ما تبعتليش', 'متبعتليش'
].map(normalizeInboundText);

function intentResult(source, language, confidence) {
  return { intent: true, source, language, confidence };
}

// listUnsubscribe is the raw List-Unsubscribe header value (empty when absent). Confidence:
//  high   = clear phrase in the leading body text, or a List-Unsubscribe header together with an unsubscribe subject;
//  medium = subject-only phrase, or a List-Unsubscribe header alone (a machine-marked signal, acted on only in a linked thread);
//  none   = no intent.
export function detectUnsubscribeIntent({ listUnsubscribe = '', subject = '', body = '' } = {}) {
  const scan = normalizeInboundText(leadingReplyText(body)).slice(0, UNSUBSCRIBE_SCAN_CHARS);
  for (const sentence of scan.split(/[.!?\n؟۔]+/)) {
    if (!sentence.trim()) continue;
    for (const pattern of UNSUB_EN_PATTERNS) {
      const hit = pattern.exec(sentence);
      if (!hit) continue;
      if (EN_NEGATION_IMMEDIATE.test(sentence.slice(Math.max(0, hit.index - 14), hit.index))) continue;
      return intentResult('body-phrase', 'en', 'high');
    }
    if (UNSUB_AR_PHRASES.some(phrase => sentence.includes(phrase))) return intentResult('body-phrase', 'ar', 'high');
  }
  const subjectText = normalizeInboundText(subject);
  const subjectHit = UNSUB_EN_PATTERNS.some(pattern => pattern.test(subjectText)) || UNSUB_AR_PHRASES.some(phrase => subjectText.includes(phrase));
  const language = /[؀-ۿ]/.test(subjectText) ? 'ar' : 'en';
  const listHeader = String(listUnsubscribe ?? '').trim().length > 0;
  if (listHeader && subjectHit) return intentResult('list-unsubscribe-and-subject', language, 'high');
  if (subjectHit) return intentResult('subject-phrase', language, 'medium');
  if (listHeader) return intentResult('list-unsubscribe-header', '', 'medium');
  return { intent: false, source: 'none', language: '', confidence: 'none' };
}

// Operational classes for IMAP poll failures. The class decides whether a failure counts toward quarantine ('auth'),
// earns a bounded backoff window ('transient'), or is only logged ('other'). Only the fixed reason code is ever returned.
export const IMAP_AUTH_FAILURE_LIMIT = 3;
export const IMAP_TRANSIENT_RETRY_LIMIT = 2;
export const IMAP_BACKOFF_BASE_MS = 60000;
export const IMAP_BACKOFF_CAP_MS = 1800000;
const TRANSIENT_NETWORK_CODES = new Set(['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND']);

export function classifyImapPollFailure(failure = {}) {
  if (String(failure?.status || '') === 'UBERIMAP_CREDENTIAL_UNAVAILABLE') return { kind: 'auth', reasonCode: 'IMAP_CREDENTIAL_UNAVAILABLE' };
  const code = String(failure?.code || '').toUpperCase();
  const message = String(failure?.message || '');
  // The LOGIN command is always the first tagged command of a session (UB0001). A NO or BAD answer to it is a credential refusal.
  if (code === 'IMAP_AUTH_REJECTED' || /^imap-command-rejected:(?:[\s\S]*\r?\n)?UB0001 (?:NO|BAD)\b/.test(message)) return { kind: 'auth', reasonCode: 'IMAP_AUTH_REJECTED' };
  if (code === 'IMAP_CONNECT_FAILED') return { kind: 'transient', reasonCode: 'IMAP_CONNECT_FAILED' };
  if (TRANSIENT_NETWORK_CODES.has(code)) return { kind: 'transient', reasonCode: 'IMAP_TRANSIENT_NETWORK' };
  if (message === 'imap-response-timeout') return { kind: 'transient', reasonCode: 'IMAP_RESPONSE_TIMEOUT' };
  if (message === 'imap-connection-closed') return { kind: 'transient', reasonCode: 'IMAP_CONNECTION_CLOSED' };
  return { kind: 'other', reasonCode: 'IMAP_OTHER' };
}

// Exponential backoff after consecutive transient failures, capped so an outage never silences a mailbox for long.
export function imapBackoffMs(consecutiveFailures = 1) {
  const exponent = Math.min(Math.max(0, Math.floor(Number(consecutiveFailures) || 1) - 1), 10);
  return Math.min(IMAP_BACKOFF_CAP_MS, IMAP_BACKOFF_BASE_MS * 2 ** exponent);
}

// A digest of the encrypted credential blob. It changes whenever the credential is rewritten, so rotation is detected
// without ever reading or logging the credential itself.
export function credentialDigest(tokens = null) {
  const serialized = typeof tokens === 'string' ? tokens : JSON.stringify(tokens ?? null);
  return crypto.createHash('sha256').update(`imap-account-tokens:${serialized}`).digest('hex');
}

// A bounded, control-free preview. Counts code points, so a multi-byte character is never split.
export function boundedPreview(value = '', maxChars = 500) {
  const limit = Math.max(0, Math.floor(Number(maxChars) || 0));
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  return Array.from(text).slice(0, limit).join('');
}
