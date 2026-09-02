import crypto from 'node:crypto';

/**
 * The header/payload safety rules that Gmail and Postal both need, in one
 * copy.
 *
 * Two adapters had grown independent versions of the same five checks. They
 * had already drifted: Gmail refused a subject containing raw CR/LF and
 * Postal did not check the body's length the same way; Gmail's definite-
 * rejection HTTP set excluded 409 and Postal's included it, which is the
 * exact defect §2.5 item 1 of the Ragnarok packet names. A rule written down
 * twice is a rule with two different meanings the moment one copy is edited,
 * and header-injection refusal is not a rule this system can afford to hold
 * in two places.
 *
 * Every validator takes a `makeError` factory rather than throwing its own
 * error class. That is not indirection for its own sake: the Gmail adapter's
 * existing suites assert `error instanceof GmailEffectAdapterError` alongside
 * the error code, so a shared module that threw its own class would turn a
 * refactor into a behaviour change. The factory keeps each adapter's error
 * identity, code and message byte-identical to what it produced before.
 */

export const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 20000;

/**
 * HTTP statuses that prove the provider processed the request and refused it.
 *
 * 429 and 5xx are excluded because they mean "the provider could not confirm
 * anything", not "the provider rejected the message". 409 is excluded for the
 * same reason and is the one that had to be removed from Postal's copy: a
 * conflict says the provider found a collision, not that it discarded the
 * message. Treating it as a definite rejection would let a possibly-accepted
 * send be finalized as REJECTED, which is a terminal claim about the outside
 * world made from an ambiguous signal.
 */
export const DEFINITE_REJECTION_HTTP_STATUSES = Object.freeze(new Set([400, 401, 403, 404, 422]));

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function requireFactory(makeError) {
  if (typeof makeError !== 'function') {
    throw new TypeError('email-effect-primitives: makeError factory is required so each adapter keeps its own error identity');
  }
  return makeError;
}

/** Recipient address. Returns the trimmed address; throws through `makeError` otherwise. */
export function validateRecipientAddress(to, makeError) {
  const error = requireFactory(makeError);
  if (!to || typeof to !== 'string' || !to.trim()) throw error('recipient is required', 'INVALID_RECIPIENT');
  if (!EMAIL_RE.test(to.trim())) throw error(`recipient is not a valid email address: ${to}`, 'INVALID_RECIPIENT');
  return to.trim();
}

/**
 * From address. `allowDisplayName` decides whether `Name <mailbox@host>` is
 * acceptable: Gmail accepts it, Postal's send API takes a bare mailbox, and
 * neither may accept CR/LF at any point because that is header injection into
 * the envelope sender.
 */
export function validateFromAddress(value, makeError, { allowDisplayName = true } = {}) {
  const error = requireFactory(makeError);
  const text = String(value || '').trim();
  if (!text || /[\r\n]/.test(text)) {
    throw error('fromAddress is required and must not contain CR/LF', 'INVALID_FROM');
  }
  if (EMAIL_RE.test(text)) return text;
  if (!allowDisplayName) {
    throw error('fromAddress must be a bare email address', 'INVALID_FROM');
  }
  const match = text.match(/^([^<>\r\n]{1,160})\s*<([^<>\s@]+@[^<>\s@]+)>$/);
  if (!match || /[,;:"\\]/.test(match[1]) || !EMAIL_RE.test(match[2])) {
    throw error('fromAddress must be an email or safe display-name email', 'INVALID_FROM');
  }
  return text;
}

/** Subject and body. Bounded length, present, and no raw CR/LF in the subject. */
export function validateSubjectAndBody(subject, body, makeError) {
  const error = requireFactory(makeError);
  if (!subject || typeof subject !== 'string' || !subject.trim()) throw error('subject is required', 'INVALID_SUBJECT');
  if (subject.length > MAX_SUBJECT_LENGTH) throw error(`subject exceeds ${MAX_SUBJECT_LENGTH} characters`, 'INVALID_SUBJECT');
  if (/[\r\n]/.test(subject)) throw error('subject must not contain raw CR/LF (header injection)', 'INVALID_SUBJECT');
  if (typeof body !== 'string' || !body.trim()) throw error('body is required', 'INVALID_BODY');
  if (body.length > MAX_BODY_LENGTH) throw error(`body exceeds ${MAX_BODY_LENGTH} characters`, 'INVALID_BODY');
}

/**
 * One-click unsubscribe URL. HTTPS only, no embedded credentials, no
 * characters that could close the header. Absent is legal and returns
 * undefined -- an adapter that requires one enforces that itself.
 */
export function validateListUnsubscribeUrl(value, makeError) {
  const error = requireFactory(makeError);
  if (value == null || value === '') return undefined;
  const text = String(value);
  if (text.length > 2048 || /[\r\n<>]/.test(text)) {
    throw error('listUnsubscribe contains unsafe header characters', 'INVALID_HEADER', { field: 'listUnsubscribe' });
  }
  let parsed;
  try { parsed = new URL(text); }
  catch { throw error('listUnsubscribe must be a valid HTTPS URL', 'INVALID_HEADER', { field: 'listUnsubscribe' }); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw error('listUnsubscribe must be an HTTPS URL without embedded credentials', 'INVALID_HEADER', { field: 'listUnsubscribe' });
  }
  return parsed.href;
}

/**
 * `<v9-{sha256(executionId)}@{domain}>`: deterministic, opaque and free of
 * any reversible internal identifier, so the header leaks nothing even to the
 * recipient or an intermediate relay. The domain must be supplied explicitly
 * -- a guessed or defaulted domain would put a real, possibly unowned host in
 * an outbound header.
 */
export function deterministicV9MessageId(executionId, messageIdDomain, makeError) {
  const error = requireFactory(makeError);
  if (!executionId) throw error('executionId is required to generate a Message-ID', 'INVALID_INPUT');
  if (!messageIdDomain || typeof messageIdDomain !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(messageIdDomain)) {
    throw error('a valid messageIdDomain must be explicitly supplied (no guessed/default domain)', 'INVALID_INPUT');
  }
  return `<v9-${sha256Hex(executionId)}@${messageIdDomain}>`;
}

/**
 * Recover the execution digest from a Message-ID this system generated.
 *
 * This is what lets reconciliation work from `providerEffectIdentity` alone.
 * The recovery worker calls `adapter.reconcile({ businessKey,
 * providerEffectIdentity, expectedTo })` with no `executionId` at all, so an
 * adapter that can only derive its provider-side lookup key from an
 * `executionId` throws inside a recovery batch and takes every other
 * execution in that batch down with it.
 *
 * Returns null for anything that is not one of our own Message-IDs. Null is a
 * refusal, never a wildcard.
 */
export function executionDigestFromMessageId(messageId) {
  const match = String(messageId ?? '').trim().match(/^<v9-([a-f0-9]{64})@[^<>\s@]+>$/);
  return match ? match[1] : null;
}
