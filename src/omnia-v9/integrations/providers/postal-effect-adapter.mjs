import crypto from 'node:crypto';
import { ExternalEffectAdapter, ADAPTER_OUTCOMES } from '../external-effect-adapter.mjs';
import {
  DEFINITE_REJECTION_HTTP_STATUSES,
  deterministicV9MessageId,
  executionDigestFromMessageId,
  validateRecipientAddress,
  validateFromAddress,
  validateSubjectAndBody,
  validateListUnsubscribeUrl
} from './email-effect-primitives.mjs';
import { POSTAL_PROVENANCE, POSTAL_EXECUTION_TAG_RE } from './postal-webhook-evidence.mjs';

/**
 * Postal implementation of the provider-neutral external-effect contract.
 *
 * Postal is the only lawful cold-B2B transport in the reviewed free-provider
 * pool, and it is self-hosted, which means this adapter is the one place where
 * a message can actually leave the building. Nothing registers it in a
 * dispatcher: it stays deliberately unreachable until outbound authorization,
 * PTR/rDNS, SPF/DKIM/DMARC/TLS alignment and seed placement are all proven.
 *
 * Two things about Postal shape this file more than anything else.
 *
 * First, Postal answers HTTP 200 with `{status:'error'}` for many failures, so
 * the HTTP status alone never establishes success. Acceptance requires 2xx AND
 * `status === 'success'` AND a message id AND a per-recipient id -- four
 * witnesses, because three of them can be present while the send did not
 * happen.
 *
 * Second, Postal's send response tells you nothing about delivery. Delivery
 * facts arrive later, over signed webhooks, which is why reconciliation here
 * reads an independent webhook ledger rather than re-querying the send API.
 *
 * The outcome this adapter may never return is NOT_FOUND. In
 * external-effect-recovery.mjs, NOT_FOUND is the single classification that
 * transitions to RECONCILED_NOT_SUBMITTED, which is one of exactly two states
 * that release the business key -- i.e. it is the outcome that authorizes
 * sending the same message to the same person again. Absence of a webhook is
 * not proof of non-submission: Postal may not have emitted one yet, the
 * webhook may have been lost, or the endpoint may have been down. "We have no
 * evidence" is UNCERTAIN. It stays UNCERTAIN forever rather than becoming
 * permission for a second send.
 */

export const POSTAL_EFFECT_ADAPTER_VERSION = 'uberbond.postal-effect-adapter-1.1.0';
export const POSTAL_DEFAULT_TIMEOUT_MS = 15_000;

export class PostalEffectAdapterError extends Error {
  constructor(message, code = 'POSTAL_EFFECT_ADAPTER_ERROR', detail = {}) {
    super(message); this.name = 'PostalEffectAdapterError'; this.code = code; this.detail = detail;
  }
}

