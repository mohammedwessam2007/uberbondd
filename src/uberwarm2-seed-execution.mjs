import crypto from 'node:crypto';
import { compilePlacementReport, normalizePlacementObservation } from './uberplacement.mjs';

export const UBERWARM2_SEED_EXECUTION_VERSION = 'uberbond.uberwarm2.seed-execution.v1';
const lower = (x, n = 320) => String(x ?? '').trim().toLowerCase().slice(0, n);
const clean = (x, n = 500) => String(x ?? '').trim().slice(0, n);
const emailOk = x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x || '').trim());
const hash = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const date = x => { const n = Date.parse(x); return Number.isFinite(n) ? n : null; };
const unique = xs => [...new Set(xs)];
const fail = (...reasonCodes) => Object.freeze({ ok: false, status: 'UBERWARM2_SEED_REFUSED', reasonCodes: unique(reasonCodes.flat()), providerCalls: 0, messagesSent: 0, externalEffectAuthority: 'NONE' });

// This is NOT a network of synthetic positive-engagement bots. The recipient must
// be a willing owner/operator-controlled test inbox with current evidence of permission.
function allowedSeed(seed, now) {
  if (!emailOk(seed?.email) || seed.ownerControlled !== true || seed.receiveReady !== true) return false;
  if (seed.authorizedScope !== 'UBERWARM2_PLACEMENT_TEST') return false;
  if (!clean(seed.permissionEvidenceRef, 1000) || !clean(seed.ownerEvidenceRef, 1000)) return false;
  if (!clean(seed.provider, 80) || lower(seed.provider, 80) === 'unknown') return false;
  return date(seed.permissionExpiresAt) != null && date(seed.permissionExpiresAt) > now.getTime();
}
function allowedSender(sender) {
  return emailOk(sender?.address) && clean(sender?.mailboxId) &&
    sender?.authenticationStatus === 'AUTHENTICATED' && sender?.paused === false &&
    sender?.dnsAuthenticated === true && sender?.transportAuthorized === true &&
    sender?.providerPolicyCompatible === true && sender?.quarantined !== true;
}

/**
 * Make only bounded, consent-based, owner-controlled placement probes.
 * A plan provides NO send authority. Per-sender/day and per-seed/day quotas are
 * enforced atomically a second time by the durable executor ledger.
 */
export function compileUberWarm2SeedBatch({ mailboxes = [], seedInboxes = [], now = new Date(), maxProbes = 12, maxSeedsPerSender = 2 } = {}) {
  const at = new Date(now);
  if (!Number.isFinite(at.getTime())) return fail('invalid-clock');
  const senderRows = (Array.isArray(mailboxes) ? mailboxes : []).filter(allowedSender);
  const seedRows = (Array.isArray(seedInboxes) ? seedInboxes : []).filter(x => allowedSeed(x, at));
  const seedProviders = unique(seedRows.map(x => lower(x.provider, 80)));
  const reasons = [];
  if (!senderRows.length) reasons.push('no-authenticated-policy-compatible-unpaused-senders');
  if (!seedRows.length) reasons.push('no-consenting-owner-controlled-test-recipients');
  if (reasons.length) return fail(reasons);
  const senderEmails = senderRows.map(x => lower(x.address));
  if (new Set(senderEmails).size !== senderEmails.length) return fail('duplicate-sender-address');
  const seedEmails = seedRows.map(x => lower(x.email));
  if (new Set(seedEmails).size !== seedEmails.length) return fail('duplicate-seed-address');
  if (seedRows.some(x => senderEmails.includes(lower(x.email)))) return fail('seed-must-not-be-active-sender');
  const limit = Math.min(50, Math.max(1, Math.floor(Number(maxProbes) || 12)));
  const perSender = Math.min(3, Math.max(1, Math.floor(Number(maxSeedsPerSender) || 2)));
  const day = at.toISOString().slice(0, 10);
  const exp = new Date(at.getTime() + 45 * 60000).toISOString();
  const probes = [];
  // Deterministic round-robin across independent receiving providers. Never
  // send to the same recipient twice per calendar day across this batch.
  const consumedSeeds = new Set();
  for (const sender of senderRows) {
    if (probes.length >= limit) break;
    let count = 0;
    for (const provider of seedProviders) {
      if (count >= perSender || probes.length >= limit) break;
      const seed = seedRows.find(x => lower(x.provider, 80) === provider && !consumedSeeds.has(lower(x.email)));
      if (!seed) continue;
      const from = lower(sender.address), to = lower(seed.email);
      const probeId = `uw2_${hash([day, from, to, 'owner-controlled-placement-test']).slice(0,24)}`;
      probes.push(Object.freeze({
        probeId, senderMailboxId: clean(sender.mailboxId, 150), senderEmail: from,
        seedEmail: to, seedProvider: lower(seed.provider, 80),
        permissionEvidenceRef: clean(seed.permissionEvidenceRef, 1000),
        ownerEvidenceRef: clean(seed.ownerEvidenceRef, 1000),
        subject: `UberBond delivery check ${probeId.slice(-8)}`,
        bodyToken: probeId,
        authority: 'PLAN_ONLY', sendAuthorized: false
      }));
      consumedSeeds.add(to); count++;
    }
  }
  if (!probes.length) return fail('no-nonduplicate-probe-pairs');
  const core = {version: UBERWARM2_SEED_EXECUTION_VERSION, day, expiresAt: exp, probes};
  return Object.freeze({
    ...core, ok: true, status: 'UBERWARM2_SEED_PLAN_ONLY',
    batchDigest: `sha256:${hash(core)}`, providerCoverage: seedProviders,
    crossProviderEvidencePossible: seedProviders.length >= 2,
    allProviderParityProven: false, providerCalls: 0, messagesSent: 0,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'Genuine consenting test inboxes, not an artificial warming/reply network. Planning never sends mail or creates receiving-provider reputation.'
  });
}

