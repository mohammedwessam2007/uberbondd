import crypto from 'node:crypto';

// Pre-send authorization for SMTP fleet dispatch. Fail closed: every requirement
// must pass independently for one exact message from one exact sender slot.
// Any missing or malformed field yields NO_SEND with a fixed reason code.
//
// The decision is evidence about a single send attempt. It is not proof of
// delivery, sender reputation, legal sufficiency, consent validity beyond the
// caller-supplied verifier, or provider acceptance.

export const OUTBOUND_SEND_AUTHORIZATION_VERSION = 'uberbond.outbound-send-authorization.v1';
export const OUTBOUND_EMERGENCY_STOP_ENV = 'OUTBOUND_EMERGENCY_STOP';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, n = 1000) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const address = v => text(v, 320).toLowerCase();
const emailOk = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const headerSafe = v => typeof v === 'string' && !/[\r\n\0]/.test(v);
const domainOf = email => {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).toLowerCase();
};
const isRate = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isCount = v => Number.isSafeInteger(v) && v >= 0;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

// The one comparison key for recipient membership in the suppression and do-not-contact lists. It removes display text,
// every stray or paired angle bracket, and trailing dots or separators; then it drops the plus tag and folds dots in the
// local part, mapping googlemail.com to gmail.com, because Gmail treats those spellings as one mailbox. Dots are
// significant elsewhere. A value with no usable address comes back cleaned and lower-cased, so an unparseable entry
// never matches a real one.
const DOT_FOLDED_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
export function canonicalRecipientKey(value) {
  let raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const angled = raw.match(/<([^<>]*)>\s*$/);
  if (angled) raw = angled[1];
  raw = raw.replace(/[<>]/g, '').trim().replace(/[\s.;,]+$/, '');
  const at = raw.lastIndexOf('@');
  if (at < 0) return raw;
  if (at === 0 || at === raw.length - 1) return raw;
  let local = raw.slice(0, at).split('+')[0];
  let domain = raw.slice(at + 1);
  if (DOT_FOLDED_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return local && domain ? `${local}@${domain}` : raw;
}

// Stable JSON: keys sorted at every depth, undefined members dropped.
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}
const digestOf = value => sha256(JSON.stringify(canonicalize(value)));

// Digest over every field the transport receives, minus the authorization block itself. It previously covered only
// from, to, subject and body, so replyTo, fromName or listUnsubscribe could change after approval. An approval now
// binds the exact bytes and headers that will leave.
export function outboundMessageDigest(message = {}) {
  const m = isObject(message) ? message : {};
  const { authorization: _authorization, ...outbound } = m;
  return digestOf(outbound);
}

// Fail closed. Any emergencyStop value except false engages the stop, and so does any OUTBOUND_EMERGENCY_STOP value
// except the explicit off values 0 and false. An unset variable is off; a malformed environment is engaged.
const EMERGENCY_STOP_OFF_VALUES = new Set(['0', 'false']);
function emergencyStopEngaged(input, reasons) {
  if (input.emergencyStop !== undefined && input.emergencyStop !== false) return true;
  const env = input.environment === undefined ? process.env : input.environment;
  if (!isObject(env)) {
    reasons.push('environment-malformed');
    return true;
  }
  const raw = env[OUTBOUND_EMERGENCY_STOP_ENV];
  if (raw === undefined) return false;
  return !(typeof raw === 'string' && EMERGENCY_STOP_OFF_VALUES.has(raw.trim().toLowerCase()));
}

function listOk(list, idKey) {
  return isObject(list)
    && Boolean(text(list[idKey], 200))
    && Array.isArray(list.entries)
    && list.entries.every(entry => typeof entry === 'string');
}

