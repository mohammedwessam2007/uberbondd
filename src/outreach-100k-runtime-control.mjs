import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import readline from 'node:readline';
import { inspectOutreach100kPacketCorpus } from './outreach-100k-packet-corpus.mjs';
import { compileOutreach100kLaunchCertificate } from './outreach-100k-launch-contract.mjs';
import { evaluateOutreachLaunchGate, OUTREACH_LAUNCH_STATES } from './outreach-launch-gate.mjs';
import { dispatchGovernedOutreach } from './governed-outreach-dispatch.mjs';
import { createUberSmtpSubmissionTransport } from './ubersmtp-submission-adapter.mjs';

export const OUTREACH_100K_RUNTIME_VERSION = 'uberbond.outreach-100k-runtime.v1';
export const DEFAULT_OUTREACH_100K_BUNDLE_PATH = '/var/lib/uberbond-control/outreach-100k-runtime-bundle.json';
export const DEFAULT_OUTREACH_100K_CORPUS_PATH = '/var/lib/uberbond-control/outreach-100k-corpus.ndjson';

const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const int = (value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
};
const uniq = values => [...new Set((values || []).filter(Boolean))];

function failure(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: OUTREACH_100K_RUNTIME_VERSION,
    status: 'OUTREACH_100K_RUNTIME_REFUSED',
    reasonCodes: uniq(reasonCodes),
    providerCalls: 0,
    messagesSent: 0,
    automaticRetryAuthorized: false,
    ...extra
  };
}

async function readBoundedJson(filePath, maxBytes = 10 * 1024 * 1024) {
  const target = clean(filePath, 2000);
  let stat;
  try { stat = await fsp.lstat(target); } catch { return failure(['runtime-bundle-file-required']); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes) {
    return failure(['runtime-bundle-bounded-regular-file-required']);
  }
  try {
    const raw = await fsp.readFile(target, 'utf8');
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return failure(['runtime-bundle-object-required']);
    return { ok: true, value, observedAt: new Date(stat.mtimeMs).toISOString(), evidenceRef: `file:${target}#sha256:${hash(raw)}` };
  } catch {
    return failure(['runtime-bundle-valid-json-required']);
  }
}

function normalizeOutbound(bundleOutbound = {}, liveSummary = {}) {
  const summary = liveSummary?.outbound || {};
  return {
    ...bundleOutbound,
    enabled: summary.enabled ?? bundleOutbound.enabled,
    dryRun: summary.dryRun ?? bundleOutbound.dryRun,
    globalPaused: summary.globalPaused ?? bundleOutbound.globalPaused,
    uncertain: summary.uncertain ?? bundleOutbound.uncertain,
    workerOnline: liveSummary?.workerOnline ?? bundleOutbound.workerOnline,
    schedulerActive: liveSummary?.schedulerActive ?? bundleOutbound.schedulerActive === true,
    providerConfirmedToday: liveSummary?.providerConfirmedToday ?? bundleOutbound.providerConfirmedToday ?? 0
  };
}

export async function buildLiveOutreach100kSummary({ store, cfg = {} } = {}) {
  if (!store || typeof store.list !== 'function' || typeof store.getSettings !== 'function') {
    return { workerOnline: false, schedulerActive: false, outbound: { enabled: false, dryRun: true, globalPaused: true, uncertain: 0 }, providerConfirmedToday: 0 };
  }
  const [settings, reservations] = await Promise.all([
    store.getSettings(),
    store.list('outboundReservations')
  ]);
  const day = new Date().toISOString().slice(0, 10);
  const uncertain = reservations.filter(row => row.status === 'uncertain').length;
  const providerConfirmedToday = reservations.filter(row => row.status === 'sent' && String(row.sentAt || row.completedAt || '').startsWith(day)).length;
  return {
    workerOnline: true,
    schedulerActive: cfg.autopilot === true,
    providerConfirmedToday,
    outbound: {
      enabled: cfg.outbound?.enabled === true,
      dryRun: cfg.outbound?.dryRun === true,
      globalPaused: settings?.outboundPaused === true,
      uncertain
    }
  };
}

