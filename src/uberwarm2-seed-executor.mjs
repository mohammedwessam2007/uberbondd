import { createHash } from 'node:crypto';
import { compilePlacementReport, normalizePlacementObservation } from './uberplacement.mjs';

export const UBERWARM2_SEED_EXECUTION_VERSION = 'uberbond.uberwarm2-seed-execution.v1';
const email = value => String(value ?? '').trim().toLowerCase();
const text = (value, limit = 256) => String(value ?? '').trim().slice(0, limit);
const emailOk = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(value));
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const utcDay = date => new Date(date).toISOString().slice(0, 10);
const finiteTime = date => { const n = new Date(date).getTime(); return Number.isFinite(n) ? n : null; };
const denied = (status, reasonCodes) => Object.freeze({
  ok: false, status, reasonCodes, externalEffectAuthority: 'NONE',
  providerSubmissions: 0, verifiedPlacements: 0
});

/**
 * Compile only verifiably owner-controlled, consenting seed destinations.
 * No prospect address can be introduced through this interface.
 * This is a PLAN, not a reputation-generating conversation network.
 */
export function compileUberWarm2SeedBatch({
  placementPlan = {}, mailboxes = [], seedInboxes = [], now = new Date(),
  maxSeedsPerSender = 2, maxBatch = 100
} = {}) {
  const at = finiteTime(now);
  if (at === null) return denied('UBERWARM2_BATCH_REFUSED', ['invalid-clock']);
  const senderMap = new Map((Array.isArray(mailboxes) ? mailboxes : [])
    .filter(m => emailOk(m?.address || m?.email))
    .map(m => [email(m.address || m.email), m]));
  const seedMap = new Map((Array.isArray(seedInboxes) ? seedInboxes : [])
    .filter(s => emailOk(s?.email))
    .map(s => [email(s.email), s]));
  const source = Array.isArray(placementPlan.probes) ? placementPlan.probes : [];
  const limit = Math.min(100, Math.max(1, Math.floor(Number(maxBatch) || 100)));
  const senderLimit = Math.min(4, Math.max(1, Math.floor(Number(maxSeedsPerSender) || 2)));
  const counts = new Map();
  const rejections = [];
  const seen = new Set();
  const probes = [];
  for (const probe of source) {
    const senderEmail = email(probe?.senderEmail);
    const seedEmail = email(probe?.seedEmail);
    const sender = senderMap.get(senderEmail);
    const seed = seedMap.get(seedEmail);
    const reasons = [];
    if (!text(probe?.probeId, 250) || seen.has(probe.probeId)) reasons.push('missing-or-repeated-probe-id');
    if (probe?.authority !== 'PLAN_ONLY' || probe?.sendAuthorized !== false) reasons.push('non-plan-only-probe');
    if (probe?.bodyToken !== probe?.probeId) reasons.push('body-correlation-token-mismatch');
    if (!sender || sender.authenticationStatus !== 'AUTHENTICATED' || sender.paused === true ||
        sender.quarantined === true || sender.placementQuarantine === true) reasons.push('sender-not-health-cleared');
    if (!seed || seed.ownerControlled !== true || seed.receiveReady !== true ||
        seed.consentToTest !== true || !text(seed.consentEvidenceRef, 500)) reasons.push('recipient-not-proven-consenting-owned-seed');
    if (senderEmail === seedEmail) reasons.push('self-send-not-accepted-as-seed-evidence');
    if ((counts.get(senderEmail) || 0) >= senderLimit) reasons.push('per-sender-batch-limit');
    if (probes.length >= limit) reasons.push('global-batch-limit');
    if (reasons.length) {
      rejections.push({ probeId: text(probe?.probeId, 250) || null, reasonCodes: reasons });
      continue;
    }
    const row = Object.freeze({
      probeId: text(probe.probeId, 250), senderEmail, seedEmail,
      seedProvider: text(probe.seedProvider, 80).toLowerCase(),
      bodyToken: text(probe.bodyToken, 250),
      subject: 'UberBond permitted mailbox delivery test',
      body: `Owner-authorized delivery and inbox-placement test. No reply or other action is requested. Reference: ${text(probe.bodyToken, 250)}`,
      scope: 'OWNER_CONTROLLED_PLACEMENT_PROBE',
      providerEngagementClaim: 'NONE'
    });
    probes.push(row);
    seen.add(row.probeId);
    counts.set(senderEmail, (counts.get(senderEmail) || 0) + 1);
  }
  const canonical = { version: UBERWARM2_SEED_EXECUTION_VERSION, createdAt: new Date(at).toISOString(), probes };
  return Object.freeze({
    ok: probes.length > 0, status: probes.length ? 'UBERWARM2_SEED_BATCH_PREPARED' : 'UBERWARM2_NO_ELIGIBLE_SEEDS',
    ...canonical, batchDigest: `sha256:${sha(canonical)}`, rejections,
    approvedDestinationClass: 'OWNER_CONTROLLED_CONSENTING_SEED_ONLY',
    externalEffectAuthority: 'NONE', providerSubmissions: 0,
    artificialReplies: 0, spamFolderRescues: 0, warmingNetworkMembers: 0
  });
}