function evaluateOutboundSend(input, reasons, facts) {
  if (!isObject(input)) {
    reasons.push('input-not-object');
    return;
  }

  // Campaign and message: the approval must be for these exact bytes.
  const campaignId = text(input.campaignId, 200);
  if (!campaignId) reasons.push('campaign-id-missing');
  facts.campaign = digestOf({ campaignId });

  const m = isObject(input.message) ? input.message : {};
  const strings = ['from', 'to', 'subject', 'body'].every(key => typeof m[key] === 'string');
  const wellFormed = strings
    && emailOk(m.from) && emailOk(m.to)
    && headerSafe(m.from) && headerSafe(m.to) && headerSafe(m.subject)
    && m.subject.trim().length > 0 && m.body.trim().length > 0;
  if (!wellFormed) reasons.push('message-malformed');
  if (strings && m.text !== undefined && m.text !== m.body) reasons.push('message-text-body-mismatch');
  facts.message = outboundMessageDigest(m);
  const to = wellFormed ? address(m.to) : '';
  // Membership is checked on the canonical key even when the address is malformed, so a malformed alias of a listed
  // recipient is refused with the suppression reason as well as message-malformed.
  const recipientKey = typeof m.to === 'string' ? canonicalRecipientKey(m.to) : '';

  // Sender identity: the authorization must name the expected account, slot and email.
  const identity = x => isObject(x)
    ? { accountId: text(x.accountId, 200), slot: text(x.slot, 200), email: address(x.email) }
    : null;
  const idOk = i => Boolean(i) && Boolean(i.accountId) && Boolean(i.slot) && emailOk(i.email);
  const expected = identity(input.expectedSender);
  const sender = identity(input.sender);
  facts.expectedSender = digestOf(expected);
  facts.sender = digestOf(sender);
  if (!idOk(expected) || !idOk(sender)) reasons.push('sender-identity-unverified');
  else if (expected.accountId !== sender.accountId || expected.slot !== sender.slot || expected.email !== sender.email) {
    reasons.push('sender-identity-mismatch');
  }
  if (wellFormed && idOk(sender) && address(m.from) !== sender.email) reasons.push('message-sender-mismatch');

  // Sender hold state and mailbox health.
  const s = isObject(input.sender) ? input.sender : null;
  if (s) {
    if (s.paused === true) reasons.push('sender-paused');
    else if (s.paused !== false) reasons.push('sender-state-unverified');
    if (!Array.isArray(s.holdReasons)) reasons.push('sender-state-unverified');
    else if (s.holdReasons.length > 0) reasons.push('sender-held');
    if (s.quarantined === true) reasons.push('mailbox-quarantined');
    else if (s.quarantined !== false) reasons.push('mailbox-health-unverified');

    const thresholds = isObject(input.thresholds) ? input.thresholds : {};
    const rateUnder = (rate, max, code) => {
      if (!isRate(rate) || !isRate(max)) reasons.push('mailbox-health-unverified');
      else if (!(rate < max)) reasons.push(code);
    };
    rateUnder(s.bounceRate, thresholds.maxBounceRate, 'bounce-rate-over-threshold');
    rateUnder(s.complaintRate, thresholds.maxComplaintRate, 'complaint-rate-over-threshold');
  }

  // Domain ownership receipt for the sender domain.
  const receipt = isObject(input.domainReceipt) ? input.domainReceipt : null;
  const senderDomain = sender ? domainOf(sender.email) : '';
  if (!receipt) reasons.push('domain-receipt-missing');
  else {
    if (!senderDomain || text(receipt.domain, 253).toLowerCase() !== senderDomain) reasons.push('domain-receipt-mismatch');
    if (receipt.configured !== true) reasons.push('domain-not-configured');
  }

  // Provider policy. The caller derives these flags from the account's own route.
  const provider = isObject(input.provider) ? input.provider : {};
  if (text(provider.name, 80) !== 'smtp-relay') reasons.push('provider-not-smtp-relay');
  if (provider.routeAuthorized !== true) reasons.push('provider-route-unauthorized');
  if (provider.termsCompatible !== true) reasons.push('provider-terms-incompatible');

  // Recipient eligibility: suppression, do-not-contact and evidence.
  if (!listOk(input.suppression, 'snapshotId')) reasons.push('suppression-snapshot-missing');
  else if (recipientKey && input.suppression.entries.some(entry => canonicalRecipientKey(entry) === recipientKey)) reasons.push('recipient-suppressed');
  if (!listOk(input.doNotContact, 'listId')) reasons.push('do-not-contact-list-missing');
  else if (recipientKey && input.doNotContact.entries.some(entry => canonicalRecipientKey(entry) === recipientKey)) reasons.push('recipient-do-not-contact');

  const recipient = isObject(input.recipient) ? input.recipient : {};
  facts.eligibilityEvidenceRef = digestOf(text(recipient.eligibilityEvidenceRef, 1500) || null);
  if (!text(recipient.eligibilityEvidenceRef, 1500)) reasons.push('recipient-eligibility-evidence-missing');

  // Geographic and legal requirement for the recipient jurisdiction.
  const jurisdiction = text(recipient.jurisdiction, 80).toLowerCase();
  const evidence = isObject(input.jurisdictionEvidence) ? input.jurisdictionEvidence : null;
  facts.jurisdictionEvidence = digestOf(evidence ? text(evidence.evidenceRef, 1500) || null : null);
  if (!evidence || !jurisdiction || !text(evidence.jurisdiction, 80)) reasons.push('jurisdiction-evidence-missing');
  else if (evidence.allowed !== true || text(evidence.jurisdiction, 80).toLowerCase() !== jurisdiction) {
    reasons.push('jurisdiction-not-allowed');
  }

  // Consent, checked by a caller-supplied synchronous verifier.
  const consent = isObject(input.consent) ? input.consent : null;
  const consentRef = text(consent?.receiptRef, 1500);
  facts.consentReceiptRef = digestOf(consentRef || null);
  if (!consentRef) reasons.push('consent-receipt-missing');
  if (typeof input.verifyConsent !== 'function') reasons.push('consent-verifier-missing');
  else if (consentRef) {
    try {
      const verdict = input.verifyConsent({ consentReceiptRef: consentRef, campaignId, recipient: to });
      if (verdict && typeof verdict.then === 'function') {
        if (typeof verdict.catch === 'function') verdict.catch(() => {});
        reasons.push('consent-verifier-async');
      } else if (!(verdict === true || (isObject(verdict) && verdict.accepted === true))) {
        reasons.push('consent-not-accepted');
      }
    } catch {
      reasons.push('consent-verifier-threw');
    }
  }

  // Campaign and message approval.
  const approval = isObject(input.campaignApproval) ? input.campaignApproval : null;
  facts.campaignApprovalRef = digestOf(approval ? text(approval.approvalRef, 200) || null : null);
  if (!approval || !text(approval.approvalRef, 200)) reasons.push('campaign-approval-missing');
  else if (!campaignId || text(approval.campaignId, 200) !== campaignId) reasons.push('campaign-approval-mismatch');

  const messageApproval = isObject(input.messageApproval) ? input.messageApproval : null;
  const approvedDigest = messageApproval && typeof messageApproval.approvedDigest === 'string'
    ? messageApproval.approvedDigest.trim() : '';
  if (!approvedDigest) reasons.push('message-approval-missing');
  else if (approvedDigest !== facts.message) reasons.push('message-digest-mismatch');

  // Rate cap and retry budget.
  const rateWindow = isObject(input.rateWindow) ? input.rateWindow : null;
  if (!rateWindow || !Number.isSafeInteger(rateWindow.cap) || rateWindow.cap < 1 || !isCount(rateWindow.sentCount)) {
    reasons.push('rate-cap-missing');
  } else if (!(rateWindow.sentCount < rateWindow.cap)) reasons.push('rate-cap-exceeded');

  const retry = isObject(input.retry) ? input.retry : null;
  if (!retry || !isCount(retry.budget) || !isCount(retry.attempts)) reasons.push('retry-budget-missing');
  else if (!(retry.attempts < retry.budget)) reasons.push('retry-budget-exhausted');

  // Global emergency stop. It wins over any amount of other evidence.
  if (emergencyStopEngaged(input, reasons)) reasons.push('emergency-stop-active');
}

