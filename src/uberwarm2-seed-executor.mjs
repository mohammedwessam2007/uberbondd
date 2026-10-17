import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { compilePlacementReport, normalizePlacementObservation } from './uberplacement.mjs';
import { canonicalRecipientKey } from './outbound-send-authorization.mjs';
import { issueSendCapability, revokeSendCapability } from './uberwarm2-send-capability.mjs';
import { UBERWARM2_SEED_TEMPLATE } from './uberwarm2-seed-template.mjs';
export { UBERWARM2_SEED_TEMPLATE } from './uberwarm2-seed-template.mjs';

export const UBERWARM2_SEED_EXECUTION_VERSION = 'uberbond.uberwarm2-seed-execution.v1';
const email = value => String(value ?? '').trim().toLowerCase();
const text = (value, limit = 256) => String(value ?? '').trim().slice(0, limit);
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Exact-form validators. Trimming and truncation are not repairs: a value that
// is not already in canonical form is refused, never normalized into a match.
const PROBE_ID = /^[A-Za-z0-9._:-]{1,250}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
// Strict ASCII address: no comma, angle bracket, whitespace, quote or invisible character.
const STRICT_EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+$/;
// The only content an owner-controlled seed test may send. Compile renders from
// it and execution re-renders from it, so a body or subject edited after
// compile cannot reach the transport.
export const UBERWARM2_SEED_TEMPLATE_DIGEST = `sha256:${sha(UBERWARM2_SEED_TEMPLATE)}`;
const renderSeedContent = probeId => ({
  subject: UBERWARM2_SEED_TEMPLATE.subject,
  body: `${UBERWARM2_SEED_TEMPLATE.bodyPrefix}${probeId}`
});
// Batch rows are hashed in this field order, which matches compile output.
const ROW_FIELDS = [
  'probeId', 'senderEmail', 'seedEmail', 'seedProvider', 'bodyToken',
  'permissionExpiresAt', 'subject', 'body', 'scope', 'providerEngagementClaim'
];

// Thrown by the snapshot readers so a hostile value becomes a typed refusal.
class SnapshotRefusal extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const reasonOf = error => (error instanceof SnapshotRefusal ? error.code : 'snapshot-refused');

// Reads a data property without invoking any getter. An accessor anywhere on
// the prototype chain is refused, so a value cannot differ between two reads.
function dataField(source, key) {
  for (let o = source; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    const d = Object.getOwnPropertyDescriptor(o, key);
    if (d) {
      if (d.get || d.set) throw new SnapshotRefusal(`accessor-bearing-${key}`);
      return d.value;
    }
  }
  return undefined;
}

// A snapshotted field must be a primitive, never an object or function.
function primitiveField(source, key) {
  const value = dataField(source, key);
  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    throw new SnapshotRefusal(`non-primitive-${key}`);
  }
  return value;
}

function snapshotApproval(approval) {
  if (approval === null || typeof approval !== 'object' || Array.isArray(approval)) {
    throw new SnapshotRefusal('approval-not-an-object');
  }
  const rawScopes = dataField(approval, 'scopes');
  const scopes = [];
  if (rawScopes !== undefined) {
    if (!Array.isArray(rawScopes)) throw new SnapshotRefusal('approval-scopes-not-array');
    for (let i = 0; i < rawScopes.length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(rawScopes, i);
      if (!d || d.get || d.set || typeof d.value !== 'string' || d.value.length > 120) {
        throw new SnapshotRefusal('approval-scope-not-plain-string');
      }
      scopes.push(d.value);
    }
  }
  return Object.freeze({
    granted: primitiveField(approval, 'granted'),
    grantedBy: primitiveField(approval, 'grantedBy'),
    batchDigest: primitiveField(approval, 'batchDigest'),
    templateDigest: primitiveField(approval, 'templateDigest'),
    probeId: primitiveField(approval, 'probeId'),
    expiresAt: primitiveField(approval, 'expiresAt'),
    evidenceRef: primitiveField(approval, 'evidenceRef'),
    proof: primitiveField(approval, 'proof'),
    scopes: Object.freeze(scopes)
  });
}

