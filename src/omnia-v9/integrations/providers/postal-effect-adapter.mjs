import crypto from 'node:crypto';
import { ExternalEffectAdapter, ADAPTER_OUTCOMES } from '../external-effect-adapter.mjs';

export const POSTAL_EFFECT_ADAPTER_VERSION = 'uberbond.postal-effect-adapter-1.3.0';
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;
const DEFINITE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 422]);
const MESSAGE_ID_RE = /^<v9-([a-f0-9]{64})@([a-z0-9.-]+\.[a-z]{2,})>$/i;
const SUBMISSION_PROOF_STATUSES = new Set([
  'SENT', 'DELIVERED', 'MESSAGESENT', 'ACCEPTED',
  'DELAYED', 'MESSAGEDELAYED', 'HELD', 'MESSAGEHELD',
  'DELIVERY_FAILED', 'MESSAGEDELIVERYFAILED',
  'BOUNCED', 'MESSAGEBOUNCED',
  'OPENED', 'MESSAGELOADED', 'CLICKED', 'MESSAGELINKCLICKED'
]);
const NEGATIVE_DELIVERY_STATUSES = new Set([
  'DELIVERY_FAILED', 'MESSAGEDELIVERYFAILED',
  'BOUNCED', 'MESSAGEBOUNCED'
]);

