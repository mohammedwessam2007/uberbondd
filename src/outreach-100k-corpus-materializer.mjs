import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectOutreach100kPacketCorpus } from './outreach-100k-packet-corpus.mjs';

export const OUTREACH_100K_CORPUS_MATERIALIZER_VERSION = 'uberbond.outreach-100k-corpus-materializer.v1';

const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const positiveInt = (value, fallback = null, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const n = Math.floor(parsed);
  return n > 0 && n <= max ? n : fallback;
};
const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 320));
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

function fail(reasonCodes, extra = {}) {
  return Object.freeze({
    ok: false,
    status: 'OUTREACH_100K_CORPUS_MATERIALIZATION_REFUSED',
    version: OUTREACH_100K_CORPUS_MATERIALIZER_VERSION,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false,
    ...extra
  });
}

function localParts(timeZone, date) {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  } catch {
    return null;
  }
}

function inBusinessWindow(timeZone, date, startHour, endHour) {
  const parts = localParts(timeZone, date);
  if (!parts || ['Sat', 'Sun'].includes(parts.weekday)) return false;
  const hour = Number(parts.hour);
  return Number.isFinite(hour) && hour >= startHour && hour < endHour;
}

function nextBusinessInstant({ timeZone, fromMs, startHour, endHour, stepMs = 60_000, maxLookaheadMs = 14 * 24 * 60 * 60 * 1000 }) {
  const until = fromMs + maxLookaheadMs;
  for (let at = fromMs; at <= until; at += stepMs) {
    const date = new Date(at);
    if (inBusinessWindow(timeZone, date, startHour, endHour)) return at;
  }
  return null;
}

function candidateReason(candidate, campaignId, nowMs) {
  const reasons = [];
  const to = clean(candidate?.message?.to, 320).toLowerCase();
  const recipient = candidate?.launchInput?.recipient || {};
  const campaign = candidate?.launchInput?.campaign || {};
  const legal = candidate?.launchInput?.legal || {};
  const suppression = candidate?.launchInput?.suppression || {};
  const auth = candidate?.dispatchAuthorization || {};
  if (!clean(candidate?.recipientId, 240)) reasons.push('recipient-id-required');
  if (!email(to)) reasons.push('valid-recipient-email-required');
  if (!clean(candidate?.recipientProviderId, 120)) reasons.push('recipient-provider-required');
  if (!clean(candidate?.recipientTimeZone, 120)) reasons.push('recipient-time-zone-required');
  if (!clean(candidate?.message?.subject, 998) || !clean(candidate?.message?.body, 100_000)) reasons.push('complete-message-required');
  if (clean(candidate?.campaignId || campaign?.id, 240) !== campaignId || clean(campaign?.id, 240) !== campaignId) reasons.push('campaign-mismatch');
  if (clean(recipient?.email, 320).toLowerCase() !== to) reasons.push('launch-recipient-mismatch');
  if (recipient?.verified !== true || recipient?.safeForOutreach !== true || !clean(recipient?.verificationEvidenceRef, 1500)) reasons.push('recipient-verification-evidence-required');
  if (legal?.eligible !== true || String(legal?.status || '').toUpperCase() !== 'PASSED' || !clean(legal?.evidenceId, 1000) || !clean(legal?.policyVersion, 160)) reasons.push('recipient-legal-evidence-required');
  if (suppression?.checked !== true || suppression?.suppressed === true || suppression?.unsubscribeRequested === true || suppression?.unsubscribed === true) reasons.push('recipient-suppression-gate-not-precleared');
  if (auth?.authorized !== true || !clean(auth?.receiptId, 240) || !clean(auth?.authorizedBy, 240) || clean(auth?.recipientEmail, 320).toLowerCase() !== to || clean(auth?.campaignId, 240) !== campaignId) reasons.push('exact-dispatch-authorization-required');
  const authExpiry = Date.parse(String(auth?.expiresAt || ''));
  if (!Number.isFinite(authExpiry) || authExpiry <= nowMs) reasons.push('dispatch-authorization-expired');
  return reasons;
}

function mailboxPool(mailboxes = []) {
  return (Array.isArray(mailboxes) ? mailboxes : []).map(row => ({
    row,
    mailboxId: clean(row?.mailboxId, 240),
    remainingDailyCap: positiveInt(row?.remainingDailyCap, 0, 1_000_000),
    observedHourlyCap: positiveInt(row?.observedHourlyCap, 0, 100_000),
    minGapMs: Math.max(0, Number(row?.minGapSeconds || 0) * 1000),
    used: 0,
    lastAt: null,
    hourCounts: new Map()
  })).filter(box => box.mailboxId && box.row?.ready !== false && box.remainingDailyCap > 0 && box.observedHourlyCap > 0);
}

function scheduleOnMailbox({ box, candidate, startMs, businessHourStart, businessHourEnd }) {
  let cursor = Math.max(startMs, box.lastAt == null ? startMs : box.lastAt + box.minGapMs);
  const authExpiry = Date.parse(String(candidate?.dispatchAuthorization?.expiresAt || ''));
  for (let guard = 0; guard < 20_000; guard += 1) {
    const business = nextBusinessInstant({ timeZone: clean(candidate.recipientTimeZone, 120), fromMs: cursor, startHour: businessHourStart, endHour: businessHourEnd });
    if (business == null || business >= authExpiry) return null;
    const hour = new Date(business).toISOString().slice(0, 13);
    const count = box.hourCounts.get(hour) || 0;
    if (count < box.observedHourlyCap) return business;
    cursor = Date.parse(`${hour}:00:00.000Z`) + 60 * 60 * 1000;
  }
  return null;
}