/**
 * One real probe at a time. The durable ledger MUST implement an atomic
 * tryReserveProbe operation protecting global sender/day and seed/day caps.
 * No auto-retry after a reservation, including ambiguous SMTP outcomes.
 * sendAdapter must bind the sender mailbox identity to authorized SMTP.
 */
export async function executeUberWarm2SeedProbe({ plan, probeId, authorization, ledger, sendAdapter, now = new Date() } = {}) {
  const at = new Date(now);
  if (!plan?.ok || !Array.isArray(plan.probes)) return fail('valid-batch-plan-required');
  const core = {version: plan.version, day: plan.day, expiresAt: plan.expiresAt, probes: plan.probes};
  if (`sha256:${hash(core)}` !== plan.batchDigest) return fail('plan-digest-mismatch');
  if (!Number.isFinite(at.getTime()) || date(plan.expiresAt) == null || at.getTime() >= date(plan.expiresAt) || at.toISOString().slice(0, 10) !== plan.day) return fail('plan-expired-or-wrong-day');
  const probe = plan.probes.find(p => p.probeId === probeId);
  if (!probe || plan.probes.filter(p => p.probeId === probeId).length !== 1) return fail('exact-probe-not-found');
  if (authorization?.granted !== true || authorization?.scope !== 'UBERWARM2_OWNER_SEED_PROBE'
    || !clean(authorization.grantedBy, 120) || authorization.batchDigest !== plan.batchDigest
    || authorization.probeId !== probeId || date(authorization.expiresAt) == null
    || at.getTime() >= date(authorization.expiresAt)) return fail('exact-owner-authorization-required');
  if (authorization?.allowedSender !== probe.senderEmail || authorization?.allowedRecipient !== probe.seedEmail) return fail('authorization-identity-mismatch');
  if (typeof ledger?.tryReserveProbe !== 'function' || typeof ledger?.recordResult !== 'function') return fail('atomic-durable-reservation-ledger-required');
  if (typeof sendAdapter?.sendProbe !== 'function' || sendAdapter?.authorizedSmtp !== true ||
    sendAdapter?.boundMailboxId !== probe.senderMailboxId || sendAdapter?.boundSender !== probe.senderEmail) return fail('exact-authorized-smtp-adapter-required');
  let reserved;
  try { reserved = await ledger.tryReserveProbe({
    reservationId: probe.probeId, day: plan.day,
    senderEmail: probe.senderEmail, recipientEmail: probe.seedEmail,
    maxSenderProbesPerDay: 2, maxRecipientProbesPerDay: 1,
    purpose: 'OWNER_CONTROLLED_PLACEMENT_TEST'
  }); } catch (_error) { return fail('reservation-outcome-uncertain-do-not-retry'); }
  if (reserved?.ok !== true) return fail(reserved?.reason || 'reservation-rejected-or-duplicate');
  // After the atomic reservation, any error is UNCERTAIN; NEVER blind retry.
  const text = `UberBond owner-controlled delivery diagnostic. Reference: ${probe.bodyToken}. No response is requested.`;
  let outcome;
  try {
    outcome = await sendAdapter.sendProbe({
      from: probe.senderEmail, to: probe.seedEmail,
      mailboxId: probe.senderMailboxId, subject: probe.subject,
      text, idempotencyKey: probe.probeId, purpose: 'OWNER_CONTROLLED_PLACEMENT_TEST'
    });
  } catch (_error) {
    outcome = { ok: false, status: 'OUTCOME_UNCERTAIN' };
  }
  const accepted = Boolean(outcome?.ok === true && outcome?.status === 'PROVIDER_ACCEPTED' && clean(outcome.providerMessageId, 500));
  const result = Object.freeze({
    probeId, batchDigest: plan.batchDigest, senderEmail: probe.senderEmail,
    seedEmail: probe.seedEmail, at: at.toISOString(),
    status: accepted ? 'PROVIDER_ACCEPTED_NOT_INBOX_PROVEN' : 'OUTCOME_UNCERTAIN',
    providerMessageId: accepted ? clean(outcome.providerMessageId, 500) : null,
    sendAttempted: true, inboxPlacementProven: false,
    noAutomaticRetry: true
  });
  try { await ledger.recordResult(result); }
  catch (_error) { return { ...result, ok: false, status: 'OUTCOME_UNCERTAIN', reasonCodes: ['receipt-write-failed-do-not-retry'] }; }
  return Object.freeze({ ...result, ok: accepted, messagesSent: accepted ? 1 : null,
    externalEffectAuthority: 'SINGLE_OWNER_AUTHORIZED_SEED_PROBE_ONLY',
    truthBoundary: 'SMTP/provider acceptance never proves receiving inbox placement. Ambiguous outcome is not retried.' });
}