export class PostalEffectAdapterError extends Error {
  constructor(message, code = 'POSTAL_EFFECT_ADAPTER_ERROR', detail = {}) {
    super(message); this.name = 'PostalEffectAdapterError'; this.code = code; this.detail = detail;
  }
}
function hash(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function text(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function safeBaseUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}
function email(value, field) {
  const out = String(value || '').trim();
  if (!EMAIL_RE.test(out) || /[\r\n]/.test(out)) throw new PostalEffectAdapterError(`${field} must be a valid email address`, `INVALID_${field.toUpperCase()}`);
  return out;
}
function messageId(executionId, domain) {
  if (!executionId) throw new PostalEffectAdapterError('executionId is required', 'INVALID_INPUT');
  const d = String(domain || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)) throw new PostalEffectAdapterError('messageIdDomain must be explicit and valid', 'CONFIG');
  return `<v9-${hash(executionId)}@${d}>`;
}
function messageIdentity(providerEffectIdentity, expectedDomain) {
  const raw = String(providerEffectIdentity || '').trim();
  const match = MESSAGE_ID_RE.exec(raw);
  if (!match || match[2].toLowerCase() !== String(expectedDomain || '').toLowerCase()) return null;
  return { messageId: raw, executionDigest: match[1].toLowerCase(), tag: `v9_${match[1].slice(0, 48).toLowerCase()}` };
}
function effectTag(executionId) { return `v9_${hash(executionId).slice(0, 48)}`; }
function listUnsubscribe(value) {
  if (value == null || value === '') return null;
  const raw = String(value);
  if (raw.length > 2048 || /[\r\n<>]/.test(raw)) throw new PostalEffectAdapterError('listUnsubscribe contains unsafe header characters', 'INVALID_HEADER');
  let url;
  try { url = new URL(raw); }
  catch { throw new PostalEffectAdapterError('listUnsubscribe must be a valid HTTPS URL', 'INVALID_HEADER'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new PostalEffectAdapterError('listUnsubscribe must be an HTTPS URL without embedded credentials', 'INVALID_HEADER');
  return url.href;
}
async function readJson(response) {
  try { return typeof response?.json === 'function' ? await response.json() : null; }
  catch { return null; }
}
function evidence({ businessKey, providerReferenceId = null, lifecycle, acquisitionMethod, detail = {}, observedAt }) {
  return {
    businessIdentity: businessKey,
    providerReferenceId,
    observedAt,
    evidenceType: acquisitionMethod.includes('webhook') ? 'RECONCILIATION_LOOKUP' : 'DISPATCH_RESPONSE',
    acquisitionMethod,
    reconciliationSource: acquisitionMethod.includes('webhook') ? 'postal-webhook-ledger' : '',
    lifecycle,
    detail
  };
}

export class PostalEffectAdapter extends ExternalEffectAdapter {
  constructor({ baseUrl, apiKey, fromAddress, messageIdDomain, fetchImpl = globalThis.fetch, reconciliationLookupFn = null, now = () => new Date(), timeoutMs = 15_000 } = {}) {
    super();
    this.baseUrl = safeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '');
    this.fromAddress = email(fromAddress, 'from');
    this.messageIdDomain = String(messageIdDomain || '').trim().toLowerCase();
    this.fetchImpl = fetchImpl;
    this.reconciliationLookupFn = reconciliationLookupFn;
    this.now = now;
    this.timeoutMs = Number.isSafeInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 120_000 ? timeoutMs : null;
    this.dispatchCallCount = 0;
    if (!this.baseUrl) throw new PostalEffectAdapterError('Postal baseUrl must be HTTPS without embedded credentials', 'CONFIG');
    if (!this.apiKey) throw new PostalEffectAdapterError('Postal apiKey is required', 'CONFIG');
    if (typeof this.fetchImpl !== 'function') throw new PostalEffectAdapterError('fetch implementation is required', 'CONFIG');
    if (!this.timeoutMs) throw new PostalEffectAdapterError('timeoutMs must be between 100 and 120000 milliseconds', 'CONFIG');
    messageId('configuration-probe', this.messageIdDomain);
  }
  get providerName() { return 'postal'; }

  async prepare({ businessKey, providerEffectIdentity, executionId, effectPayload = {} } = {}) {
    if (!businessKey || !executionId || !providerEffectIdentity) throw new PostalEffectAdapterError('businessKey, providerEffectIdentity, and executionId are required', 'INVALID_INPUT');
    const to = email(effectPayload.to, 'to');
    const from = effectPayload.from ? email(effectPayload.from, 'from') : this.fromAddress;
    if (from.toLowerCase() !== this.fromAddress.toLowerCase()) throw new PostalEffectAdapterError('effectPayload.from does not match approved sender', 'FROM_IDENTITY_MISMATCH');
    const subject = String(effectPayload.subject || '');
    const body = String(effectPayload.body || '');
    if (!subject.trim() || subject.length > MAX_SUBJECT || /[\r\n]/.test(subject)) throw new PostalEffectAdapterError('subject is missing, too long, or header-unsafe', 'INVALID_SUBJECT');
    if (!body.trim() || body.length > MAX_BODY) throw new PostalEffectAdapterError('body is missing or too long', 'INVALID_BODY');
    if (effectPayload.cc || effectPayload.bcc || effectPayload.attachments?.length) throw new PostalEffectAdapterError('cc, bcc, and attachments are not supported', 'DISALLOWED_PAYLOAD');
    const allowed = new Set(['to', 'from', 'subject', 'body', 'listUnsubscribe']);
    for (const key of Object.keys(effectPayload)) if (!allowed.has(key)) throw new PostalEffectAdapterError(`unexpected effectPayload field: ${key}`, 'UNEXPECTED_FIELD');
    const unsubscribe = listUnsubscribe(effectPayload.listUnsubscribe);
    const id = messageId(executionId, this.messageIdDomain);
    if (String(providerEffectIdentity) !== id) throw new PostalEffectAdapterError('providerEffectIdentity does not match deterministic Message-ID', 'PROVIDER_EFFECT_IDENTITY_MISMATCH');
    return {
      businessKey, providerEffectIdentity: id, executionId, to, from, subject, body,
      messageId: id,
      tag: effectTag(executionId),
      listUnsubscribe: unsubscribe,
      argumentsDigest: hash(JSON.stringify({
        to: to.toLowerCase(), from: from.toLowerCase(), subjectSha256: hash(subject), bodySha256: hash(body),
        messageId: id, listUnsubscribe: unsubscribe || ''
      }))
    };
  }

  async dispatch(prepared) {
    this.dispatchCallCount += 1;
    const observedAt = this.now().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('postal-dispatch-timeout')), this.timeoutMs);
    let response;
    try {
      const headers = { 'Message-ID': prepared.messageId };
      if (prepared.listUnsubscribe) {
        headers['List-Unsubscribe'] = `<${prepared.listUnsubscribe}>`;
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
      response = await this.fetchImpl(`${this.baseUrl}/api/v1/send/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': this.apiKey },
        signal: controller.signal,
        body: JSON.stringify({
          to: [prepared.to],
          from: prepared.from,
          subject: prepared.subject,
          plain_body: prepared.body,
          tag: prepared.tag,
          headers
        })
      });
    } catch (error) {
      const reason = controller.signal.aborted ? 'Postal dispatch timed out; provider outcome is uncertain' : text(error?.message || error);
      return { classification: ADAPTER_OUTCOMES.UNCERTAIN, providerReferenceId: null, evidence: null, dispatchError: reason };
    } finally {
      clearTimeout(timer);
    }
    const statusCode = Number(response?.status || 0);
    const payload = await readJson(response);
    const postalStatus = String(payload?.status || '').toLowerCase();
    if (DEFINITE_REJECTION_STATUSES.has(statusCode)) {
      return {
        classification: ADAPTER_OUTCOMES.REJECTED,
        providerReferenceId: null,
        evidence: evidence({ businessKey: prepared.businessKey, lifecycle: 'REJECTED', acquisitionMethod: 'postal-effect-adapter:synchronous-send-response', observedAt, detail: { httpStatus: statusCode, responseDigest: hash(JSON.stringify(payload || {})), tag: prepared.tag } })
      };
    }
    if (statusCode === 429 || statusCode >= 500 || statusCode < 200 || statusCode >= 300 || postalStatus !== 'success') {
      return { classification: ADAPTER_OUTCOMES.UNCERTAIN, providerReferenceId: null, evidence: null, dispatchError: `Postal outcome uncertain (http=${statusCode || 'none'}, status=${postalStatus || 'missing'})` };
    }
    const data = payload?.data || {};
    const recipient = data?.messages?.[prepared.to] || data?.messages?.[prepared.to.toLowerCase()] || null;
    const providerReferenceId = recipient?.id == null ? null : String(recipient.id);
    if (!data?.message_id || !providerReferenceId) {
      return { classification: ADAPTER_OUTCOMES.UNCERTAIN, providerReferenceId: null, evidence: null, dispatchError: 'Postal success response lacked required message identifiers' };
    }
    return {
      classification: ADAPTER_OUTCOMES.ACCEPTED,
      providerReferenceId,
      evidence: evidence({
        businessKey: prepared.businessKey,
        providerReferenceId,
        lifecycle: 'ACCEPTED',
        acquisitionMethod: 'postal-effect-adapter:synchronous-send-response',
        observedAt,
        detail: { postalMessageId: String(data.message_id), recipientMessageId: providerReferenceId, tag: prepared.tag, responseDigest: hash(JSON.stringify(data)) }
      })
    };
  }

  async reconcile({ businessKey, providerEffectIdentity, executionId, expectedTo, expectedFrom, expectedSubjectSha256 } = {}) {
    const observedAt = this.now().toISOString();
    if (!businessKey || !providerEffectIdentity) throw new PostalEffectAdapterError('reconcile requires businessKey and providerEffectIdentity', 'INVALID_INPUT');
    const identity = messageIdentity(providerEffectIdentity, this.messageIdDomain);
    if (!identity) return evidence({ businessKey, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'provider-effect-identity-malformed-or-domain-mismatch' } });
    if (executionId) {
      const suppliedExpected = messageId(executionId, this.messageIdDomain);
      if (suppliedExpected !== providerEffectIdentity) return evidence({ businessKey, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'execution-id-provider-effect-identity-mismatch' } });
    }
    if (typeof this.reconciliationLookupFn !== 'function') {
      return evidence({ businessKey, lifecycle: 'UNCERTAIN', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'postal-reconciliation-ledger-not-configured', tag: identity.tag } });
    }
    let matches;
    try { matches = await this.reconciliationLookupFn({ tag: identity.tag, messageId: identity.messageId }); }
    catch (error) { return evidence({ businessKey, lifecycle: 'UNCERTAIN', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'reconciliation-lookup-failed', error: text(error?.message || error) } }); }
    if (!Array.isArray(matches) || matches.length === 0) return evidence({ businessKey, lifecycle: 'UNCERTAIN', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'zero-webhook-matches-not-proof-of-non-submission', tag: identity.tag } });
    if (matches.length > 1) return evidence({ businessKey, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'multiple-webhook-matches', count: matches.length } });
    const row = matches[0] || {};
    const providerReferenceId = String(row.id || row.providerReferenceId || row.postalMessageId || '');
    if (row.provenance !== 'AUTHENTICATED_POSTAL_WEBHOOK') return evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'unauthenticated-or-unproven-reconciliation-row' } });
    if (row.tag !== identity.tag) return evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'tag-mismatch' } });
    if (row.messageId && String(row.messageId) !== identity.messageId) return evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'message-id-mismatch' } });
    if (expectedTo && String(row.to || '').toLowerCase() !== String(expectedTo).toLowerCase()) return evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'recipient-mismatch' } });
    if (expectedFrom && String(row.from || '').toLowerCase() !== String(expectedFrom).toLowerCase()) return evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'sender-mismatch' } });
    if (expectedSubjectSha256 && row.subjectSha256 && String(row.subjectSha256) !== expectedSubjectSha256) return evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { reason: 'subject-digest-mismatch' } });
    const lifecycleStatus = String(row.lifecycle || '').toUpperCase();
    const providerStatus = String(row.status || '').toUpperCase();
    const status = lifecycleStatus || providerStatus;
    if (SUBMISSION_PROOF_STATUSES.has(status)) {
      return evidence({
        businessKey,
        providerReferenceId,
        lifecycle: 'RECONCILED_ACCEPTED',
        acquisitionMethod: 'postal-effect-adapter:webhook-ledger',
        observedAt,
        detail: {
          tag: row.tag,
          status,
          providerStatus: providerStatus || null,
          provenance: row.provenance,
          negativeDeliveryEvidence: NEGATIVE_DELIVERY_STATUSES.has(status)
        }
      });
    }
    return evidence({ businessKey, providerReferenceId, lifecycle: 'UNCERTAIN', acquisitionMethod: 'postal-effect-adapter:webhook-ledger', observedAt, detail: { tag: row.tag, status: status || 'UNKNOWN', providerStatus: providerStatus || null, provenance: row.provenance } });
  }

  classifyOutcome(providerEvidence) {
    const lifecycle = providerEvidence?.lifecycle;
    if (lifecycle === 'ACCEPTED') return ADAPTER_OUTCOMES.ACCEPTED;
    if (lifecycle === 'REJECTED') return ADAPTER_OUTCOMES.REJECTED;
    if (lifecycle === 'RECONCILED_ACCEPTED') return ADAPTER_OUTCOMES.RECONCILED_ACCEPTED;
    if (lifecycle === 'RECONCILED_REJECTED') return ADAPTER_OUTCOMES.RECONCILED_REJECTED;
    if (lifecycle === 'AMBIGUOUS') return ADAPTER_OUTCOMES.AMBIGUOUS;
    return ADAPTER_OUTCOMES.UNCERTAIN;
  }
}

export function postalProviderEffectIdentity(executionId, messageIdDomain) { return messageId(executionId, messageIdDomain); }
export function postalEffectTag(executionId) { return effectTag(executionId); }