// The batch is read once into plain data. Its digest is then checked against
// that snapshot, so the checks and the transmitted rows cannot diverge.
function snapshotBatch(batch) {
  if (batch === null || typeof batch !== 'object') throw new SnapshotRefusal('batch-not-an-object');
  const rawProbes = dataField(batch, 'probes');
  if (!Array.isArray(rawProbes)) throw new SnapshotRefusal('batch-probes-not-array');
  const probes = [];
  for (let i = 0; i < rawProbes.length; i += 1) {
    const d = Object.getOwnPropertyDescriptor(rawProbes, i);
    if (!d || d.get || d.set) throw new SnapshotRefusal('batch-row-accessor-or-hole');
    const row = d.value;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      throw new SnapshotRefusal('batch-row-not-an-object');
    }
    const plain = {};
    for (const field of ROW_FIELDS) {
      const value = primitiveField(row, field);
      if (value !== undefined) plain[field] = value;
    }
    probes.push(plain);
  }
  return Object.freeze({
    ok: primitiveField(batch, 'ok'),
    createdAt: primitiveField(batch, 'createdAt'),
    batchDigest: primitiveField(batch, 'batchDigest'),
    probes: Object.freeze(probes)
  });
}

// The signature covers one canonical value per field. The expiry is the single
// parsed instant, so no unsigned suffix can carry a different expiry.
function signedApprovalPayload(snap, expiresAtMs) {
  const exact = value => (typeof value === 'string' ? value : '');
  return JSON.stringify({
    granted: snap.granted === true,
    grantedBy: exact(snap.grantedBy),
    batchDigest: exact(snap.batchDigest),
    templateDigest: exact(snap.templateDigest),
    probeId: exact(snap.probeId),
    expiresAt: expiresAtMs === null ? exact(snap.expiresAt) : new Date(expiresAtMs).toISOString(),
    evidenceRef: exact(snap.evidenceRef),
    scopes: [...new Set(snap.scopes)].sort()
  });
}

export function createUberWarm2SeedApprovalProof({ approval = {}, verificationKey = '' } = {}) {
  if (typeof verificationKey !== 'string' || verificationKey.length < 32)
    throw new Error('server-held-seed-approval-signing-key-required');
  const snap = snapshotApproval(approval);
  return createHmac('sha256', verificationKey)
    .update(signedApprovalPayload(snap, canonicalUtcMs(snap.expiresAt)))
    .digest('hex');
}