export async function prepareOutreach100kRuntime({
  bundlePath = process.env.OUTREACH_100K_BUNDLE_PATH || DEFAULT_OUTREACH_100K_BUNDLE_PATH,
  corpusPath = process.env.OUTREACH_100K_CORPUS_PATH || DEFAULT_OUTREACH_100K_CORPUS_PATH,
  liveSummary = {},
  now = new Date()
} = {}) {
  const bundleRead = await readBoundedJson(bundlePath);
  if (!bundleRead.ok) return bundleRead;
  const bundle = bundleRead.value;
  const campaignId = clean(bundle?.campaign?.id || bundle?.campaignAuthorization?.campaignId, 240);
  if (!campaignId) return failure(['100k-campaign-id-required']);

  const corpus = await inspectOutreach100kPacketCorpus({
    filePath: corpusPath,
    mailboxes: bundle.mailboxes,
    campaignId,
    expectedCount: 100_000,
    businessHourStart: int(bundle?.policy?.businessHourStart, 9, 0, 23),
    businessHourEnd: int(bundle?.policy?.businessHourEnd, 17, 1, 24),
    now
  });
  if (!corpus.ok) return failure(corpus.reasonCodes || ['100k-corpus-not-ready'], { corpus });

  if (clean(bundle?.recipientSetDigest, 200) && clean(bundle.recipientSetDigest, 200) !== clean(corpus.recipientSetDigest, 200)) {
    return failure(['runtime-bundle-recipient-set-digest-mismatch'], { corpus });
  }

  const runtime = {
    ...(bundle.runtime || {}),
    observedAt: bundle.runtime?.observedAt || bundleRead.observedAt,
    evidenceRef: bundle.runtime?.evidenceRef || bundleRead.evidenceRef
  };
  const certificate = compileOutreach100kLaunchCertificate({
    target: 100_000,
    inventory: corpus.inventory,
    domains: bundle.domains,
    mailboxes: bundle.mailboxes,
    egressRoutes: bundle.egressRoutes,
    recipientProviders: bundle.recipientProviders,
    campaign: bundle.campaign,
    runtime,
    schedule: corpus.schedule,
    outbound: normalizeOutbound(bundle.outbound || {}, liveSummary),
    now,
    maxEvidenceAgeHours: int(bundle?.policy?.maxEvidenceAgeHours, 24, 1, 168)
  });

  return {
    ok: true,
    version: OUTREACH_100K_RUNTIME_VERSION,
    status: certificate.state,
    bundleEvidenceRef: bundleRead.evidenceRef,
    corpus,
    certificate,
    pressable: certificate.oneButton100kPressAvailable === true,
    truthBoundary: 'This runtime preparation rebinds the exact 100,000-recipient corpus to fresh infrastructure evidence. It creates no send authority by itself.'
  };
}

function domainState(bundle, mailbox) {
  const domainId = clean(mailbox?.domainId || String(mailbox?.address || '').split('@')[1], 253).toLowerCase();
  const row = (bundle.domains || []).find(item => clean(item?.domainId || item?.domain, 253).toLowerCase() === domainId) || {};
  return {
    domainId,
    state: row.ownerAuthorized === true && row.dnsAuthenticated === true && row.reputationHealthy === true ? 'READY_FOR_LIMITED_OUTREACH' : 'UNKNOWN',
    outreachState: row.ownerAuthorized === true ? 'AUTHORIZED' : 'UNAUTHORIZED',
    evidenceFreshness: clean(row.evidenceRef, 1500) ? 'FRESH' : 'UNKNOWN',
    evidenceRef: clean(row.evidenceRef, 1500) || null
  };
}

function mailboxState(mailbox = {}) {
  return {
    mailboxId: clean(mailbox.mailboxId, 240),
    address: clean(mailbox.address, 320).toLowerCase(),
    authenticationStatus: mailbox.authenticated === true || mailbox.authenticationStatus === 'AUTHENTICATED' ? 'AUTHENTICATED' : 'UNKNOWN',
    warmupStatus: ['WARMUP_COMPLETE', 'RAMP', 'HOLD', 'LIMITED_CANARY'].includes(String(mailbox.warmupState || mailbox.warmupStatus || '').toUpperCase()) ? 'WARMUP_COMPLETE' : 'UNKNOWN',
    paused: mailbox.paused === true,
    currentDailyCap: int(mailbox.observedColdDailyCap ?? mailbox.currentDailyCap, 0)
  };
}

function egressState(route = {}) {
  return {
    state: route.ready === true || String(route.status || '').toUpperCase() === 'READY' ? 'READY' : 'UNKNOWN',
    observedColdDailyCap: int(route.observedColdDailyCap, 0),
    evidenceRef: clean(route.evidenceRef, 1500) || null
  };
}

function recipientProviderState(row = {}) {
  return {
    state: row.ready === true || String(row.state || '').toUpperCase() === 'READY' ? 'READY' : 'UNKNOWN',
    observedDailyBudget: int(row.observedDailyBudget, 0),
    evidenceRef: clean(row.evidenceRef, 1500) || null
  };
}