export function decideOutboundSend(input) {
  const reasons = [];
  const facts = {};
  try {
    evaluateOutboundSend(input, reasons, facts);
  } catch {
    reasons.push('authorization-evaluation-threw');
  }
  const reasonCodes = [...new Set(reasons)];
  const decision = reasonCodes.length === 0 ? 'ALLOW' : 'NO_SEND';
  return {
    version: OUTBOUND_SEND_AUTHORIZATION_VERSION,
    decision,
    reasonCodes,
    decisionDigest: digestOf({
      version: OUTBOUND_SEND_AUTHORIZATION_VERSION,
      decision,
      reasonCodes: [...reasonCodes].sort(),
      inputDigests: facts
    }),
    truthBoundary: 'Pre-send authorization decision for one exact message and sender slot. It does not prove delivery, reputation, legal sufficiency or provider acceptance.'
  };
}

// Live-route gate. Every route that can open a credential, build a transport or reach a provider calls one of the
// helpers below before that boundary. A missing package and an insufficient package both return REFUSED with explicit
// reason codes and cross no effect boundary. Nothing here creates an approval: a route can only forward one that a
// caller supplied, and the decision still binds the exact final bytes.
export const OUTBOUND_AUTHORIZATION_PACKAGE_MISSING = 'OUTBOUND_AUTHORIZATION_PACKAGE_MISSING';

