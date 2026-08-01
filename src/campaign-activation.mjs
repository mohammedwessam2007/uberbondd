// Canon/V3 integration -- premerge audit P0-006 (live activation), repaired per PR #7 repair
// finding C-P0-003.
//
// The original version of this module computed one content hash over the FULL approved recipient
// set and required an exact match on every eligibility check -- but send planning evaluates
// candidates one recipient at a time, so a hash over N recipients could never match a hash over
// the 1 recipient being checked. That was a real, exploitable-by-being-broken bug: every batch
// with more than one member was structurally unable to ever pass (confirmed by an independent
// review after this module's first version shipped with only single-member test coverage).
//
// This version materializes the frozen cohort as individually-claimable member rows
// (`campaignCohortMembers`, migration 009) -- exactly N rows are created once, at approval time,
// and each is claimed (status 'pending' -> 'reserved' -> 'touched') at most once via
// `store.mjs#claimCohortMember`'s atomic conditional UPDATE. "One 100-company approval authorizes
// only those 100 members" is now a structural fact (exactly 100 rows exist) rather than a hash
// comparison that could never succeed for more than one member.
import crypto from 'node:crypto';
import { id } from './utils.mjs';
import { normalizeDomain } from './utils.mjs';

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

/** Deterministic hash of the frozen cohort's exact membership (organization domains) -- kept as
 * tamper-evidence on the approval row itself; membership is verified by the real member rows, not
 * by re-deriving and comparing this hash at eligibility-check time. */
export function computeCohortHash(members = []) {
  const domains = [...new Set(members.map(m => normalizeDomain(m.organizationDomain || m.domain || '')))].sort();
  return sha256(domains.join('\n'));
}

/** Builds (but does not persist) one approval row plus its exactly-N member rows. Callers persist
 * both via `persistCampaignActivationApproval` inside one transaction. */
export function buildCampaignActivationApproval({
  experimentId, members = [], senderSet = [], maxCount, policyVersion, approvedBy, expiresAt, now: at = new Date()
} = {}) {
  const fail = (code, message) => { throw new CampaignActivationError(code, message); };
  if (!String(experimentId || '').trim()) fail('experiment-id-required', 'Campaign activation approval requires experimentId');
  if (!Array.isArray(members) || members.length === 0) fail('members-required', 'Campaign activation approval requires a non-empty members list');

  const normalizedMembers = members.map(member => ({
    organizationDomain: normalizeDomain(member.organizationDomain || member.domain || ''),
    recipientEmail: String(member.recipientEmail || member.email || '').trim().toLowerCase()
  }));
  if (normalizedMembers.some(member => !member.organizationDomain || !member.recipientEmail)) {
    fail('member-invalid', 'Every cohort member requires organizationDomain and recipientEmail');
  }
  const uniqueDomains = new Set(normalizedMembers.map(m => m.organizationDomain));
  if (uniqueDomains.size !== normalizedMembers.length) fail('member-domain-duplicate', 'Cohort members must be unique organizations -- duplicate organizationDomain found');
  const uniqueRecipients = new Set(normalizedMembers.map(m => m.recipientEmail));
  if (uniqueRecipients.size !== normalizedMembers.length) fail('member-recipient-duplicate', 'Cohort members must have unique recipient emails');

  if (!Array.isArray(senderSet) || senderSet.length === 0) fail('sender-set-required', 'Campaign activation approval requires a non-empty senderSet');
  const declaredMaxCount = Number(maxCount ?? normalizedMembers.length);
  if (!Number.isInteger(declaredMaxCount) || declaredMaxCount <= 0) fail('max-count-invalid', 'Campaign activation approval maxCount must be a positive integer');
  if (declaredMaxCount !== normalizedMembers.length) {
    fail('max-count-mismatch', `maxCount (${declaredMaxCount}) must equal the exact number of frozen cohort members (${normalizedMembers.length})`);
  }
  if (!String(policyVersion || '').trim()) fail('policy-version-required', 'Campaign activation approval requires policyVersion');
  if (!String(approvedBy || '').trim()) fail('approved-by-required', 'Campaign activation approval requires approvedBy (the owner who authorized it)');
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  if (!expiryDate || Number.isNaN(expiryDate.getTime())) fail('expiry-required', 'Campaign activation approval requires a valid expiresAt');
  if (expiryDate <= at) fail('expiry-not-future', `Campaign activation approval expiresAt (${expiryDate.toISOString()}) must be in the future`);

  const cohortHash = computeCohortHash(normalizedMembers);
  const approvalId = id('activation');
  const approval = {
    id: approvalId,
    experimentId: String(experimentId).trim(),
    batchHash: cohortHash, // kept as the immutable identity of this exact approval + cohort
    recipientsHash: cohortHash, // tamper-evidence over the frozen membership; not used for per-recipient matching (see module doc comment)
    senderSet: [...new Set(senderSet.map(String))].sort(),
    maxCount: declaredMaxCount,
    policyVersion: String(policyVersion).trim(),
    status: 'active',
    approvedBy: String(approvedBy).trim(),
    approvedAt: at.toISOString(),
    expiresAt: expiryDate.toISOString(),
    data: { memberCount: normalizedMembers.length }
  };
  const memberRows = normalizedMembers.map(member => ({
    id: id('cohort_member'), approvalId, organizationDomain: member.organizationDomain,
    recipientEmail: member.recipientEmail, status: 'pending', firstTouchReservationId: null, data: {}
  }));

  return { approval, members: memberRows };
}