export async function materializeOutreach100kPacketCorpus({
  candidates = [],
  mailboxes = [],
  campaignId = '',
  outputPath,
  target = 100_000,
  now = new Date(),
  businessHourStart = 9,
  businessHourEnd = 17
} = {}) {
  const boundedTarget = positiveInt(target, null, 100_000);
  if (boundedTarget == null) return fail(['target-must-be-positive-and-at-most-100000']);
  const normalizedCampaignId = clean(campaignId, 240);
  if (!normalizedCampaignId) return fail(['campaign-id-required']);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
  if (!Number.isFinite(nowMs)) return fail(['valid-reference-time-required']);
  const destination = clean(outputPath, 4000);
  if (!destination) return fail(['output-path-required']);
  if (!Array.isArray(candidates) || candidates.length < boundedTarget) return fail(['insufficient-candidate-inventory'], { candidateCount: Array.isArray(candidates) ? candidates.length : 0, target: boundedTarget });
  const boxes = mailboxPool(mailboxes);
  const aggregateCap = boxes.reduce((sum, box) => sum + box.remainingDailyCap, 0);
  if (!boxes.length || aggregateCap < boundedTarget) return fail(['insufficient-observed-mailbox-capacity'], { aggregateCap, target: boundedTarget });

  const seenRecipients = new Set();
  const seenAccounts = new Set();
  const accepted = [];
  const rejected = [];

  for (const candidate of candidates) {
    const reasons = candidateReason(candidate, normalizedCampaignId, nowMs);
    const to = clean(candidate?.message?.to, 320).toLowerCase();
    const accountKey = clean(candidate?.accountKey, 500);
    if (seenRecipients.has(to)) reasons.push('duplicate-recipient');
    if (accountKey && seenAccounts.has(accountKey)) reasons.push('duplicate-account-day');
    if (reasons.length) {
      rejected.push({ recipientId: clean(candidate?.recipientId, 240) || null, reasonCodes: [...new Set(reasons)] });
      continue;
    }
    seenRecipients.add(to);
    if (accountKey) seenAccounts.add(accountKey);
    accepted.push(candidate);
    if (accepted.length >= boundedTarget) break;
  }

  if (accepted.length < boundedTarget) return fail(['insufficient-precleared-candidate-inventory'], { target: boundedTarget, acceptedCount: accepted.length, rejectedCount: rejected.length, rejectedPreview: rejected.slice(0, 50) });

  const scheduled = [];
  let globalCursor = nowMs;
  for (const candidate of accepted) {
    let best = null;
    for (const box of boxes) {
      if (box.used >= box.remainingDailyCap) continue;
      const at = scheduleOnMailbox({ box, candidate, startMs: globalCursor, businessHourStart, businessHourEnd });
      if (at == null) continue;
      if (!best || at < best.at || (at === best.at && box.mailboxId < best.box.mailboxId)) best = { box, at };
    }
    if (!best) return fail(['unable-to-schedule-exact-target-within-observed-capacity-and-authorization'], { scheduledCount: scheduled.length, target: boundedTarget });
    const hour = new Date(best.at).toISOString().slice(0, 13);
    best.box.used += 1;
    best.box.lastAt = best.at;
    best.box.hourCounts.set(hour, (best.box.hourCounts.get(hour) || 0) + 1);
    globalCursor = best.at;
    const to = clean(candidate.message.to, 320).toLowerCase();
    scheduled.push({
      ...candidate,
      campaignId: normalizedCampaignId,
      mailboxId: best.box.mailboxId,
      notBefore: new Date(best.at).toISOString(),
      idempotencyKey: clean(candidate.idempotencyKey, 500) || `ub100k:${normalizedCampaignId}:${sha256(`${to}|${clean(candidate.recipientId, 240)}`).slice(0, 32)}`
    });
  }

  scheduled.sort((a, b) => Date.parse(a.notBefore) - Date.parse(b.notBefore) || clean(a.message?.to, 320).localeCompare(clean(b.message?.to, 320)));
  const tmp = `${destination}.tmp-${process.pid}-${crypto.randomUUID()}`;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(tmp, scheduled.map(row => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 });
  try {
    const inspection = await inspectOutreach100kPacketCorpus({
      filePath: tmp,
      mailboxes,
      campaignId: normalizedCampaignId,
      expectedCount: boundedTarget,
      businessHourStart,
      businessHourEnd,
      now: new Date(nowMs)
    });
    if (!inspection.ok) return fail(['post-materialization-corpus-inspection-failed', ...(inspection.reasonCodes || [])], { inspection });
    await fs.rename(tmp, destination);
    return Object.freeze({
      ok: true,
      status: 'OUTREACH_100K_CORPUS_MATERIALIZED',
      version: OUTREACH_100K_CORPUS_MATERIALIZER_VERSION,
      target: boundedTarget,
      outputPath: destination,
      recipientSetDigest: inspection.recipientSetDigest,
      mailboxCounts: inspection.mailboxCounts,
      recipientProviderCounts: inspection.recipientProviderCounts,
      rejectedCandidateCount: rejected.length,
      rejectedPreview: rejected.slice(0, 50),
      messagesSent: 0,
      providerCalls: 0,
      externalEffectsAuthorized: false,
      truthBoundary: 'MATERIALIZED means an exact precleared corpus was deterministically written and re-inspected against the existing 100K corpus contract. The materializer does not create recipient permission, legal eligibility, dispatch authorization, sender capacity, provider capacity, or send authority.'
    });
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {});
  }
}