export function refuseOutboundRoute(reasonCodes = [], decisionDigest = null) {
  return {
    classification: 'REFUSED',
    providerCalls: 0,
    providerCallAttempted: false,
    effectBoundaryCrossed: false,
    reasonCodes: [...new Set(reasonCodes)],
    decisionDigest
  };
}

// The decision input for one outbound message. It mirrors the builder used by dispatchSmtpFleetAccount: only the fields
// named in message.authorization are read, the provider flags are true only when the caller and the account's own route
// both say so, and the whole outbound message minus its authorization block is bound by digest.
export function buildOutboundSendInput({ account = {}, message = {}, consentVerifier } = {}) {
  const auth = isObject(message?.authorization) ? message.authorization : {};
  const route = isObject(account?.smtpRoute) ? account.smtpRoute : {};
  const input = {};
  for (const key of ['campaignId', 'sender', 'thresholds', 'domainReceipt', 'recipient', 'suppression', 'doNotContact', 'jurisdictionEvidence', 'consent', 'campaignApproval', 'messageApproval', 'rateWindow', 'retry', 'emergencyStop']) {
    input[key] = auth[key];
  }
  const { authorization: _authorization, ...outbound } = isObject(message) ? message : {};
  input.message = { ...outbound, from: outbound.from || account?.email };
  input.expectedSender = { accountId: account?.id, slot: account?.slot, email: account?.email };
  input.provider = {
    name: auth.provider?.name === account?.provider ? account?.provider : '',
    routeAuthorized: route.authorized === true && auth.provider?.routeAuthorized === true,
    termsCompatible: route.termsCompatible === true && auth.provider?.termsCompatible === true
  };
  input.verifyConsent = consentVerifier;
  return input;
}

// Pre-effect gate for one exact outbound message from one account. Returns null only when decideOutboundSend allows it.
// routeProvider names the provider branch the caller will actually execute. The package model admits only smtp-relay, so a
// Gmail or Postal branch refuses even when the package is otherwise complete. Binding the branch stops an SMTP package
// from authorizing a different provider call.
export function gateOutboundRoute({ account, message, consentVerifier, routeProvider = 'smtp-relay' } = {}) {
  try {
    if (!isObject(message?.authorization)) return refuseOutboundRoute([OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
    if (String(routeProvider || '').trim().toLowerCase() !== 'smtp-relay') return refuseOutboundRoute(['provider-not-smtp-relay']);
    const decision = decideOutboundSend(buildOutboundSendInput({ account, message, consentVerifier }));
    return decision.decision === 'ALLOW' ? null : refuseOutboundRoute(decision.reasonCodes, decision.decisionDigest);
  } catch {
    return refuseOutboundRoute(['authorization-input-threw']);
  }
}

// Presence check for a route that cannot yet name its account or message. It reads no field of the package.
export function outboundAuthorizationPackageRefusal(authorization) {
  return isObject(authorization) ? null : refuseOutboundRoute([OUTBOUND_AUTHORIZATION_PACKAGE_MISSING]);
}

// Asks a caller-injected supplier for the package that binds one exact message. A supplier that is absent, throws or
// returns nothing yields null, which the gate refuses. A missing package is never treated as permission.
export async function requestOutboundPackage(supplier, context) {
  if (typeof supplier !== 'function') return null;
  try {
    return (await supplier(context)) || null;
  } catch {
    return null;
  }
}