/**
 * Only authorized, bounded, one-shot placement tests can leave the process.
 * The caller MUST supply a durable store that atomically enforces one-shot
 * reservations AND rolling sender/global day limits across all workers.
 * A submit timeout remains UNKNOWN and never auto-retries.
 */
export async function executeUberWarm2SeedProbe({
  batch, probeId, approval, store, transport, now = new Date()
} = {}) {
  const at = finiteTime(now);
  if (at === null || !batch?.ok || !Array.isArray(batch.probes)) return denied('UBERWARM2_EXECUTION_REFUSED', ['invalid-batch-or-clock']);
  const canonical = { version: UBERWARM2_SEED_EXECUTION_VERSION, createdAt: batch.createdAt, probes: batch.probes };
  if (batch.batchDigest !== `sha256:${sha(canonical)}`) return denied('UBERWARM2_EXECUTION_REFUSED', ['batch-digest-invalid']);
  const batchAge = at - finiteTime(batch.createdAt);
  if (!Number.isFinite(batchAge) || batchAge < 0 || batchAge > 24 * 60 * 60 * 1000) return denied('UBERWARM2_EXECUTION_REFUSED', ['batch-expired']);
  const probe = batch.probes.find(x => x.probeId === probeId);
  if (!probe || batch.probes.filter(x => x.probeId === probeId).length !== 1) return denied('UBERWARM2_EXECUTION_REFUSED', ['probe-not-in-immutable-batch']);
  const scopes = Array.isArray(approval?.scopes) ? approval.scopes : [];
  if (approval?.granted !== true || !text(approval?.grantedBy, 120) ||
      !scopes.includes('uberwarm2:owner-controlled-seed-test') ||
      approval?.batchDigest !== batch.batchDigest ||
      finiteTime(approval?.expiresAt) === null || finiteTime(approval?.expiresAt) <= at)
    return denied('UBERWARM2_OWNER_APPROVAL_REQUIRED', ['exact-unexpired-seed-test-authorization-required']);
  if (!store || typeof store.claimOnceAndEnforceCaps !== 'function' || typeof store.finalize !== 'function')
    return denied('UBERWARM2_DURABLE_LEDGER_REQUIRED', ['atomic-reservation-and-caps-adapter-required']);
  if (!transport || typeof transport.sendOwnedSeed !== 'function')
    return denied('UBERWARM2_TRANSPORT_REQUIRED', ['owner-approved-smtp-adapter-required']);
  const reservationKey = `uberwarm2-seed:${sha([batch.batchDigest, probe.probeId])}`;
  const reservation = {
    reservationKey, probeId: probe.probeId, batchDigest: batch.batchDigest,
    senderEmail: probe.senderEmail, seedEmail: probe.seedEmail,
    senderDailyLimit: 2, seedDailyLimit: 1, globalDailyLimit: 100, quotaWindow: utcDay(now),
    effectClass: 'OWNER_CONTROLLED_PLACEMENT_PROBE',
    evidenceRef: text(approval.evidenceRef, 500) || null
  };
  let claim;
  try { claim = await store.claimOnceAndEnforceCaps(reservation); }
  catch { return denied('UBERWARM2_RESERVATION_UNKNOWN', ['durable-reservation-outcome-uncertain-no-retry']); }
  if (claim?.ok !== true || claim?.claimed !== true || claim?.capsEnforced !== true ||
      claim?.reservationKey !== reservationKey)
    return denied('UBERWARM2_PROBE_NOT_CLAIMED', [text(claim?.reason, 100) || 'replayed-or-quota-rejected']);
  // Once claimed, ANY failure/timeout remains uncertain until external reconciliation.
  let outcome;
  try {
    outcome = await transport.sendOwnedSeed({
      from: probe.senderEmail, to: probe.seedEmail, subject: probe.subject,
      body: probe.body, probeId: probe.probeId,
      reservationKey, permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE'
    });
  } catch {
    outcome = { ok: false, status: 'OUTCOME_UNCERTAIN' };
  }
  const submitted = outcome?.ok === true && outcome?.accepted === true &&
    typeof outcome?.messageId === 'string' && outcome.messageId.trim().length > 0;
  const receipt = Object.freeze({
    version: UBERWARM2_SEED_EXECUTION_VERSION,
    status: submitted ? 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN' : 'SUBMISSION_OUTCOME_UNCERTAIN',
    reservationKey, probeId: probe.probeId, batchDigest: batch.batchDigest,
    senderEmail: probe.senderEmail, seedEmail: probe.seedEmail,
    providerMessageId: submitted ? text(outcome.messageId, 500) : null,
    providerSubmissions: submitted ? 1 : null,
    verifiedPlacements: 0, syntheticReplies: 0, providerEngagementClaim: 'NONE',
    submittedAt: new Date(at).toISOString()
  });
  try {
    const committed = await store.finalize({ reservationKey, receipt });
    if (committed?.ok !== true) return { ...receipt, ok: false, status: 'LEDGER_FINALIZATION_UNCERTAIN', reasonCodes: ['external-effect-may-have-occurred-no-retry'] };
  } catch {
    return { ...receipt, ok: false, status: 'LEDGER_FINALIZATION_UNCERTAIN', reasonCodes: ['external-effect-may-have-occurred-no-retry'] };
  }
  return { ...receipt, ok: submitted, reasonCodes: submitted ? [] : ['external-effect-may-have-occurred-no-retry'] };
}

