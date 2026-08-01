// Canon/V3 integration -- premerge audit P0-006 (live activation).
//
// V3's runRevenueCycle gated live sending on a single `liveOutboundEnabled` boolean. A single
// config mistake (or a copy-pasted `.env` from a test environment) could activate live sending for
// every candidate in the queue at once, with no record of what the owner actually authorized.
//
// This module requires BOTH of two independent things before any batch may reach dispatch:
//   1. the global master gate, ACQUISITION_WORKERS_ACTIVE (cfg.acquisition.workersActive) -- the
//      one switch an operator can flip to stop all Canon acquisition activity everywhere; and
//   2. an existing, unexpired, exactly-matching campaignActivationApprovals row naming the precise
//      experiment, an idempotent hash of the exact recipient set, the exact sender set, a hard
//      maximum count, and the policy version it was approved against.
// Neither is sufficient alone (acceptance test: global gate alone, batch approval alone, or an
// expired approval must each fail closed -- see tests/campaign-activation.test.mjs).
import crypto from 'node:crypto';
import { id, now } from './utils.mjs';

export class CampaignActivationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'CampaignActivationError';
    this.code = code;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

/** Deterministic hash of an exact, ordered recipient-email set -- used both when an owner records
 * an approval and when a candidate batch is checked against it, so "the exact recipients approved"
 * is a content hash comparison, never a count or a boolean. */
export function computeRecipientsHash(recipientEmails = []) {
  const normalized = [...new Set(recipientEmails.map(value => String(value || '').trim().toLowerCase()).filter(Boolean))].sort();
  return sha256(normalized.join('\n'));
}

export function computeBatchHash({ experimentId = '', recipientsHash = '', senderSet = [], maxCount = 0, policyVersion = '' } = {}) {
  const senders = [...new Set(senderSet.map(String))].sort();
  return sha256(JSON.stringify({ experimentId, recipientsHash, senders, maxCount: Number(maxCount || 0), policyVersion }));
}

/** Builds (but does not persist) one campaign_activation_approvals row. Callers persist it via
 * store.add('campaignActivationApprovals', approval) inside their own transaction -- this module
 * has no store dependency of its own, matching commercial-intelligence-import.mjs's separation of
 * pure validation/construction from persistence. */
export function buildCampaignActivationApproval({
  experimentId, recipientEmails = [], senderSet = [], maxCount, policyVersion, approvedBy, expiresAt, now: at = new Date()
} = {}) {
  const fail = (code, message) => { throw new CampaignActivationError(code, message); };
  if (!String(experimentId || '').trim()) fail('experiment-id-required', 'Campaign activation approval requires experimentId');
  if (!Array.isArray(recipientEmails) || recipientEmails.length === 0) fail('recipients-required', 'Campaign activation approval requires a non-empty recipientEmails list');
  if (!Array.isArray(senderSet) || senderSet.length === 0) fail('sender-set-required', 'Campaign activation approval requires a non-empty senderSet');
  const count = Number(maxCount);
  if (!Number.isInteger(count) || count <= 0) fail('max-count-invalid', 'Campaign activation approval maxCount must be a positive integer');
  if (count > recipientEmails.length) fail('max-count-exceeds-recipients', `maxCount (${count}) exceeds the approved recipient list size (${recipientEmails.length})`);
  if (!String(policyVersion || '').trim()) fail('policy-version-required', 'Campaign activation approval requires policyVersion');
  if (!String(approvedBy || '').trim()) fail('approved-by-required', 'Campaign activation approval requires approvedBy (the owner who authorized it)');
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  if (!expiryDate || Number.isNaN(expiryDate.getTime())) fail('expiry-required', 'Campaign activation approval requires a valid expiresAt');
  if (expiryDate <= at) fail('expiry-not-future', `Campaign activation approval expiresAt (${expiryDate.toISOString()}) must be in the future`);

  const recipientsHash = computeRecipientsHash(recipientEmails);
  const batchHash = computeBatchHash({ experimentId, recipientsHash, senderSet, maxCount: count, policyVersion });

  return {
    id: id('activation'),
    experimentId: String(experimentId).trim(),
    batchHash,
    recipientsHash,
    senderSet: [...new Set(senderSet.map(String))].sort(),
    maxCount: count,
    policyVersion: String(policyVersion).trim(),
    status: 'active',
    approvedBy: String(approvedBy).trim(),
    approvedAt: now(),
    expiresAt: expiryDate.toISOString(),
    data: { recipientCount: recipientEmails.length }
  };
}

/** The single canonical check every Canon send-planning path must pass through before a batch may
 * proceed toward dispatch. Returns { ok, reason } like the repo's other eligibility functions
 * (send-safety.mjs#contactEligibility, revenue-os.mjs#evaluateOpportunityPolicy). */
export async function assertCampaignActivation({ store, cfg = {}, experimentId, recipientEmails = [], senderSet = [], requestedCount, policyVersion, at = new Date() } = {}) {
  if (cfg.acquisition?.workersActive !== true) {
    return { ok: false, reason: 'acquisition-workers-not-active' };
  }
  const recipientsHash = computeRecipientsHash(recipientEmails);
  const count = Number(requestedCount ?? recipientEmails.length);
  const batchHash = computeBatchHash({ experimentId, recipientsHash, senderSet, maxCount: count, policyVersion });

  const approval = await store.findOne('campaignActivationApprovals', { experimentId, batchHash });
  if (!approval) return { ok: false, reason: 'no-matching-campaign-activation-approval' };
  if (approval.status !== 'active') return { ok: false, reason: 'campaign-activation-approval-not-active' };
  if (new Date(approval.expiresAt) <= at) return { ok: false, reason: 'campaign-activation-approval-expired' };
  if (approval.recipientsHash !== recipientsHash) return { ok: false, reason: 'campaign-activation-recipients-mismatch' };
  if (count > Number(approval.maxCount || 0)) return { ok: false, reason: 'campaign-activation-max-count-exceeded' };
  const approvedSenders = new Set(approval.senderSet || []);
  const requestedSenders = new Set(senderSet.map(String));
  const sendersMatch = requestedSenders.size > 0 && [...requestedSenders].every(sender => approvedSenders.has(sender));
  if (!sendersMatch) return { ok: false, reason: 'campaign-activation-sender-set-mismatch' };
  if (approval.policyVersion !== policyVersion) return { ok: false, reason: 'campaign-activation-policy-version-mismatch' };

  return { ok: true, approval };
}
