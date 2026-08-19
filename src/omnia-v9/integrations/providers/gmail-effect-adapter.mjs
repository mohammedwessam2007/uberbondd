import crypto from 'node:crypto';
import { sendEmail, listMessages, getMessage, parseGmailMessage } from '../../../gmail.mjs';
import { ExternalEffectAdapter, ADAPTER_OUTCOMES } from '../external-effect-adapter.mjs';
import { sha256 } from '../../canonical.mjs';

/**
 * The real Gmail implementation of the provider-neutral external-effect
 * contract (external-effect-adapter.mjs). Implements exactly prepare/
 * dispatch/reconcile/classifyOutcome; the provider-neutral V9 execution
 * contract remains unaware this is Gmail. The owner pipeline bridge and the
 * generic dispatcher can both use this adapter, while reconciliation remains
 * read-only in either path.
 *
 * This module never sends anything on its own initiative -- it is called
 * only by external-effect-dispatcher.mjs, which is called only after V9
 * admission + authority reservation, exactly like every other adapter in
 * this codebase.
 *
 * See docs/omnia-v9/V9_GMAIL_ADAPTER_SPEC.md for the full design rationale
 * and docs/omnia-v9/V9_GMAIL_RECONCILIATION_REPORT.md for what has and has
 * not been empirically verified about Gmail's actual behavior.
 */

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 20000;
// Definite-rejection HTTP statuses: Gmail processed the request and
// explicitly refused it (malformed payload, invalid recipient it rejects
// server-side, permission/scope errors). 429 and 5xx are excluded on
// purpose -- those mean "the provider could not confirm anything," not "the
// provider rejected the message," per this mission's explicit instruction
// never to convert an unknown/transient provider result into REJECTED.
const DEFINITE_REJECTION_STATUSES = new Set([400, 401, 403, 404, 422]);