function packetLaunchDecision({ packet, bundle, mailbox, egressRoute, smtpRoute, recipientProvider, now }) {
  const recipient = packet?.launchInput?.recipient || {};
  const legal = packet?.launchInput?.legal || {};
  const suppression = packet?.launchInput?.suppression || {};
  return evaluateOutreachLaunchGate({
    genome: bundle.genome || {},
    domainState: domainState(bundle, mailbox),
    mailboxState: mailboxState(mailbox),
    egress: egressState(egressRoute),
    transport: {
      state: smtpRoute?.authorized === true && smtpRoute?.termsCompatible === true && clean(smtpRoute?.evidenceRef, 1500) ? 'READY' : 'UNKNOWN',
      authenticated: smtpRoute?.authenticated === true || Boolean(smtpRoute?.username) || Boolean(smtpRoute?.usernameEnv),
      evidenceRef: clean(smtpRoute?.evidenceRef, 1500) || null
    },
    campaignAuthorization: bundle.campaignAuthorization || {},
    recipient: {
      ...recipient,
      email: clean(packet?.message?.to || recipient.email, 320).toLowerCase(),
      safeForOutreach: recipient.safeForOutreach === true,
      verificationEvidenceRef: clean(recipient.verificationEvidenceRef, 1500) || null
    },
    legal: {
      ...legal,
      status: legal.status || (legal.eligible === true ? 'PASSED' : 'FAILED')
    },
    suppression: {
      suppressed: suppression.suppressed === true,
      unsubscribed: suppression.unsubscribeRequested === true || suppression.unsubscribed === true
    },
    recipientProvider: recipientProviderState(recipientProvider),
    now
  });
}

function dispatchAuthorization(packet = {}) {
  const auth = packet.dispatchAuthorization || {};
  return {
    authorized: auth.authorized === true,
    receiptId: clean(auth.receiptId, 240),
    authorizedBy: clean(auth.authorizedBy, 240),
    recipientEmail: clean(auth.recipientEmail || packet?.message?.to, 320).toLowerCase(),
    campaignId: clean(auth.campaignId || packet?.campaignId, 240),
    expiresAt: auth.expiresAt
  };
}

function routeFor(bundle, mailbox) {
  const routeId = clean(mailbox?.egressRouteId || mailbox?.routeId, 240);
  const egressRoute = (bundle.egressRoutes || []).find(row => clean(row?.routeId || row?.id, 240) === routeId) || null;
  const smtpRoute = (bundle.smtpRoutes || []).find(row => clean(row?.routeId || row?.id, 240) === routeId) || null;
  return { routeId, egressRoute, smtpRoute };
}

async function streamCorpusBatch({ corpusPath, cursor = 0, limit = 250, now = new Date() }) {
  const rows = [];
  let lineNumber = 0;
  let nextRunAt = null;
  const stream = fs.createReadStream(corpusPath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    lineNumber += 1;
    if (lineNumber <= cursor) continue;
    let packet;
    try { packet = JSON.parse(line); } catch { return failure([`packet-${lineNumber}:valid-json-required`]); }
    const notBefore = Date.parse(String(packet.notBefore || ''));
    if (!Number.isFinite(notBefore)) return failure([`packet-${lineNumber}:valid-not-before-required`]);
    if (notBefore > now.getTime()) {
      nextRunAt = new Date(notBefore).toISOString();
      break;
    }
    rows.push({ lineNumber, packet });
    if (rows.length >= limit) break;
  }
  return { ok: true, rows, cursor: rows.length ? rows[rows.length - 1].lineNumber : cursor, nextRunAt, eof: !nextRunAt && rows.length < limit };
}