/** Persists one approval and its exactly-N member rows atomically -- either the whole cohort is
 * recorded or none of it is. */
export async function persistCampaignActivationApproval(store, input) {
  const { approval, members } = buildCampaignActivationApproval(input);
  return store.transaction(async tx => {
    const savedApproval = await tx.add('campaignActivationApprovals', approval);
    const savedMembers = [];
    for (const member of members) savedMembers.push(await tx.add('campaignCohortMembers', member));
    return { approval: savedApproval, members: savedMembers };
  });
}

/** Finds every active, unexpired, policy/sender-matching approval for `experimentId` (small set --
 * an experiment typically has one or a few live approvals at once). */
async function activeApprovalsFor(store, { experimentId, senderSet, policyVersion, at }) {
  const approvals = await store.list('campaignActivationApprovals', { filters: { experimentId } });
  const requestedSenders = new Set(senderSet.map(String));
  return approvals.filter(approval =>
    approval.status === 'active' &&
    new Date(approval.expiresAt) > at &&
    approval.policyVersion === policyVersion &&
    [...requestedSenders].every(sender => new Set(approval.senderSet || []).has(sender))
  );
}

/**
 * The single canonical check every Canon send-planning path must pass through before a candidate
 * may proceed toward reservation. Returns `{ ok, reason }` like the repo's other eligibility
 * functions. Unlike the pre-repair version, this does NOT claim a seat -- claiming is a separate,
 * explicit, transactional step (`claimCohortSeat`) so a caller can check eligibility without
 * consuming a cohort slot, and so send-planning can claim-then-verify inside one place.
 */
export async function assertCampaignActivation({
  store, cfg = {}, experimentId, organizationDomain, recipientEmail, senderSet = [], policyVersion, at = new Date(),
  expectedMemberStatus = 'pending'
} = {}) {
  if (cfg.acquisition?.workersActive !== true) {
    return { ok: false, reason: 'acquisition-workers-not-active' };
  }
  const domain = normalizeDomain(organizationDomain);
  const approvals = await activeApprovalsFor(store, { experimentId, senderSet, policyVersion, at });
  if (!approvals.length) return { ok: false, reason: 'no-active-campaign-activation-approval' };

  const candidateMembers = await store.list('campaignCohortMembers', { filters: { organizationDomain: domain } });
  const approvalIds = new Set(approvals.map(a => a.id));
  const member = candidateMembers.find(row => approvalIds.has(row.approvalId));
  if (!member) return { ok: false, reason: 'not-a-cohort-member' };
  if (String(recipientEmail || '').trim().toLowerCase() !== member.recipientEmail) return { ok: false, reason: 'cohort-member-recipient-mismatch' };
  // `expectedMemberStatus` distinguishes two callers: send-planning claims a fresh seat (must be
  // 'pending'); the pre-dispatch recheck (PR #7 repair, C-P0-004) re-verifies an ALREADY-claimed
  // seat is still intact -- still bound to this cycle's own hold ('reserved'), not released,
  // cancelled, or (impossibly) re-claimed by someone else -- so it expects 'reserved' instead.
  if (member.status !== expectedMemberStatus) return { ok: false, reason: `cohort-member-not-${expectedMemberStatus}-actual-${member.status}` };

  const approval = approvals.find(a => a.id === member.approvalId);
  return { ok: true, approval, member };
}

/**
 * Atomically claims this member's cohort seat (pending -> reserved) via the store's conditional
 * UPDATE -- the ONE place a seat is consumed. Returns `{ ok, reason, approval, member }`. Safe to
 * call even when `assertCampaignActivation` was not called first (it re-derives the active
 * approval itself), and safe under concurrency: `store.claimCohortMember`'s atomic
 * pending-\>reserved transition means at most one caller ever succeeds for a given member.
 */
export async function claimCohortSeat(store, { cfg = {}, experimentId, organizationDomain, recipientEmail, senderSet = [], policyVersion, at = new Date() } = {}) {
  const check = await assertCampaignActivation({ store, cfg, experimentId, organizationDomain, recipientEmail, senderSet, policyVersion, at });
  if (!check.ok) return check;
  const claim = await store.claimCohortMember(check.approval.id, organizationDomain, 'reserved');
  if (!claim.ok) return claim;
  return { ok: true, approval: check.approval, member: claim.member };
}

/** Releases a claimed-but-not-completed seat back to 'pending' (e.g. the candidate turned out to
 * be ineligible for an unrelated reason after the seat was claimed) so it can be retried on a
 * later cycle run rather than permanently burning one of the cohort's N slots. */
export async function releaseCohortSeat(store, approvalId, organizationDomain) {
  const members = await store.list('campaignCohortMembers', { filters: { approvalId } });
  const member = members.find(row => row.organizationDomain === normalizeDomain(organizationDomain));
  if (!member || member.status !== 'reserved') return null;
  return store.patch('campaignCohortMembers', member.id, { status: 'pending' });
}

/** Marks a claimed seat as durably touched (a real outbound reservation now exists for it) --
 * called once send planning has successfully created the outboundReservations row. */
export async function markCohortSeatTouched(store, approvalId, organizationDomain, reservationId) {
  const members = await store.list('campaignCohortMembers', { filters: { approvalId } });
  const member = members.find(row => row.organizationDomain === normalizeDomain(organizationDomain));
  if (!member) return null;
  return store.patch('campaignCohortMembers', member.id, { status: 'touched', firstTouchReservationId: reservationId });
}
