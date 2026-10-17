// LANE P donor: protected-runtime readiness preflight compiler.
//
// Pure, side-effect-free and dependency-injected. It combines *sanitized,
// externally verified* evidence about the protected UberWarm2 runtime into one
// fail-closed readiness report. It opens no socket, reads no credential, touches
// no database, mints no approval and performs no provider or production action.
//
// Hard doctrine encoded here:
//   - Readiness docs, source code, PR text and passing tests are NEVER runtime
//     proof. They are classified SOURCE_ONLY and can never satisfy a gate.
//   - Only fresh AUTHENTICATED_CURRENT evidence with an immutable reference
//     counts. Everything else is UNKNOWN and blocks readiness.
//   - Historical Neon restore cannot be replayed as current runtime proof, and
//     source-level Render protection cannot be claimed from the repository.
//   - Any old, stale, missing or unsigned datum yields ready:false with precise
//     action items. No synthetic approval, no POST, no prod action is emitted.
import { createHash } from 'node:crypto';

export const UBERWARM2_PROTECTED_RUNTIME_PREFLIGHT_VERSION =
  'uberbond.uberwarm2-protected-runtime-preflight.v1';

export const TRUTH_CLASSES = Object.freeze({
  SOURCE_ONLY: 'SOURCE_ONLY',
  AUTHENTICATED_CURRENT: 'AUTHENTICATED_CURRENT',
  UNKNOWN: 'UNKNOWN',
});

const MAX_AGE_MS = 15 * 60 * 1000;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{3})?Z$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = v => (typeof v === 'string' && v.trim() ? v.trim() : '');
const refDigest = ref => `sha256:${createHash('sha256').update(String(ref)).digest('hex')}`;

function canonicalUtcMs(value) {
  if (typeof value !== 'string') return null;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === match[1] ? ms : null;
}

// Each requirement states the single claim that must be independently verified,
// the reason a verified claim still fails, and the corrective action item.
const REQUIREMENTS = Object.freeze([
  { key: 'authoritativeSourceDbContinuity', id: 'authoritative-source-db-continuity',
    failure: 'authoritative-source-continuity-unverified',
    action: 'supply independently verified authoritative source-database continuity evidence',
    claim: e => e.authoritative === true && e.continuityVerified === true &&
      e.sourceCurrent === true && e.writerContinuityVerified === true && e.pointInTimeOnly === false },
  { key: 'restrictedNeonRole', id: 'restricted-neon-role',
    failure: 'neon-role-not-restricted',
    action: 'record the restricted least-privilege Neon runtime role from the live provider',
    claim: e => e.roleRestricted === true && e.leastPrivilege === true && !!str(e.roleName) },
  { key: 'originalKeyEncryptionCompatibility', id: 'original-key-encryption-compatibility',
    failure: 'original-key-encryption-incompatible',
    action: 'prove original-key encryption compatibility against retained key material',
    claim: e => e.originalKeyEncryptionCompatible === true && Array.isArray(e.verifiedKeyIds) &&
      e.verifiedKeyIds.length > 0 && e.verifiedKeyIds.every(k => !!str(k)) },
  { key: 'oneShotMigrationReceipts', id: 'one-shot-migration-receipts',
    failure: 'one-shot-migration-receipts-absent',
    action: 'attach one-shot migration receipts that were never replayed',
    claim: e => e.oneShot === true && Array.isArray(e.receiptIds) && e.receiptIds.length > 0 &&
      e.receiptIds.every(r => !!str(r)) && e.replayDetected !== true },
  { key: 'ledgerTransactionVersion', id: 'ledger-transaction-version',
    failure: 'ledger-transaction-version-unverified',
    action: 'report the current ledger transaction version from the live ledger',
    claim: e => e.ledgerVersionVerified === true && Number.isInteger(e.ledgerTransactionVersion) &&
      e.ledgerTransactionVersion > 0 },
  { key: 'signedApprovalVerification', id: 'signed-approval-verification',
    failure: 'signed-approval-verification-unavailable',
    action: 'make signed approval verification availability externally verifiable',
    claim: e => e.verifierAvailable === true && e.signatureVerified === true && !!str(e.publicKeyDigest) },
  { key: 'serverHeldSmtpIdentity', id: 'server-held-smtp-identity',
    failure: 'smtp-identity-not-server-held',
    action: 'prove the SMTP identity is server-held and not caller-supplied',
    claim: e => e.serverHeld === true && EMAIL.test(str(e.smtpIdentity).toLowerCase()) },
  { key: 'currentDnsAlignment', id: 'current-dns-alignment',
    failure: 'dns-alignment-not-current',
    action: 're-check live SPF, DKIM and DMARC alignment for the sending domain',
    claim: e => e.spfAligned === true && e.dkimAligned === true && e.dmarcAligned === true },
  { key: 'consentingRecipientNetwork', id: 'consenting-recipient-network',
    failure: 'no-real-consenting-recipient-network',
    action: 'evidence a real consenting recipient network with suppression applied',
    claim: e => e.realConsenting === true && e.suppressionChecked === true &&
      Number.isInteger(e.consentingRecipientCount) && e.consentingRecipientCount > 0 },
  { key: 'receiverCredentials', id: 'independently-verifiable-receiver-credentials',
    failure: 'receiver-credentials-not-independently-verifiable',
    action: 'provide independently verifiable receiver credentials held outside this process',
    claim: e => e.independentlyVerifiable === true && e.credentialOwnerExternal === true &&
      e.credentialsExposed !== true },
  { key: 'paidWarmupFirewall', id: 'paid-warmup-firewall',
    failure: 'paid-warmup-firewall-not-enforcing',
    action: 'show the paid-warmup firewall is configured and blocks provider-paid warming',
    claim: e => e.firewallConfigured === true &&
      e.blocksPaidWarmingActivation === true && e.blocksBillingOperations === true },
]);