/**
 * Accept placement observations only from the independent receiving mailbox.
 * The supplied observer evidence ref is auditable but cannot itself certify
 * third-party trust, global placement, or legal eligibility for prospects.
 */
export function reconcileUberWarm2SeedObservations({plan, observations = [], deliveryReceipts = [], now = new Date()} = {}) {
  if (!plan?.ok || !Array.isArray(plan.probes)) return fail('valid-batch-plan-required');
  const core = {version:plan.version,day:plan.day,expiresAt:plan.expiresAt,probes:plan.probes};
  if (`sha256:${hash(core)}` !== plan.batchDigest) return fail('plan-digest-mismatch');
  const at = new Date(now);
  if (!Number.isFinite(at.getTime())) return fail('invalid-clock');
  const accepted = [], rejected = [];
  const matched = new Map(plan.probes.map(p => [p.probeId, p]));
  const sent = new Map((Array.isArray(deliveryReceipts)?deliveryReceipts:[])
    .filter(x=>x?.status==='PROVIDER_ACCEPTED_NOT_INBOX_PROVEN'&&x?.inboxPlacementProven===false&&clean(x?.providerMessageId))
    .map(x=>[x.probeId,x]));
  const seen = new Set();
  for (const row of Array.isArray(observations) ? observations : []) {
    const probe = matched.get(clean(row?.probeId, 240));
    const time = date(row?.observedAt);
    const why = [];
    if (!probe) why.push('unknown-probe');
    else if (!sent.has(probe.probeId) || sent.get(probe.probeId).senderEmail!==probe.senderEmail || sent.get(probe.probeId).seedEmail!==probe.seedEmail || sent.get(probe.probeId).batchDigest!==plan.batchDigest) why.push('provider-accepted-send-receipt-required');
    if (probe && (lower(row?.senderEmail) !== probe.senderEmail || lower(row?.seedEmail) !== probe.seedEmail || lower(row?.seedProvider, 80) !== probe.seedProvider)) why.push('sender-recipient-provider-mismatch');
    if (row?.source !== 'RECEIVING_PROVIDER_OBSERVATION' || row?.receiverAccountVerified !== true || row?.ownerControlled !== true) why.push('unverified-receiver-observation');
    if (!clean(row?.evidenceRef, 1000)) why.push('independent-evidence-reference-required');
    if (time === null || time > at.getTime() || time < Date.parse(plan.day + 'T00:00:00Z') || at.getTime() - time > 7 * 86400000) why.push('stale-or-invalid-observation');
    if (!['INBOX', 'SPAM', 'MISSING', 'OTHER'].includes(row?.folder)) why.push('real-folder-classification-required');
    if (seen.has(row?.probeId)) why.push('duplicate-observation');
    if (why.length) { rejected.push({probeId: clean(row?.probeId), reasonCodes: why}); continue; }
    const normalized = normalizePlacementObservation({probeId: probe.probeId,senderEmail: probe.senderEmail,
      seedEmail: probe.seedEmail, seedProvider: probe.seedProvider,folder: row.folder,
      observedAt: row.observedAt, evidenceRef: row.evidenceRef, messageId: row.messageId || ''});
    if (!normalized.ok) {rejected.push({probeId: probe.probeId, reasonCodes: normalized.reasonCodes}); continue;}
    seen.add(row.probeId); accepted.push(normalized);
  }
  const report = compilePlacementReport({plan: {probes: plan.probes}, observations: accepted, now: at});
  return Object.freeze({ok: true, status: 'UBERWARM2_SEED_OBSERVATIONS_RECONCILED',
    version: UBERWARM2_SEED_EXECUTION_VERSION, observed: accepted.length,
    rejected, report, providerDiversityObserved: unique(accepted.map(x => x.observation.seedProvider)).length,
    messagesSent: 0, externalEffectAuthority: 'NONE',
    readinessPromotionAuthorized: false, recipientNetworkReputationProven: false,
    truthBoundary: 'Only directly received folder classifications for exact owner-controlled probes. No synthetic engagement or promotion authority.'});
}