export async function runOutreach100kBatch({
  store,
  enqueueJob,
  payload = {},
  cfg = {},
  bundlePath = process.env.OUTREACH_100K_BUNDLE_PATH || DEFAULT_OUTREACH_100K_BUNDLE_PATH,
  corpusPath = process.env.OUTREACH_100K_CORPUS_PATH || DEFAULT_OUTREACH_100K_CORPUS_PATH,
  now = new Date(),
  transportFactory = createUberSmtpSubmissionTransport
} = {}) {
  if (!store || typeof store.reserveOutboundSend !== 'function') return failure(['durable-outbound-store-required']);
  const prepared = await prepareOutreach100kRuntime({ bundlePath, corpusPath, liveSummary: payload.liveSummary || {}, now });
  if (!prepared.ok || prepared.certificate?.state !== 'CERTIFIED_100K_READY') {
    return failure(prepared.certificate?.hardStopReasonCodes || prepared.certificate?.waitReasonCodes || prepared.reasonCodes || ['certified-100k-ready-required'], { prepared });
  }
  if (clean(payload.certificateId, 300) && clean(payload.certificateId, 300) !== prepared.certificate.certificateId) {
    return failure(['launch-certificate-changed-since-founder-press'], { prepared });
  }
  if (clean(payload.recipientSetDigest, 300) && clean(payload.recipientSetDigest, 300) !== prepared.corpus.recipientSetDigest) {
    return failure(['recipient-set-changed-since-founder-press'], { prepared });
  }

  const bundleRead = await readBoundedJson(bundlePath);
  if (!bundleRead.ok) return bundleRead;
  const bundle = bundleRead.value;
  const batch = await streamCorpusBatch({
    corpusPath,
    cursor: int(payload.cursor, 0),
    limit: int(payload.limit, 250, 1, 1000),
    now
  });
  if (!batch.ok) return batch;

  let attempted = 0;
  let sent = 0;
  let refused = 0;
  let uncertain = 0;
  const receipts = [];

  for (const { lineNumber, packet } of batch.rows) {
    const mailboxId = clean(packet.mailboxId, 240);
    const mailbox = (bundle.mailboxes || []).find(row => clean(row?.mailboxId, 240) === mailboxId);
    const providerId = clean(packet.recipientProviderId, 120).toLowerCase();
    const recipientProvider = (bundle.recipientProviders || []).find(row => clean(row?.providerId, 120).toLowerCase() === providerId);
    const { egressRoute, smtpRoute } = routeFor(bundle, mailbox);
    if (!mailbox || !egressRoute || !smtpRoute || !recipientProvider) {
      refused += 1;
      receipts.push({ lineNumber, state: 'DISPATCH_REFUSED', reasonCodes: ['packet-runtime-route-binding-required'] });
      continue;
    }

    const launchDecision = packetLaunchDecision({ packet, bundle, mailbox, egressRoute, smtpRoute, recipientProvider, now });
    if (launchDecision.state !== OUTREACH_LAUNCH_STATES.READY) {
      refused += 1;
      receipts.push({ lineNumber, state: 'DISPATCH_REFUSED', reasonCodes: [...launchDecision.hardStopReasonCodes, ...launchDecision.waitReasonCodes] });
      continue;
    }

    const idempotencyKey = clean(packet.idempotencyKey, 500);
    const reservation = await store.reserveOutboundSend({
      idempotencyKey,
      prospectId: clean(packet.recipientId, 240) || null,
      campaignId: clean(packet.campaignId, 240),
      inbox: mailboxId,
      recipientEmail: clean(packet?.message?.to, 320).toLowerCase(),
      kind: 'initial',
      dailyCap: int(mailbox.observedColdDailyCap ?? mailbox.currentDailyCap, 0),
      hourlyCap: int(mailbox.observedColdHourlyCap ?? mailbox.currentHourlyCap, 0),
      minGapSeconds: int(mailbox.minGapSeconds, 0),
      now: now.toISOString()
    });
    if (!reservation.ok) {
      if (reservation.reason === 'duplicate-sent') {
        receipts.push({ lineNumber, state: 'ALREADY_PROVIDER_CONFIRMED', reservationId: reservation.reservation?.id || null });
        continue;
      }
      if (reservation.reason === 'duplicate-uncertain') {
        uncertain += 1;
        receipts.push({ lineNumber, state: 'DISPATCH_OUTCOME_UNCERTAIN', reasonCodes: ['prior-uncertain-reservation-requires-reconciliation'] });
        break;
      }
      refused += 1;
      receipts.push({ lineNumber, state: 'DISPATCH_REFUSED', reasonCodes: [reservation.reason || 'reservation-refused'] });
      continue;
    }

    attempted += 1;
    await store.markOutboundReservation(reservation.reservation.id, 'dispatching');
    const transport = transportFactory({
      host: smtpRoute.host,
      port: smtpRoute.port,
      secure: smtpRoute.secure !== false,
      username: clean(process.env[clean(smtpRoute.usernameEnv, 120)] || smtpRoute.username || '', 500),
      password: String(process.env[clean(smtpRoute.passwordEnv, 120)] || smtpRoute.password || ''),
      authorized: smtpRoute.authorized === true,
      termsCompatible: smtpRoute.termsCompatible === true,
      evidenceRef: smtpRoute.evidenceRef
    });
    if (!transport?.ok || typeof transport.send !== 'function') {
      await store.markOutboundReservation(reservation.reservation.id, 'cancelled', { reason: 'smtp-transport-not-ready' });
      refused += 1;
      receipts.push({ lineNumber, state: 'DISPATCH_REFUSED', reasonCodes: transport?.reasonCodes || ['smtp-transport-not-ready'] });
      continue;
    }

    const result = await dispatchGovernedOutreach({
      launchDecision,
      authorization: dispatchAuthorization(packet),
      message: {
        ...packet.message,
        from: clean(packet?.message?.from || mailbox.address, 320).toLowerCase(),
        campaignId: clean(packet.campaignId, 240)
      },
      transportAdapter: transport,
      idempotencyKey,
      now
    });

    const observedAt = new Date().toISOString();
    if (result.ok && result.state === 'PROVIDER_CONFIRMED_SEND') {
      sent += 1;
      await store.markOutboundReservation(reservation.reservation.id, 'sent', { sentAt: observedAt, providerReceiptId: result.providerReceiptId, dispatchId: result.dispatchId });
      if (typeof store.recordOutboundEvent === 'function') {
        await store.recordOutboundEvent({ inbox: mailboxId, eventType: 'sent', prospectId: clean(packet.recipientId, 240) || null, recipientEmail: clean(packet.message.to, 320), detail: { providerReceiptId: result.providerReceiptId, dispatchId: result.dispatchId } }, {
          hardBouncePauseThreshold: cfg.outbound?.hardBouncePauseThreshold,
          complaintPauseThreshold: cfg.outbound?.complaintPauseThreshold,
          failurePauseThreshold: cfg.outbound?.failurePauseThreshold
        });
      }
      receipts.push({ ...result, observedAt, lineNumber });
      continue;
    }

    if (result.state === 'DISPATCH_OUTCOME_UNCERTAIN') {
      uncertain += 1;
      await store.markOutboundReservation(reservation.reservation.id, 'uncertain', { providerReceiptId: result.providerReceiptId || null, dispatchId: result.dispatchId || null, error: result.error || '' });
      if (typeof store.recordOutboundEvent === 'function') {
        await store.recordOutboundEvent({ inbox: mailboxId, eventType: 'send_uncertain', prospectId: clean(packet.recipientId, 240) || null, recipientEmail: clean(packet.message.to, 320), detail: { dispatchId: result.dispatchId || null } }, {
          hardBouncePauseThreshold: cfg.outbound?.hardBouncePauseThreshold,
          complaintPauseThreshold: cfg.outbound?.complaintPauseThreshold,
          failurePauseThreshold: cfg.outbound?.failurePauseThreshold
        });
      }
      receipts.push({ ...result, observedAt, lineNumber });
      break;
    }

    refused += 1;
    await store.markOutboundReservation(reservation.reservation.id, 'cancelled', { reason: (result.reasonCodes || []).join(',') });
    receipts.push({ ...result, observedAt, lineNumber });
  }

  const nextCursor = batch.rows.length ? batch.rows[batch.rows.length - 1].lineNumber : int(payload.cursor, 0);
  let nextJob = null;
  if (uncertain === 0 && typeof enqueueJob === 'function' && (!batch.eof || batch.nextRunAt)) {
    const runAt = batch.nextRunAt || new Date(Date.now() + 60_000).toISOString();
    nextJob = await enqueueJob('outreach.100k.process', {
      cursor: nextCursor,
      limit: int(payload.limit, 250, 1, 1000),
      certificateId: prepared.certificate.certificateId,
      recipientSetDigest: prepared.corpus.recipientSetDigest,
      founderPressReceiptId: clean(payload.founderPressReceiptId, 300)
    }, {
      maxAttempts: 3,
      runAt,
      dedupeKey: `outreach100k:${prepared.certificate.certificateId}:${nextCursor}`
    });
  }

  return {
    ok: uncertain === 0,
    version: OUTREACH_100K_RUNTIME_VERSION,
    status: uncertain ? 'OUTREACH_100K_QUARANTINED_UNCERTAIN' : batch.eof && !batch.nextRunAt ? 'OUTREACH_100K_BATCH_STREAM_COMPLETE' : 'OUTREACH_100K_BATCH_PROCESSED',
    certificateId: prepared.certificate.certificateId,
    recipientSetDigest: prepared.corpus.recipientSetDigest,
    cursorStart: int(payload.cursor, 0),
    cursorEnd: nextCursor,
    attempted,
    sent,
    refused,
    uncertain,
    receipts,
    nextJobId: nextJob?.id || null,
    nextRunAt: batch.nextRunAt || null,
    automaticRetryAuthorized: false,
    truthBoundary: 'Each batch re-certifies current 100K readiness and each packet re-runs the final launch gate. Any ambiguous provider outcome quarantines the stream; no blind retry is authorized.'
  };
}