function verifiedSignedApproval(snap, verificationKey, expiresAtMs) {
  if (typeof verificationKey !== 'string' || verificationKey.length < 32 ||
    typeof snap.proof !== 'string' || !/^[a-f0-9]{64}$/.test(snap.proof))
    return false;
  const expected = Buffer.from(
    createHmac('sha256', verificationKey).update(signedApprovalPayload(snap, expiresAtMs)).digest('hex'), 'hex'
  );
  const actual = Buffer.from(snap.proof, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// The one accepted expiry form: canonical UTC, at most 40 characters, and a
// real calendar instant (a rolled-over date such as 02-30 is refused).
function canonicalUtcMs(value) {
  if (typeof value !== 'string' || value.length > 40 || !UTC_INSTANT.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19) ? ms : null;
}

// A clock is a finite, positive epoch time. Null, false, 0 and epoch 0 are not times.
function clockMs(value) {
  let ms = NaN;
  if (value instanceof Date) ms = value.getTime();
  else if (typeof value === 'number') ms = value;
  else if (typeof value === 'string') ms = Date.parse(value);
  const time = new Date(ms).getTime();
  return Number.isFinite(time) && time > 0 ? time : null;
}

function strictEmail(value) {
  return typeof value === 'string' && value.length <= 254 && STRICT_EMAIL.test(value) ? value.toLowerCase() : null;
}

// A mailbox row names one address. When it names two, they must agree exactly.
function rowAddress(row) {
  const address = row?.address;
  const mailbox = row?.email;
  const hasAddress = address !== undefined && address !== null && address !== '';
  const hasMailbox = mailbox !== undefined && mailbox !== null && mailbox !== '';
  if (hasAddress && hasMailbox && strictEmail(address) !== strictEmail(mailbox)) return null;
  return hasAddress ? strictEmail(address) : hasMailbox ? strictEmail(mailbox) : null;
}

// Kill flags are exact: only an explicit false, or an absent flag, clears a sender.
const flagClear = value => value === undefined || value === false;
const senderHealthCleared = sender => flagClear(sender.paused) &&
  flagClear(sender.quarantined) && flagClear(sender.placementQuarantine);

const utcDay = date => new Date(date).toISOString().slice(0, 10);
const finiteTime = date => { const n = new Date(date).getTime(); return Number.isFinite(n) ? n : null; };
const denied = (status, reasonCodes) => Object.freeze({
  ok: false, status, reasonCodes, externalEffectAuthority: 'NONE',
  providerSubmissions: 0, verifiedPlacements: 0
});
// The plan and any approval for it expire together, 45 minutes after compile.
const SEED_PLAN_WINDOW_MS = 45 * 60 * 1000;

/**
 * Compile only verifiably owner-controlled, consenting seed destinations.
 * No prospect address can be introduced through this interface.
 * This is a PLAN, not a reputation-generating conversation network.
 */
export function compileUberWarm2SeedBatch({
  placementPlan = {}, mailboxes = [], seedInboxes = [], now = new Date(),
  maxSeedsPerSender = 2, maxBatch = 100
} = {}) {
  const at = clockMs(now);
  if (at === null) return denied('UBERWARM2_BATCH_REFUSED', ['invalid-clock']);
  const senderRows = (Array.isArray(mailboxes) ? mailboxes : [])
    .map(row => ({ row, address: rowAddress(row) }))
    .filter(x => x.address);
  const seedRows = (Array.isArray(seedInboxes) ? seedInboxes : [])
    .map(row => ({ row, address: strictEmail(row?.email) }))
    .filter(x => x.address);
  const senderAddresses = senderRows.map(x => x.address);
  const seedAddresses = seedRows.map(x => x.address);
  const senderKeys = senderAddresses.map(address => canonicalRecipientKey(address));
  const seedKeys = seedAddresses.map(address => canonicalRecipientKey(address));
  // A repeated address would let the last row silently shadow the first, so the
  // outcome would depend on array order. Refuse the whole batch instead.
  const batchRefusals = [];
  if (new Set(senderAddresses).size !== senderAddresses.length) batchRefusals.push('duplicate-sender-address');
  if (new Set(seedAddresses).size !== seedAddresses.length) batchRefusals.push('duplicate-seed-address');
  if (seedAddresses.some(address => senderAddresses.includes(address))) batchRefusals.push('seed-is-also-active-sender');
  // Aliases (plus tags, Gmail dots, case) reach the same mailbox under another spelling.
  if (new Set(seedKeys).size !== seedKeys.length) batchRefusals.push('seed-alias-duplicate');
  if (seedKeys.some(key => senderKeys.includes(key))) batchRefusals.push('seed-alias-collides-with-sender');
  if (batchRefusals.length) return denied('UBERWARM2_BATCH_REFUSED', batchRefusals);
  const senderMap = new Map(senderRows.map(x => [x.address, x.row]));
  const seedMap = new Map(seedRows.map(x => [x.address, x.row]));
  const source = Array.isArray(placementPlan?.probes) ? placementPlan.probes : [];
  const limit = Math.min(100, Math.max(1, Math.floor(Number(maxBatch) || 100)));
  const senderLimit = Math.min(4, Math.max(1, Math.floor(Number(maxSeedsPerSender) || 2)));
  const counts = new Map();
  const rejections = [];
  const seen = new Set();
  const probes = [];
  for (const probe of source) {
    const probeId = probe?.probeId;
    const probeIdOk = typeof probeId === 'string' && PROBE_ID.test(probeId);
    const senderEmail = strictEmail(probe?.senderEmail);
    const seedEmail = strictEmail(probe?.seedEmail);
    const sender = senderEmail ? senderMap.get(senderEmail) : undefined;
    const seed = seedEmail ? seedMap.get(seedEmail) : undefined;
    const reasons = [];
    if (!probeIdOk) reasons.push('probe-id-invalid');
    else if (seen.has(probeId)) reasons.push('missing-or-repeated-probe-id');
    if (probe?.authority !== 'PLAN_ONLY' || probe?.sendAuthorized !== false) reasons.push('non-plan-only-probe');
    if (probe?.bodyToken !== probeId) reasons.push('body-correlation-token-mismatch');
    if (!senderEmail) reasons.push('probe-sender-not-strict-address');
    if (typeof probe?.seedProvider !== 'string') reasons.push('seed-provider-not-string');
    if (!sender || sender.authenticationStatus !== 'AUTHENTICATED' || !senderHealthCleared(sender)) {
      reasons.push('sender-not-health-cleared');
    }
    // Each sender must carry explicit DNS, transport and provider-policy evidence.
    if (sender && sender.dnsAuthenticated !== true) reasons.push('sender-dns-authentication-required');
    if (sender && sender.transportAuthorized !== true) reasons.push('sender-transport-not-authorized');
    if (sender && sender.providerPolicyCompatible !== true) reasons.push('sender-provider-policy-incompatible');
    const permissionUntil = canonicalUtcMs(seed?.permissionExpiresAt);
    const consentRef = seed?.consentEvidenceRef;
    if (!seed || seed.ownerControlled !== true || seed.receiveReady !== true ||
        seed.consentToTest !== true || typeof consentRef !== 'string' || !consentRef.trim() ||
        consentRef.length > 500 || permissionUntil === null || permissionUntil <= at) {
      reasons.push('recipient-not-proven-consenting-owned-seed');
    }
    if (senderEmail && senderEmail === seedEmail) reasons.push('self-send-not-accepted-as-seed-evidence');
    if ((counts.get(senderEmail) || 0) >= senderLimit) reasons.push('per-sender-batch-limit');
    if (probes.length >= limit) reasons.push('global-batch-limit');
    if (reasons.length) {
      rejections.push({ probeId: probeIdOk ? probeId : null, reasonCodes: reasons });
      continue;
    }
    const content = renderSeedContent(probeId);
    const row = Object.freeze({
      probeId, senderEmail, seedEmail,
      seedProvider: text(probe.seedProvider, 80).toLowerCase(),
      bodyToken: probeId,
      permissionExpiresAt: new Date(permissionUntil).toISOString(),
      subject: content.subject,
      body: content.body,
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
 *
 * Time: the execution clock is `clock` (a function returning epoch ms) when
 * supplied, otherwise the wall clock. It is read at entry and again after every
 * await. A caller-supplied `now` is NOT used here: it is a claim by the caller,
 * and the adversarial review replayed a 43-hour-old plan under it. `now` remains
 * only the compile-time label on a plan.
 */
export async function executeUberWarm2SeedProbe({
  batch, probeId, approval, approvalVerificationKey = '', store, transport,
  verifyCurrentSenderHealth, verifyCurrentSeedConsent, clock
} = {}) {
  if (clock !== undefined && typeof clock !== 'function') return denied('UBERWARM2_EXECUTION_REFUSED', ['invalid-clock']);
  const readClock = () => {
    try {
      return clockMs(clock !== undefined ? clock() : Date.now());
    } catch {
      return null;
    }
  };
  const at = readClock();
  if (at === null) return denied('UBERWARM2_EXECUTION_REFUSED', ['invalid-clock']);
  let snap;
  try { snap = snapshotBatch(batch); }
  catch (refusal) { return denied('UBERWARM2_EXECUTION_REFUSED', ['invalid-batch-or-clock', reasonOf(refusal)]); }
  if (snap.ok !== true || !Array.isArray(snap.probes)) return denied('UBERWARM2_EXECUTION_REFUSED', ['invalid-batch-or-clock']);
  const canonical = { version: UBERWARM2_SEED_EXECUTION_VERSION, createdAt: snap.createdAt, probes: snap.probes };
  if (snap.batchDigest !== `sha256:${sha(canonical)}`) return denied('UBERWARM2_EXECUTION_REFUSED', ['batch-digest-invalid']);
  const createdMs = canonicalUtcMs(snap.createdAt);
  const batchAge = createdMs === null ? NaN : at - createdMs;
  if (!Number.isFinite(batchAge) || batchAge < 0 || batchAge > SEED_PLAN_WINDOW_MS) {
    return denied('UBERWARM2_EXECUTION_REFUSED', ['batch-expired']);
  }
  if (typeof probeId !== 'string' || !PROBE_ID.test(probeId)) return denied('UBERWARM2_EXECUTION_REFUSED', ['probe-id-invalid']);
  const matches = snap.probes.filter(x => x.probeId === probeId);
  if (matches.length !== 1) return denied('UBERWARM2_EXECUTION_REFUSED', ['probe-not-in-immutable-batch']);
  const probe = matches[0];
  let approvalSnap;
  try { approvalSnap = snapshotApproval(approval); }
  catch (refusal) {
    return denied('UBERWARM2_OWNER_APPROVAL_REQUIRED', ['exact-unexpired-seed-test-authorization-required', reasonOf(refusal)]);
  }
  const scopes = approvalSnap.scopes;
  const expiresAtMs = canonicalUtcMs(approvalSnap.expiresAt);
  const { grantedBy, evidenceRef } = approvalSnap;
  if (approvalSnap.granted !== true || typeof grantedBy !== 'string' || !grantedBy.trim() || grantedBy.length > 120 ||
      (evidenceRef !== undefined && evidenceRef !== null && (typeof evidenceRef !== 'string' || evidenceRef.length > 500)) ||
      !scopes.includes('uberwarm2:owner-controlled-seed-test') ||
      approvalSnap.batchDigest !== snap.batchDigest ||
      approvalSnap.templateDigest !== UBERWARM2_SEED_TEMPLATE_DIGEST ||
      approvalSnap.probeId !== probe.probeId ||
      expiresAtMs === null || expiresAtMs <= at ||
      !verifiedSignedApproval(approvalSnap, approvalVerificationKey, expiresAtMs)) {
    return denied('UBERWARM2_OWNER_APPROVAL_REQUIRED', ['exact-unexpired-seed-test-authorization-required']);
  }
  // An approval may not outlive the plan it authorizes.
  if (expiresAtMs > createdMs + SEED_PLAN_WINDOW_MS) {
    return denied('UBERWARM2_OWNER_APPROVAL_REQUIRED', ['approval-exceeds-45-minute-plan-window']);
  }
  // The digest is unkeyed, so a recomputed digest proves nothing about the row
  // itself. Re-validate every field the send depends on before any claim.
  const content = renderSeedContent(probe.probeId);
  const rowReasons = [];
  if (strictEmail(probe.senderEmail) === null) rowReasons.push('sender-email-not-strict-address');
  if (strictEmail(probe.seedEmail) === null) rowReasons.push('seed-email-not-strict-address');
  if (strictEmail(probe.senderEmail) !== null && strictEmail(probe.senderEmail) === strictEmail(probe.seedEmail)) {
    rowReasons.push('self-send-not-accepted-as-seed-evidence');
  }
  if (probe.bodyToken !== probe.probeId) rowReasons.push('body-correlation-token-mismatch');
  if (typeof probe.seedProvider !== 'string') rowReasons.push('seed-provider-not-string');
  if (canonicalUtcMs(probe.permissionExpiresAt) === null) rowReasons.push('permission-expiry-not-canonical-utc');
  if (probe.subject !== content.subject || probe.body !== content.body) rowReasons.push('probe-content-not-approved-template');
  if (rowReasons.length) return denied('UBERWARM2_EXECUTION_REFUSED', rowReasons);
  if (!store || typeof store.claimOnceAndEnforceCaps !== 'function' || typeof store.finalize !== 'function')
    return denied('UBERWARM2_DURABLE_LEDGER_REQUIRED', ['atomic-reservation-and-caps-adapter-required']);
  if (!transport || (typeof transport !== 'object' && typeof transport !== 'function'))
    return denied('UBERWARM2_TRANSPORT_REQUIRED', ['owner-approved-smtp-adapter-required']);
  // Read the adapter's identity and send function once. An accessor could answer
  // "bound to this sender" on the check and another address on the send.
  let sendOwnedSeed;
  let authorizedSmtp;
  let authorizedHttpsApi;
  let transportKind;
  let boundSender;
  try {
    sendOwnedSeed = dataField(transport, 'sendOwnedSeed');
    authorizedSmtp = primitiveField(transport, 'authorizedSmtp');
    authorizedHttpsApi = primitiveField(transport, 'authorizedHttpsApi');
    transportKind = primitiveField(transport, 'transportKind');
    boundSender = primitiveField(transport, 'boundSender');
  } catch (refusal) {
    return denied('UBERWARM2_TRANSPORT_REQUIRED', ['transport-not-bound-to-probe-sender', reasonOf(refusal)]);
  }
  if (typeof sendOwnedSeed !== 'function') return denied('UBERWARM2_TRANSPORT_REQUIRED', ['owner-approved-smtp-adapter-required']);
  // The adapter must declare that it is authorized and bound to this probe's
  // sender. Checking only that a send function exists would let any adapter
  // submit as any sender.
  const smtpMode = authorizedSmtp === true && authorizedHttpsApi !== true && (transportKind === undefined || transportKind === 'SMTP');
  const httpsMode = authorizedHttpsApi === true && authorizedSmtp !== true && transportKind === 'WINNR_INBOX_HTTPS_API';
  if ((!smtpMode && !httpsMode) || strictEmail(boundSender) === null || strictEmail(boundSender) !== strictEmail(probe.senderEmail)) {
    return denied('UBERWARM2_TRANSPORT_REQUIRED', ['transport-not-bound-to-probe-sender']);
  }
  // Immutable approval alone cannot override a quarantine or recipient
  // withdrawal that occurred after the original manifest was compiled.
  // Fresh truth must come from protected live provider + opt-in registries.
  // Consent that lapsed after compile is not renewed by the approval.
  const permissionMs = canonicalUtcMs(probe.permissionExpiresAt);
  if (permissionMs === null || permissionMs <= at) return denied('UBERWARM2_LIVE_PREFLIGHT_REFUSED', ['recipient-permission-expired']);
  // Expiry is re-read after each await and after the durable claim. A lapse
  // stops the send, and an unreadable clock fails closed.
  const lapsed = (extra = []) => {
    const t = readClock();
    if (t === null) return denied('UBERWARM2_EXECUTION_REFUSED', ['clock-unreadable-before-transmission', ...extra]);
    if (expiresAtMs <= t) return denied('UBERWARM2_OWNER_APPROVAL_REQUIRED', ['approval-expired-before-transmission', ...extra]);
    if (permissionMs <= t) return denied('UBERWARM2_LIVE_PREFLIGHT_REFUSED', ['recipient-permission-expired', ...extra]);
    return null;
  };
  let senderFresh = false;
  let consentFresh = false;
  try {
    senderFresh = typeof verifyCurrentSenderHealth === 'function' &&
      await verifyCurrentSenderHealth(probe.senderEmail, at) === true;
  } catch {}
  const afterSender = lapsed();
  if (afterSender) return afterSender;
  try {
    consentFresh = typeof verifyCurrentSeedConsent === 'function' &&
      await verifyCurrentSeedConsent(probe.seedEmail, probe.probeId, at) === true;
  } catch {}
  const afterConsent = lapsed();
  if (afterConsent) return afterConsent;
  if (!senderFresh || !consentFresh) {
    return denied('UBERWARM2_LIVE_PREFLIGHT_REFUSED', [
      ...(!senderFresh ? ['fresh-sender-health-or-quarantine-evidence-required'] : []),
      ...(!consentFresh ? ['fresh-recipient-consent-evidence-required'] : [])
    ]);
  }
  // Keyed on probe identity, not on the batch digest: a recompiled plan
  // changes createdAt and therefore the digest, but not the probe it sends.
  const reservationKey = `uberwarm2-seed:${sha(['probe-identity', probe.probeId, probe.senderEmail, probe.seedEmail])}`;
  const reservation = {
    reservationKey, probeId: probe.probeId, batchDigest: snap.batchDigest,
    senderEmail: probe.senderEmail, seedEmail: probe.seedEmail,
    senderDailyLimit: 2, seedDailyLimit: 1, globalDailyLimit: 100, quotaWindow: utcDay(at),
    rollingWindowHours: 24, claimedAt: new Date(at).toISOString(),
    effectClass: 'OWNER_CONTROLLED_PLACEMENT_PROBE',
    evidenceRef: evidenceRef?.trim() || null
  };
  let claim;
  try { claim = await store.claimOnceAndEnforceCaps(reservation); }
  catch { return denied('UBERWARM2_RESERVATION_UNKNOWN', ['durable-reservation-outcome-uncertain-no-retry']); }
  if (claim?.ok !== true || claim?.claimed !== true || claim?.capsEnforced !== true ||
      claim?.reservationKey !== reservationKey)
    return denied('UBERWARM2_PROBE_NOT_CLAIMED', [text(claim?.reason, 100) || 'replayed-or-quota-rejected']);
  // The claim is durable from here. A lapse now consumes it without transmission.
  const afterClaim = lapsed(['claim-consumed-no-transmission-no-retry']);
  if (afterClaim) return afterClaim;
  // A durable claim may wait on another worker's database lock. Health or
  // consent can change during that wait; never spend pre-claim observations.
  for (const [verify, args, reason] of [
    [verifyCurrentSenderHealth, [probe.senderEmail], 'sender-health-changed-after-reservation'],
    [verifyCurrentSeedConsent, [probe.seedEmail, probe.probeId], 'seed-consent-changed-after-reservation']
  ]) {
    let cleared = false;
    try { cleared = await verify(...args, readClock()) === true; } catch {}
    const expired = lapsed(['claim-consumed-no-transmission-no-retry']);
    if (expired) return expired;
    if (!cleared) return denied('UBERWARM2_LIVE_PREFLIGHT_REFUSED', [reason, 'claim-consumed-no-transmission-no-retry']);
  }
  // One-shot authority for exactly this transmission. Issuance fails only if a
  // capability for this key already exists in this process; nothing is sent then.
  // The capability is bound to this exact send, so it cannot be spent on any other.
  const sendArgs = {
    from: probe.senderEmail, to: probe.seedEmail, subject: content.subject,
    body: content.body, probeId: probe.probeId,
    reservationKey, permittedPurpose: 'OWNER_CONTROLLED_PLACEMENT_PROBE'
  };
  try { issueSendCapability(reservationKey, sendArgs); }
  catch { return denied('UBERWARM2_EXECUTION_REFUSED', ['send-capability-not-issued-no-transmission', 'claim-consumed-no-retry']); }
  // Once claimed, ANY failure/timeout remains uncertain until external reconciliation.
  let outcome;
  try {
    outcome = await sendOwnedSeed.call(transport, sendArgs);
  } catch {
    outcome = { ok: false, status: 'OUTCOME_UNCERTAIN' };
  } finally {
    revokeSendCapability(reservationKey);
  }
  // A getter that throws after the provider accepted the message is an uncertain
  // outcome, not a rejection that would skip the ledger finalization below.
  let submitted = false;
  let providerMessageId = null;
  try {
    const ok = outcome?.ok;
    const accepted = outcome?.accepted;
    const messageId = outcome?.messageId;
    if (ok === true && accepted === true && typeof messageId === 'string' && messageId.trim().length > 0) {
      submitted = true;
      providerMessageId = text(messageId, 500);
    }
  } catch {
    submitted = false;
    providerMessageId = null;
  }
  const receipt = Object.freeze({
    version: UBERWARM2_SEED_EXECUTION_VERSION,
    status: submitted ? (httpsMode ? 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN' : 'SMTP_ACCEPTED_PLACEMENT_UNKNOWN') : 'SUBMISSION_OUTCOME_UNCERTAIN',
    reservationKey, probeId: probe.probeId, batchDigest: snap.batchDigest,
    senderEmail: probe.senderEmail, seedEmail: probe.seedEmail,
    providerMessageId: submitted ? providerMessageId : null,
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
  batch = {}, receipts = [], receivingObservations = [], verifyReceivingObservation, now = new Date()
} = {}) {
  if (!batch?.ok || !Array.isArray(batch.probes)) return denied('UBERWARM2_EVIDENCE_REFUSED', ['valid-seed-batch-required']);
  const canonical = { version: UBERWARM2_SEED_EXECUTION_VERSION, createdAt: batch.createdAt, probes: batch.probes };
  if (batch.batchDigest !== `sha256:${sha(canonical)}`) return denied('UBERWARM2_EVIDENCE_REFUSED', ['batch-digest-invalid']);
  const receiptsByProbe = new Map((Array.isArray(receipts) ? receipts : [])
    .filter(r => ['SMTP_ACCEPTED_PLACEMENT_UNKNOWN', 'PROVIDER_ACCEPTED_PLACEMENT_UNKNOWN'].includes(r?.status) && r?.batchDigest === batch.batchDigest &&
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
    // Text references supplied by the caller are not independent proof. A
    // server-side trusted OAuth/IMAP connector must verify this exact claim.
    let verified=false;
    try { verified=typeof verifyReceivingObservation === 'function' &&
      verifyReceivingObservation({observation:obs,probe,receipt}) === true; } catch {}
    if(!verified)reasons.push('authenticated-receiving-provider-verification-required');
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
    // Preserve the validated wrapper, rather than passing its inner row.
    accepted.push(normalized);
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