export class GmailEffectAdapterError extends Error {
  constructor(message, code = 'GMAIL_EFFECT_ADAPTER_ERROR', detail = {}) {
    super(message);
    this.name = 'GmailEffectAdapterError';
    this.code = code;
    this.detail = detail;
  }
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

/**
 * Deterministic, opaque, PII-free Message-ID: `<v9-{sha256(executionId)}@{messageIdDomain}>`.
 * Deliberately does NOT embed the recipient, business key, or any raw
 * internal identifier -- only a one-way digest of the execution ID, so the
 * header itself leaks nothing reversible even if observed by the recipient
 * or any mail-relay logging. `messageIdDomain` must be explicitly supplied
 * by the caller (never guessed or hardcoded to a real domain here) -- see
 * V9_GMAIL_ADAPTER_SPEC.md's "Message-ID design" section for why a
 * caller-supplied domain, not an assumed one, is required.
 */
export function generateMessageId(executionId, messageIdDomain) {
  if (!executionId) throw new GmailEffectAdapterError('executionId is required to generate a Message-ID', 'INVALID_INPUT');
  if (!messageIdDomain || typeof messageIdDomain !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(messageIdDomain)) {
    throw new GmailEffectAdapterError('a valid messageIdDomain must be explicitly supplied (no guessed/default domain)', 'INVALID_INPUT');
  }
  return `<v9-${sha256Hex(executionId)}@${messageIdDomain}>`;
}

function validateRecipient(to) {
  if (!to || typeof to !== 'string' || !to.trim()) throw new GmailEffectAdapterError('recipient is required', 'INVALID_RECIPIENT');
  if (!EMAIL_RE.test(to.trim())) throw new GmailEffectAdapterError(`recipient is not a valid email address: ${to}`, 'INVALID_RECIPIENT');
  return to.trim();
}

function validateFromAddress(value) {
  const text = String(value || '').trim();
  if (!text || /[\r\n]/.test(text)) {
    throw new GmailEffectAdapterError('fromAddress is required and must not contain CR/LF', 'INVALID_FROM');
  }
  if (EMAIL_RE.test(text)) return text;
  const match = text.match(/^([^<>\r\n]{1,160})\s*<([^<>\s@]+@[^<>\s@]+)>$/);
  if (!match || /[,;:"\\]/.test(match[1]) || !EMAIL_RE.test(match[2])) {
    throw new GmailEffectAdapterError('fromAddress must be an email or safe display-name email', 'INVALID_FROM');
  }
  return text;
}

function validateSubjectAndBody(subject, body) {
  if (!subject || typeof subject !== 'string' || !subject.trim()) throw new GmailEffectAdapterError('subject is required', 'INVALID_SUBJECT');
  if (subject.length > MAX_SUBJECT_LENGTH) throw new GmailEffectAdapterError(`subject exceeds ${MAX_SUBJECT_LENGTH} characters`, 'INVALID_SUBJECT');
  if (/[\r\n]/.test(subject)) throw new GmailEffectAdapterError('subject must not contain raw CR/LF (header injection)', 'INVALID_SUBJECT');
  if (typeof body !== 'string' || !body.trim()) throw new GmailEffectAdapterError('body is required', 'INVALID_BODY');
  if (body.length > MAX_BODY_LENGTH) throw new GmailEffectAdapterError(`body exceeds ${MAX_BODY_LENGTH} characters`, 'INVALID_BODY');
}

function stripAngleBrackets(messageId) {
  return String(messageId || '').replace(/^</, '').replace(/>$/, '');
}

function normalizeMailbox(value) {
  const text = String(value || '').trim().toLowerCase();
  const bracket = text.match(/<([^<>]+)>/);
  return (bracket ? bracket[1] : text).trim();
}

function mailboxHeaderContains(header, expected) {
  const wanted = normalizeMailbox(expected);
  if (!wanted) return false;
  return String(header || '').split(',').some(part => normalizeMailbox(part) === wanted);
}

function validateMessageIdHeader(value, field = 'replyToId') {
  if (value == null || value === '') return undefined;
  const text = String(value);
  if (text.length > 998 || /[\r\n]/.test(text) || !/^<[^<>\s@]+@[^<>\s@]+>$/.test(text)) {
    throw new GmailEffectAdapterError(`${field} must be one safe angle-bracketed Message-ID`, 'INVALID_HEADER', { field });
  }
  return text;
}

function validateListUnsubscribe(value) {
  if (value == null || value === '') return undefined;
  const text = String(value);
  if (text.length > 2048 || /[\r\n<>]/.test(text)) {
    throw new GmailEffectAdapterError('listUnsubscribe contains unsafe header characters', 'INVALID_HEADER', { field: 'listUnsubscribe' });
  }
  let parsed;
  try { parsed = new URL(text); }
  catch { throw new GmailEffectAdapterError('listUnsubscribe must be a valid HTTPS URL', 'INVALID_HEADER', { field: 'listUnsubscribe' }); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new GmailEffectAdapterError('listUnsubscribe must be an HTTPS URL without embedded credentials', 'INVALID_HEADER', { field: 'listUnsubscribe' });
  }
  return parsed.href;
}

function validateThreadId(value) {
  if (value == null || value === '') return undefined;
  const text = String(value);
  if (text.length > 256 || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new GmailEffectAdapterError('threadId contains unsupported characters', 'INVALID_INPUT', { field: 'threadId' });
  }
  return text;
}

export function gmailArgumentsDigest({ to, from, subject, body, messageId, threadId, replyToId, listUnsubscribe }) {
  return sha256({
    to: normalizeMailbox(to),
    from: normalizeMailbox(from),
    subjectSha256: sha256Hex(String(subject || '')),
    bodySha256: sha256Hex(String(body || '')),
    messageId: String(messageId || ''),
    threadId: String(threadId || ''),
    replyToId: String(replyToId || ''),
    listUnsubscribe: String(listUnsubscribe || '')
  });
}

export class GmailEffectAdapter extends ExternalEffectAdapter {
  /**
   * @param {object} deps
   * @param {object} deps.cfg           - Gmail OAuth client config (clientId/clientSecret/redirectUri), forwarded verbatim to src/gmail.mjs.
   * @param {object} deps.account       - the sending account record ({ tokens }) as src/gmail.mjs expects.
   * @param {string} deps.encryptionKey - the key used to open/seal the account's sealed tokens.
   * @param {string} deps.messageIdDomain - the domain used for generated Message-IDs; must be explicit, never assumed.
   * @param {string} deps.fromAddress   - the exact From: address this adapter is allowed to send as.
   */
  constructor({ cfg, account, encryptionKey, messageIdDomain, fromAddress, sendEmailFn = sendEmail, listMessagesFn = listMessages, getMessageFn = getMessage, parseMessageFn = parseGmailMessage } = {}) {
    super();
    if (!cfg) throw new GmailEffectAdapterError('cfg is required', 'CONFIG');
    if (!account) throw new GmailEffectAdapterError('account is required', 'CONFIG');
    if (!encryptionKey) throw new GmailEffectAdapterError('encryptionKey is required', 'CONFIG');
    if (!fromAddress) throw new GmailEffectAdapterError('fromAddress is required', 'CONFIG');
    this.cfg = cfg;
    this.account = account;
    this.encryptionKey = encryptionKey;
    this.messageIdDomain = messageIdDomain;
    this.fromAddress = validateFromAddress(fromAddress);
    this.sendEmailFn = sendEmailFn;
    this.listMessagesFn = listMessagesFn;
    this.getMessageFn = getMessageFn;
    this.parseMessageFn = parseMessageFn;
    this.dispatchCallCount = 0;
  }

  get providerName() {
    return 'gmail';
  }

  /**
   * All validation happens here, before any network I/O -- see
   * "static safety tests" in V9_GMAIL_ADAPTER_SPEC.md. Nothing unsafe ever
   * reaches dispatch().
   */
  async prepare({ businessKey, providerEffectIdentity, executionId, effectPayload = {} }) {
    if (!businessKey) throw new GmailEffectAdapterError('businessKey is required', 'INVALID_INPUT');
    if (!providerEffectIdentity) throw new GmailEffectAdapterError('providerEffectIdentity is required', 'INVALID_INPUT');
    if (!executionId) throw new GmailEffectAdapterError('executionId is required', 'INVALID_INPUT');

    const to = validateRecipient(effectPayload.to);
    validateSubjectAndBody(effectPayload.subject, effectPayload.body);

    if (effectPayload.bcc || effectPayload.cc) {
      throw new GmailEffectAdapterError('Bcc/Cc are not supported by this adapter', 'DISALLOWED_HEADER');
    }
    if (effectPayload.attachments && effectPayload.attachments.length > 0) {
      throw new GmailEffectAdapterError('attachments are not supported by this adapter', 'UNSUPPORTED_ATTACHMENT');
    }
    const ALLOWED_EXTRA_HEADER_KEYS = new Set(['from', 'replyToId', 'listUnsubscribe', 'threadId']);
    for (const key of Object.keys(effectPayload)) {
      if (['to', 'subject', 'body', 'bcc', 'cc', 'attachments'].includes(key)) continue;
      if (!ALLOWED_EXTRA_HEADER_KEYS.has(key)) {
        throw new GmailEffectAdapterError(`unexpected/unapproved field in effectPayload: ${key}`, 'UNEXPECTED_HEADER');
      }
    }

    const requestedFrom = effectPayload.from ? validateFromAddress(effectPayload.from) : this.fromAddress;
    if (requestedFrom !== this.fromAddress) {
      throw new GmailEffectAdapterError('effectPayload.from does not match the approved adapter sender', 'FROM_IDENTITY_MISMATCH');
    }
    const messageId = generateMessageId(executionId, this.messageIdDomain);
    if (String(providerEffectIdentity) !== messageId) {
      throw new GmailEffectAdapterError('providerEffectIdentity does not match the Message-ID derived from executionId', 'PROVIDER_EFFECT_IDENTITY_MISMATCH');
    }

    const prepared = {
      businessKey, providerEffectIdentity, executionId,
      to, from: requestedFrom, subject: effectPayload.subject, body: effectPayload.body,
      messageId,
      threadId: validateThreadId(effectPayload.threadId),
      replyToId: validateMessageIdHeader(effectPayload.replyToId),
      listUnsubscribe: validateListUnsubscribe(effectPayload.listUnsubscribe)
    };
    return { ...prepared, argumentsDigest: gmailArgumentsDigest(prepared) };
  }

  /**
   * The only method allowed to perform network I/O. Exactly one call to
   * sendEmail() per invocation -- this function itself contains no retry
   * loop of any kind, and does not rely on any Gmail-client-level
   * automatic-retry behavior (src/gmail.mjs makes one direct `fetch()` call
   * per Gmail API request with no retry wrapper -- verified by direct
   * source inspection, documented in V9_GMAIL_RECONCILIATION_REPORT.md's
   * "automatic retry inspection" section).
   */
  async dispatch(preparedEffect) {
    this.dispatchCallCount += 1;
    const { to, from, subject, body, messageId, threadId, replyToId, listUnsubscribe, businessKey } = preparedEffect;
    const observedAt = new Date().toISOString();

    let response;
    try {
      response = await this.sendEmailFn(this.cfg, this.account, this.encryptionKey, { to, from, subject, body, messageId, threadId, replyToId, listUnsubscribe });
    } catch (error) {
      const status = error?.status;
      if (typeof status === 'number' && DEFINITE_REJECTION_STATUSES.has(status)) {
        return {
          classification: ADAPTER_OUTCOMES.REJECTED,
          providerReferenceId: null,
          evidence: {
            businessIdentity: businessKey, providerReferenceId: null, observedAt,
            evidenceType: 'DISPATCH_RESPONSE', acquisitionMethod: 'gmail-effect-adapter:synchronous-send-response',
            reconciliationSource: '', lifecycle: 'REJECTED',
          detail: { messageId, httpStatus: status, rawResponseDigest: sha256Hex(String(error.message || '')) }
          }
        };
      }
      // Any other failure (network error, timeout, 429, 5xx, or any status
      // we do not treat as a definite rejection) proves nothing about what
      // Gmail actually did -- UNCERTAIN, never REJECTED, never silently
      // treated as success.
      return { classification: ADAPTER_OUTCOMES.UNCERTAIN, providerReferenceId: null, evidence: null, dispatchError: String(error?.message || error) };
    }

    const gmailMessageId = response?.data?.id || null;
    const gmailThreadId = response?.data?.threadId || null;
    if (!gmailMessageId) {
      return {
        classification: ADAPTER_OUTCOMES.UNCERTAIN,
        providerReferenceId: null,
        evidence: null,
        dispatchError: 'Gmail returned no provider message id; acceptance cannot be proven'
      };
    }
    return {
      classification: ADAPTER_OUTCOMES.ACCEPTED,
      providerReferenceId: gmailMessageId,
      tokens: response?.tokens,
      evidence: {
        businessIdentity: businessKey, providerReferenceId: gmailMessageId, observedAt,
        evidenceType: 'DISPATCH_RESPONSE', acquisitionMethod: 'gmail-effect-adapter:synchronous-send-response',
        reconciliationSource: '', lifecycle: 'ACCEPTED',
        detail: { messageId, gmailMessageId, gmailThreadId, rawResponseDigest: sha256Hex(JSON.stringify(response?.data || {})) }
      }
    };
  }

  /**
   * Read-only. Searches by the caller-generated Message-ID via the real,
   * documented `rfc822msgid:` Gmail search operator, never by resubmitting
   * anything. Distinguishes zero / one / multiple matches explicitly --
   * multiple matches are never resolved heuristically (section 16: always
   * AMBIGUOUS, never a guess).
   */
  async reconcile({ businessKey, providerEffectIdentity, executionId, expectedTo, expectedSubject, expectedSubjectSha256 }) {
    const observedAt = new Date().toISOString();
    const messageId = providerEffectIdentity || (executionId ? generateMessageId(executionId, this.messageIdDomain) : null);
    if (!messageId) {
      throw new GmailEffectAdapterError('reconcile() requires providerEffectIdentity or executionId to derive the Message-ID', 'INVALID_INPUT');
    }
    const bareMessageId = stripAngleBrackets(messageId);

    let listResult;
    try {
      listResult = await this.listMessagesFn(this.cfg, this.account, this.encryptionKey, `rfc822msgid:${bareMessageId}`, 10);
    } catch (error) {
      // A reconciliation LOOKUP failure is itself uncertain, not a proof of
      // anything -- never interpreted as NOT_FOUND.
      return {
        businessIdentity: businessKey, providerReferenceId: null, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search',
        reconciliationSource: 'gmail-api', lifecycle: 'UNCERTAIN', detail: { reason: 'search-failed', error: String(error?.message || error) }
      };
    }

    const matches = listResult?.data?.messages || [];
    if (matches.length === 0) {
      // Gmail does not document a zero-latency search-index guarantee. A
      // zero-result query therefore cannot prove non-submission and must
      // never release the business key or authorize a resend.
      return {
        businessIdentity: businessKey, providerReferenceId: null, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search',
        reconciliationSource: 'gmail-api', lifecycle: 'UNCERTAIN', detail: { reason: 'zero-matches-not-proof-of-non-submission', messageId }
      };
    }
    if (matches.length > 1) {
      return {
        businessIdentity: businessKey, providerReferenceId: null, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search',
        reconciliationSource: 'gmail-api', lifecycle: 'AMBIGUOUS', detail: { reason: 'multiple-matches', messageId, matchCount: matches.length }
      };
    }

    const full = await this.getMessageFn(this.cfg, this.account, this.encryptionKey, matches[0].id);
    const parsed = this.parseMessageFn(full.data);
    const parsedMessageId = stripAngleBrackets(parsed.messageId);
    if (parsedMessageId !== bareMessageId) {
      // Gmail returned a match for our search but the message's own
      // Message-ID header does not match what we searched for byte-for-byte
      // -- treat as ambiguous rather than trusting the search result alone.
      return {
        businessIdentity: businessKey, providerReferenceId: matches[0].id, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search+get',
        reconciliationSource: 'gmail-api', lifecycle: 'AMBIGUOUS',
        detail: { reason: 'message-id-mismatch-after-fetch', expected: bareMessageId, found: parsedMessageId }
      };
    }
    if (expectedTo && !mailboxHeaderContains(parsed.to, expectedTo)) {
      return {
        businessIdentity: businessKey, providerReferenceId: matches[0].id, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search+get',
        reconciliationSource: 'gmail-api', lifecycle: 'AMBIGUOUS',
        detail: { reason: 'recipient-mismatch', expected: expectedTo, found: parsed.to }
      };
    }
    if (expectedSubject && parsed.subject !== expectedSubject) {
      return {
        businessIdentity: businessKey, providerReferenceId: matches[0].id, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search+get',
        reconciliationSource: 'gmail-api', lifecycle: 'AMBIGUOUS',
        detail: { reason: 'subject-mismatch', expected: expectedSubject, found: parsed.subject }
      };
    }
    if (expectedSubjectSha256 && sha256Hex(String(parsed.subject || '')) !== expectedSubjectSha256) {
      return {
        businessIdentity: businessKey, providerReferenceId: matches[0].id, observedAt,
        evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search+get',
        reconciliationSource: 'gmail-api', lifecycle: 'AMBIGUOUS',
        detail: { reason: 'subject-digest-mismatch', expectedSubjectSha256, foundSubjectSha256: sha256Hex(String(parsed.subject || '')) }
      };
    }

    return {
      businessIdentity: businessKey, providerReferenceId: matches[0].id, observedAt,
      evidenceType: 'RECONCILIATION_LOOKUP', acquisitionMethod: 'gmail-effect-adapter:rfc822msgid-search+get',
      reconciliationSource: 'gmail-api', lifecycle: 'RECONCILED_ACCEPTED',
      detail: { messageId, gmailMessageId: matches[0].id, gmailThreadId: full.data.threadId }
    };
  }

  classifyOutcome(providerEvidence) {
    const lifecycle = providerEvidence?.lifecycle;
    if (lifecycle === 'ACCEPTED') return ADAPTER_OUTCOMES.ACCEPTED;
    if (lifecycle === 'REJECTED') return ADAPTER_OUTCOMES.REJECTED;
    if (lifecycle === 'RECONCILED_ACCEPTED') return ADAPTER_OUTCOMES.RECONCILED_ACCEPTED;
    if (lifecycle === 'RECONCILED_REJECTED') return ADAPTER_OUTCOMES.RECONCILED_REJECTED;
    if (lifecycle === 'NOT_FOUND') return ADAPTER_OUTCOMES.NOT_FOUND;
    if (lifecycle === 'AMBIGUOUS') return ADAPTER_OUTCOMES.AMBIGUOUS;
    return ADAPTER_OUTCOMES.UNCERTAIN;
  }
}