/** The error identity this adapter raises, handed to every shared primitive. */
function postalError(message, code, detail) {
  return new PostalEffectAdapterError(message, code, detail);
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

function messageIdFor(executionId, domain) {
  return deterministicV9MessageId(executionId, domain, postalError);
}

/**
 * Postal's `tag` is the only field that survives from send to webhook and is
 * queryable, so it is this system's join key. It is 48 hex of the execution
 * digest -- a truncation of the same one-way digest already inside the
 * Message-ID, so the tag reveals nothing the header does not and the two can
 * always be derived from each other.
 */
function effectTag(executionId) { return `v9_${hash(executionId).slice(0, 48)}`; }

/**
 * The same tag, recovered from a Message-ID with no `executionId` in hand.
 *
 * This exists because external-effect-recovery.mjs calls
 * `adapter.reconcile({ businessKey, providerEffectIdentity, expectedTo })` and
 * passes no `executionId` at all. An adapter that requires one throws inside
 * the recovery transaction and aborts the whole claimed batch, so every other
 * uncertain execution in that batch stays uncertain because of this one.
 */
export function postalEffectTagFromMessageId(messageId) {
  const digest = executionDigestFromMessageId(messageId);
  return digest ? `v9_${digest.slice(0, 48)}` : null;
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

const WEBHOOK_LEDGER_METHOD = 'postal-effect-adapter:webhook-ledger';

export class PostalEffectAdapter extends ExternalEffectAdapter {
  /**
   * @param {number} timeoutMs - hard ceiling on the single dispatch call.
   *   Without one, `fetchImpl` on a hung socket never settles and the
   *   execution sits in DISPATCHING with no classification and no recovery
   *   trigger -- an unbounded wait is not an outcome.
   */
  constructor({ baseUrl, apiKey, fromAddress, messageIdDomain, fetchImpl = globalThis.fetch, reconciliationLookupFn = null, timeoutMs = POSTAL_DEFAULT_TIMEOUT_MS, now = () => new Date() } = {}) {
    super();
    this.baseUrl = safeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '');
    this.messageIdDomain = String(messageIdDomain || '').trim().toLowerCase();
    this.fetchImpl = fetchImpl;
    this.reconciliationLookupFn = reconciliationLookupFn;
    this.now = now;
    this.dispatchCallCount = 0;
    if (!this.baseUrl) throw new PostalEffectAdapterError('Postal baseUrl must be HTTPS without embedded credentials', 'CONFIG');
    if (!this.apiKey) throw new PostalEffectAdapterError('Postal apiKey is required', 'CONFIG');
    if (typeof this.fetchImpl !== 'function') throw new PostalEffectAdapterError('fetch implementation is required', 'CONFIG');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(this.messageIdDomain)) throw new PostalEffectAdapterError('messageIdDomain must be explicit and valid', 'CONFIG');
    const bounded = Number(timeoutMs);
    if (!Number.isFinite(bounded) || bounded <= 0 || bounded > 120_000) throw new PostalEffectAdapterError('timeoutMs must be a positive number of milliseconds no greater than 120000', 'CONFIG');
    this.timeoutMs = Math.floor(bounded);
    this.fromAddress = validateFromAddress(fromAddress, postalError, { allowDisplayName: false });
  }

  get providerName() { return 'postal'; }

  async prepare({ businessKey, providerEffectIdentity, executionId, effectPayload = {} } = {}) {
    if (!businessKey || !executionId || !providerEffectIdentity) throw new PostalEffectAdapterError('businessKey, providerEffectIdentity, and executionId are required', 'INVALID_INPUT');
    const to = validateRecipientAddress(effectPayload.to, postalError);
    const from = effectPayload.from ? validateFromAddress(effectPayload.from, postalError, { allowDisplayName: false }) : this.fromAddress;
    if (from.toLowerCase() !== this.fromAddress.toLowerCase()) throw new PostalEffectAdapterError('effectPayload.from does not match approved sender', 'FROM_IDENTITY_MISMATCH');
    const subject = String(effectPayload.subject ?? '');
    const body = String(effectPayload.body ?? '');
    validateSubjectAndBody(subject, body, postalError);
    if (effectPayload.cc || effectPayload.bcc || effectPayload.attachments?.length) throw new PostalEffectAdapterError('cc, bcc, and attachments are not supported', 'DISALLOWED_PAYLOAD');
    const allowed = new Set(['to', 'from', 'subject', 'body', 'listUnsubscribe']);
    for (const key of Object.keys(effectPayload)) if (!allowed.has(key)) throw new PostalEffectAdapterError(`unexpected effectPayload field: ${key}`, 'UNEXPECTED_FIELD');
    const listUnsubscribe = validateListUnsubscribeUrl(effectPayload.listUnsubscribe, postalError);
    const id = messageIdFor(executionId, this.messageIdDomain);
    if (String(providerEffectIdentity) !== id) throw new PostalEffectAdapterError('providerEffectIdentity does not match deterministic Message-ID', 'PROVIDER_EFFECT_IDENTITY_MISMATCH');
    return {
      businessKey, providerEffectIdentity: id, executionId, to, from, subject, body,
      messageId: id,
      listUnsubscribe,
      tag: effectTag(executionId),
      argumentsDigest: hash(JSON.stringify({
        to: to.toLowerCase(), from: from.toLowerCase(),
        subjectSha256: hash(subject), bodySha256: hash(body),
        messageId: id, listUnsubscribe: String(listUnsubscribe || '')
      }))
    };
  }

  async dispatch(prepared) {
    this.dispatchCallCount += 1;
    const observedAt = this.now().toISOString();
    const headers = { 'Message-ID': prepared.messageId };
    if (prepared.listUnsubscribe) {
      headers['List-Unsubscribe'] = `<${prepared.listUnsubscribe}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    // Exactly one fetch, with a hard deadline, and no retry loop anywhere in
    // this method. A retry after an unclassified failure is a second send of a
    // message that may already have gone out.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new PostalEffectAdapterError(`Postal dispatch exceeded ${this.timeoutMs}ms`, 'DISPATCH_TIMEOUT')), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1/send/message`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': this.apiKey },
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
      // A timeout is the most dangerous outcome of all: the request may have
      // been fully delivered and the message sent while we stopped listening.
      // UNCERTAIN, always -- an abort is our decision, never the provider's
      // answer.
      const timedOut = controller.signal.aborted;
      return {
        classification: ADAPTER_OUTCOMES.UNCERTAIN,
        providerReferenceId: null,
        evidence: null,
        timedOut,
        dispatchError: timedOut ? `postal-dispatch-timeout-after-${this.timeoutMs}ms` : text(error?.message || error)
      };
    } finally {
      clearTimeout(timer);
    }

    const statusCode = Number(response?.status || 0);
    const payload = await readJson(response);
    const postalStatus = String(payload?.status || '').toLowerCase();
    if (DEFINITE_REJECTION_HTTP_STATUSES.has(statusCode)) {
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
    // `recipient.token` is deliberately not read, not returned and not
    // digested into any field on its own: it is a live per-message credential
    // against Postal's API, and a receipt is a durable object.
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

  /**
   * Read-only. Never resubmits anything, and works from
   * `providerEffectIdentity` alone because that is the only identifier the
   * recovery worker actually passes.
   */
  async reconcile({ businessKey, providerEffectIdentity, executionId, expectedTo, expectedFrom, expectedSubjectSha256 } = {}) {
    const observedAt = this.now().toISOString();
    const ambiguous = (reason, detail = {}, providerReferenceId = null) =>
      evidence({ businessKey, providerReferenceId, lifecycle: 'AMBIGUOUS', acquisitionMethod: WEBHOOK_LEDGER_METHOD, observedAt, detail: { reason, ...detail } });
    const uncertain = (reason, detail = {}, providerReferenceId = null) =>
      evidence({ businessKey, providerReferenceId, lifecycle: 'UNCERTAIN', acquisitionMethod: WEBHOOK_LEDGER_METHOD, observedAt, detail: { reason, ...detail } });

    const claimedMessageId = text(providerEffectIdentity, 998);
    const derivedMessageId = executionId ? messageIdFor(executionId, this.messageIdDomain) : null;
    const expectedMessageId = claimedMessageId || derivedMessageId;
    if (!expectedMessageId) {
      throw new PostalEffectAdapterError('reconcile() requires providerEffectIdentity or executionId to derive the Message-ID', 'INVALID_INPUT');
    }
    // A caller that supplies both and disagrees is not resolved by preferring
    // one of them: which execution this row belongs to is the entire question.
    if (claimedMessageId && derivedMessageId && claimedMessageId !== derivedMessageId) {
      return ambiguous('execution-id-disagrees-with-provider-effect-identity');
    }
    const tag = postalEffectTagFromMessageId(expectedMessageId);
    if (!tag || !POSTAL_EXECUTION_TAG_RE.test(tag)) {
      return ambiguous('provider-effect-identity-is-not-a-v9-message-id');
    }

    if (typeof this.reconciliationLookupFn !== 'function') {
      return uncertain('postal-reconciliation-ledger-not-configured', { tag });
    }
    let matches;
    try { matches = await this.reconciliationLookupFn({ tag, messageId: expectedMessageId }); }
    catch (error) { return uncertain('reconciliation-lookup-failed', { error: text(error?.message || error) }); }

    if (!Array.isArray(matches) || matches.length === 0) {
      // Never NOT_FOUND. See this module's header comment: NOT_FOUND is the
      // outcome that frees the business key for a resend.
      return uncertain('zero-webhook-matches-not-proof-of-non-submission', { tag });
    }
    if (matches.length > 1) return ambiguous('multiple-webhook-matches', { count: matches.length });

    const row = matches[0] || {};
    const providerReferenceId = row.postalMessageId ? String(row.postalMessageId) : (row.id ? String(row.id) : null);

    // Provenance first. A row that is merely shaped correctly is an assertion
    // by whoever built it; only a row that came from an RSA-verified Postal
    // webhook is evidence about the outside world.
    if (row.provenance !== POSTAL_PROVENANCE.AUTHENTICATED) {
      return ambiguous('reconciliation-row-provenance-not-authenticated-postal-webhook', { provenance: text(row.provenance, 80) || 'MISSING' }, providerReferenceId);
    }
    if (row.contradictory === true) return ambiguous('contradictory-postal-message-ids-for-one-execution', {}, providerReferenceId);
    if (String(row.tag || '') !== tag) return ambiguous('tag-mismatch', {}, providerReferenceId);
    if (row.messageHeaderId && String(row.messageHeaderId).trim().toLowerCase() !== expectedMessageId.trim().toLowerCase()) {
      return ambiguous('message-id-mismatch', {}, providerReferenceId);
    }
    if (expectedTo && String(row.to || '').toLowerCase() !== String(expectedTo).toLowerCase()) return ambiguous('recipient-mismatch', {}, providerReferenceId);
    if (expectedFrom && String(row.from || '').toLowerCase() !== String(expectedFrom).toLowerCase()) return ambiguous('sender-mismatch', {}, providerReferenceId);
    if (expectedSubjectSha256 && String(row.subjectSha256 || '') !== String(expectedSubjectSha256)) return ambiguous('subject-digest-mismatch', {}, providerReferenceId);

    const lifecycle = String(row.lifecycle || '').toUpperCase();
    if (lifecycle === 'SENT' || lifecycle === 'DELIVERED') {
      return evidence({ businessKey, providerReferenceId, lifecycle: 'RECONCILED_ACCEPTED', acquisitionMethod: WEBHOOK_LEDGER_METHOD, observedAt, detail: { tag, postalLifecycle: lifecycle, negativeDeliveryEvidence: false } });
    }
    if (lifecycle === 'BOUNCED') {
      // A bounce proves the message WAS submitted and accepted by Postal --
      // it is the mail system reporting back about a message it carried. It
      // is acceptance with negative delivery evidence, not provider rejection,
      // and calling it RECONCILED_REJECTED would durably record that Postal
      // refused a message it in fact sent.
      return evidence({ businessKey, providerReferenceId, lifecycle: 'RECONCILED_ACCEPTED', acquisitionMethod: WEBHOOK_LEDGER_METHOD, observedAt, detail: { tag, postalLifecycle: lifecycle, negativeDeliveryEvidence: true } });
    }
    if (lifecycle === 'DELIVERY_FAILED') {
      return evidence({ businessKey, providerReferenceId, lifecycle: 'RECONCILED_REJECTED', acquisitionMethod: WEBHOOK_LEDGER_METHOD, observedAt, detail: { tag, postalLifecycle: lifecycle } });
    }
    return uncertain('postal-lifecycle-not-terminal', { tag, postalLifecycle: lifecycle || 'UNKNOWN' }, providerReferenceId);
  }

  classifyOutcome(providerEvidence) {
    const lifecycle = providerEvidence?.lifecycle;
    if (lifecycle === 'ACCEPTED') return ADAPTER_OUTCOMES.ACCEPTED;
    if (lifecycle === 'REJECTED') return ADAPTER_OUTCOMES.REJECTED;
    if (lifecycle === 'RECONCILED_ACCEPTED') return ADAPTER_OUTCOMES.RECONCILED_ACCEPTED;
    if (lifecycle === 'RECONCILED_REJECTED') return ADAPTER_OUTCOMES.RECONCILED_REJECTED;
    if (lifecycle === 'AMBIGUOUS') return ADAPTER_OUTCOMES.AMBIGUOUS;
    // NOT_FOUND is absent by design, including as a passthrough. Evidence
    // objects reach here from a durable store, and a forged or drifted row
    // claiming NOT_FOUND would otherwise release the business key and
    // authorize a duplicate send. Anything this adapter cannot positively
    // classify is UNCERTAIN.
    return ADAPTER_OUTCOMES.UNCERTAIN;
  }
}

export function postalProviderEffectIdentity(executionId, messageIdDomain) { return messageIdFor(executionId, String(messageIdDomain || '').trim().toLowerCase()); }
export function postalEffectTag(executionId) { return effectTag(executionId); }