/**
 * Attribution is strictly to a matching, independently observed provider
 * message ID and the exact sender/recipient in an accepted receipt.
 * A caller-supplied "INBOX" string alone is never authoritative evidence.
 */
export function compileUberWarm2ReceivedEvidence({
  batch = {}, receipts = [], receivingObservations = [], now = new Date()
} = {}) {
  if (!batch?.ok || !Array.isArray(batch.probes)) return denied('UBERWARM2_EVIDENCE_REFUSED', ['valid-seed-batch-required']);
  const canonical = { version: UBERWARM2_SEED_EXECUTION_VERSION, createdAt: batch.createdAt, probes: batch.probes };
  if (batch.batchDigest !== `sha256:${sha(canonical)}`) return denied('UBERWARM2_EVIDENCE_REFUSED', ['batch-digest-invalid']);
  const receiptsByProbe = new Map((Array.isArray(receipts) ? receipts : [])
    .filter(r => r?.status === 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN' && r?.batchDigest === batch.batchDigest &&
      text(r.providerMessageId, 500))
    .map(r => [r.probeId, r]));
  const accepted = [];
  const exclusions = [];
  const usedRefs = new Set();
  for (const obs of Array.isArray(receivingObservations) ? receivingObservations : []) {
    const probe = batch.probes.find(p => p.probeId === obs?.probeId);
    const receipt = receiptsByProbe.get(obs?.probeId);
    const reasons = [];
    if (!probe || !receipt) reasons.push('correlated-provider-submission-required');
    if (probe && (email(obs.senderEmail) !== probe.senderEmail || email(obs.seedEmail) !== probe.seedEmail))
      reasons.push('sender-or-seed-mismatch');
    if (probe && text(obs.seedProvider, 80).toLowerCase() !== probe.seedProvider)
      reasons.push('seed-provider-mismatch');
    if (receipt && (receipt.senderEmail !== probe?.senderEmail || receipt.seedEmail !== probe?.seedEmail ||
        receipt.providerMessageId !== text(obs.messageId, 500))) reasons.push('message-id-mismatch');
    if (obs?.observationSource !== 'RECIPIENT_PROVIDER' ||
        !text(obs.receivingProviderEvidenceRef, 800)) reasons.push('receiving-provider-receipt-required');
    const ev = text(obs?.receivingProviderEvidenceRef, 800);
    if (ev && usedRefs.has(ev)) reasons.push('duplicate-receiving-provider-evidence');
    const time = finiteTime(obs?.observedAt);
    const after = finiteTime(receipt?.submittedAt);
    if (time === null || after === null || time < after ||
        (finiteTime(now) !== null && time > finiteTime(now) + 5 * 60 * 1000))
      reasons.push('invalid-observation-timestamp');
    const normalized = normalizePlacementObservation(obs);
    if (!normalized.ok) reasons.push(...normalized.reasonCodes);
    if (reasons.length) {
      exclusions.push({ probeId: text(obs?.probeId, 250) || null, reasonCodes: [...new Set(reasons)] });
      continue;
    }
    usedRefs.add(ev);
    accepted.push(normalized.observation);
  }
  const report = compilePlacementReport({
    plan: { probes: batch.probes }, observations: accepted, now
  });
  return Object.freeze({
    ok: true, status: 'UBERWARM2_RECEIVER_EVIDENCE_COMPILED',
    version: UBERWARM2_SEED_EXECUTION_VERSION,
    batchDigest: batch.batchDigest,
    report, exclusions, acceptedObservations: accepted.length,
    verifiedPlacements: accepted.length, externalEffectAuthority: 'NONE',
    syntheticEngagementEvidence: 0,
    truthBoundary: 'Observed seed placement is evidence about these exact owner-controlled messages only. It never proves general inbox reputation, genuine recipient engagement, or cold outreach authorization.'
  });
}