// Evidence classified as SOURCE_ONLY (docs/code/PR/tests/history) is recorded as
// seen but can never pass. Unknown or unrecognized truth classes are UNKNOWN.
function classify(entry) {
  const cls = str(entry && entry.truthClass);
  if (cls === TRUTH_CLASSES.AUTHENTICATED_CURRENT) return TRUTH_CLASSES.AUTHENTICATED_CURRENT;
  if (cls === TRUTH_CLASSES.SOURCE_ONLY) return TRUTH_CLASSES.SOURCE_ONLY;
  return TRUTH_CLASSES.UNKNOWN;
}

function evaluate(requirement, entry, nowMs, verifyAttestation) {
  const base = { id: requirement.id, key: requirement.key, truthClass: TRUTH_CLASSES.UNKNOWN };
  if (!entry || typeof entry !== 'object') {
    return { ...base, ok: false, reason: 'evidence-missing', action: requirement.action, refDigest: null };
  }
  const truthClass = classify(entry);
  const ref = str(entry.evidenceRef);
  const refOut = ref ? refDigest(ref) : null;
  if (truthClass !== TRUTH_CLASSES.AUTHENTICATED_CURRENT) {
    return { ...base, truthClass, ok: false,
      reason: truthClass === TRUTH_CLASSES.SOURCE_ONLY
        ? 'source-only-never-runtime-proof' : 'not-independently-authenticated',
      action: requirement.action, refDigest: refOut };
  }
  const at = canonicalUtcMs(entry.observedAt);
  const unsigned = { ...base, truthClass, ok: false, action: requirement.action, refDigest: refOut };
  if (at === null) return { ...unsigned, reason: 'timestamp-not-canonical-utc' };
  if (!Number.isFinite(nowMs)) return { ...unsigned, reason: 'evaluation-instant-unknown' };
  if (at > nowMs) return { ...unsigned, reason: 'timestamp-in-the-future' };
  if (nowMs - at > MAX_AGE_MS) return { ...unsigned, reason: 'evidence-stale' };
  if (!ref || entry.signatureVerified !== true) {
    return { ...unsigned, truthClass: TRUTH_CLASSES.UNKNOWN, reason: 'evidence-reference-unsigned' };
  }
  // A caller-asserted truthClass/boolean/signature flag is NOT authentication.
  // The trusted original runtime must validate provenance outside this module.
  let authentic = false;
  try { authentic = typeof verifyAttestation === 'function' &&
    verifyAttestation({ key: requirement.key, entry }) === true; } catch {}
  if (!authentic) return { ...unsigned, truthClass: TRUTH_CLASSES.UNKNOWN,
    reason: 'trusted-attestation-verifier-required' };
  let claimOk = false;
  try { claimOk = requirement.claim(entry) === true; } catch { claimOk = false; }
  if (!claimOk) return { ...unsigned, reason: requirement.failure };
  return { id: requirement.id, key: requirement.key, truthClass, ok: true,
    reason: 'authenticated-current', action: null, refDigest: refOut };
}

/** Compile a protected-runtime readiness report from injected sanitized evidence.
 * `evidence` maps requirement keys to externally verified records. `now` is the
 * evaluation instant in epoch milliseconds and must be supplied by the caller to
 * keep this function pure. Returns ready:true only when every gate has fresh,
 * independently authenticated, referenced evidence; it emits no approval and no
 * production action.
 */
export function compileUberWarm2ProtectedRuntimePreflight({ evidence = {}, now, verifyAttestation } = {}) {
  const nowMs = Number(now);
  const source = evidence && typeof evidence === 'object' ? evidence : {};
  const requirements = REQUIREMENTS.map(r => evaluate(r, source[r.key], nowMs, verifyAttestation));
  const actionItems = requirements.filter(r => !r.ok).map(r => ({
    id: r.id, reason: r.reason, action: r.action }));
  return {
    schemaVersion: UBERWARM2_PROTECTED_RUNTIME_PREFLIGHT_VERSION,
    ready: requirements.length > 0 && requirements.every(r => r.ok),
    evaluatedAtMs: Number.isFinite(nowMs) ? nowMs : null,
    truthClasses: TRUTH_CLASSES,
    requirements,
    actionItems,
    counts: {
      total: requirements.length,
      passed: requirements.filter(r => r.ok).length,
      authenticatedCurrent: requirements.filter(r => r.truthClass === TRUTH_CLASSES.AUTHENTICATED_CURRENT).length,
      sourceOnly: requirements.filter(r => r.truthClass === TRUTH_CLASSES.SOURCE_ONLY).length,
      unknown: requirements.filter(r => r.truthClass === TRUTH_CLASSES.UNKNOWN).length,
    },
    neverCountsAsRuntimeProof: [
      'readiness-documentation', 'source-code', 'pr-description-or-tests',
      'historical-neon-restore', 'source-only-render-protection',
    ],
    authority: {
      productionActions: 'NONE',
      syntheticApprovalCreated: false,
      postOrSendEmitted: false,
    },
    truthBoundary: 'Source, documentation, tests and history never satisfy a gate; only fresh independently authenticated external evidence can, and readiness here is still a candidate pending independent security review.',
  };
}

export const PROTECTED_RUNTIME_REQUIREMENT_IDS =
  Object.freeze(REQUIREMENTS.map(r => r.id));
