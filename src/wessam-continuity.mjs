import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const WESSAM_CONTINUITY_VERSION = 'wessam-continuity-1.0.0';
export const WESSAM_ROOT_IDENTITY = Object.freeze({
  ownerRole: 'ROOT_OF_TRUST',
  organism: 'UberBond',
  portabilityLaw: 'COGNITIVE_STATE_NOT_PROVIDER_DEVICE_OR_CLOUD',
  consequenceAuthority: 'OWNER_AND_EXISTING_POLICY_ONLY',
  selfGrantAuthority: false
});

const SECRET_KEY = /(?:password|passwd|secret|token|authorization|cookie|credential|api[_-]?key|private[_-]?key|session[_-]?id)/i;
const SECRET_VALUE = /(?:^|\b)(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|bearer\s+[A-Za-z0-9._-]{12,})/i;
const PRIVATE_CLASSES = new Set(['PUBLIC', 'INTERNAL', 'PRIVATE', 'WESSAM_INNERMOST']);

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function inspectSecrets(value, path = '$', depth = 0, seen = new WeakSet()) {
  if (depth > 10) return [];
  if (value && typeof value === 'object') {
    if (seen.has(value)) return [];
    seen.add(value);
  }
  const findings = [];
  if (typeof value === 'string' && SECRET_VALUE.test(value)) findings.push(path);
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (SECRET_KEY.test(key)) findings.push(next);
    findings.push(...inspectSecrets(child, next, depth + 1, seen));
  }
  return [...new Set(findings)].slice(0, 100);
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    version: WESSAM_CONTINUITY_VERSION,
    status: 'WESSAM_CONTINUITY_DENIED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

export function compileWessamState({
  ownerId,
  memoryRootDigest,
  stateRootDigest,
  trustedBoundaryId = 'WESSAM_PRIVATE_COMPUTE',
  revokedDeviceIds = [],
  revokedProviderIds = [],
  recoveryEpoch = 1,
  updatedAt = new Date().toISOString()
} = {}) {
  const reasons = [];
  const normalizedOwner = text(ownerId, 200);
  const memoryDigest = text(memoryRootDigest, 128);
  const stateDigest = text(stateRootDigest, 128);
  const boundary = text(trustedBoundaryId, 200);
  const timestamp = new Date(updatedAt);
  if (!normalizedOwner) reasons.push('owner-id-required');
  if (!memoryDigest) reasons.push('memory-root-digest-required');
  if (!stateDigest) reasons.push('state-root-digest-required');
  if (!boundary) reasons.push('trusted-boundary-required');
  if (!Number.isInteger(recoveryEpoch) || recoveryEpoch < 1) reasons.push('positive-recovery-epoch-required');
  if (!Number.isFinite(timestamp.getTime())) reasons.push('valid-updated-at-required');
  if (!Array.isArray(revokedDeviceIds) || !Array.isArray(revokedProviderIds)) reasons.push('revocation-arrays-required');
  const revokedDevices = Array.isArray(revokedDeviceIds) ? [...new Set(revokedDeviceIds.map(v => text(v, 200)).filter(Boolean))] : [];
  const revokedProviders = Array.isArray(revokedProviderIds) ? [...new Set(revokedProviderIds.map(v => text(v, 200)).filter(Boolean))] : [];
  if (reasons.length) return fail(reasons);

  const state = {
    schemaVersion: 'wessam-state-1.0.0',
    ownerId: normalizedOwner,
    rootIdentity: WESSAM_ROOT_IDENTITY,
    memoryRootDigest: memoryDigest,
    stateRootDigest: stateDigest,
    trustedBoundaryId: boundary,
    revokedDeviceIds: revokedDevices,
    revokedProviderIds: revokedProviders,
    recoveryEpoch,
    updatedAt: timestamp.toISOString(),
    ownerInspectable: true,
    hiddenPersistenceAllowed: false,
    providerPortable: true,
    devicePortable: true,
    selfAuthorityEscalationAllowed: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  return { ok: true, version: WESSAM_CONTINUITY_VERSION, status: 'WESSAM_STATE_COMPILED', state, stateFingerprint: digest(state) };
}

export function compileRecoveryCapsule({ state, ownerAuthorization, targetBoundaryId, targetDeviceId = null, targetProviderId = null } = {}) {
  const reasons = [];
  if (!state || typeof state !== 'object') reasons.push('wessam-state-required');
  if (!ownerAuthorization || typeof ownerAuthorization !== 'object') reasons.push('owner-authorization-required');
  const authOwner = text(ownerAuthorization?.ownerId, 200);
  const authorizationDigest = text(ownerAuthorization?.authorizationDigest, 128);
  const targetBoundary = text(targetBoundaryId, 200);
  if (!targetBoundary) reasons.push('target-boundary-required');
  if (state && authOwner !== state.ownerId) reasons.push('owner-identity-mismatch');
  if (!authorizationDigest) reasons.push('owner-authorization-digest-required');
  if (state && targetDeviceId && state.revokedDeviceIds?.includes(targetDeviceId)) reasons.push('target-device-revoked');
  if (state && targetProviderId && state.revokedProviderIds?.includes(targetProviderId)) reasons.push('target-provider-revoked');
  if (reasons.length) return fail(reasons);

  const capsule = {
    schemaVersion: 'wessam-recovery-capsule-1.0.0',
    ownerId: state.ownerId,
    sourceStateFingerprint: digest(state),
    memoryRootDigest: state.memoryRootDigest,
    stateRootDigest: state.stateRootDigest,
    recoveryEpoch: state.recoveryEpoch,
    targetBoundaryId: targetBoundary,
    targetDeviceId: targetDeviceId ? text(targetDeviceId, 200) : null,
    targetProviderId: targetProviderId ? text(targetProviderId, 200) : null,
    authorizationDigest,
    payloadMode: 'DIGEST_REFERENCES_ONLY',
    plaintextMemoryIncluded: false,
    authorityTransfer: 'NONE',
    requiresFreshOwnerAuthorizationAtRestore: true,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  return { ok: true, status: 'OWNER_AUTHORIZED_RECOVERY_CAPSULE_COMPILED', capsule, capsuleFingerprint: digest(capsule) };
}

export function compileExternalTaskPacket({
  taskId,
  purpose,
  requestedFields = [],
  memoryItems = [],
  allowedPrivacyClasses = ['PUBLIC', 'INTERNAL'],
  consequenceAuthority = 'NONE'
} = {}) {
  const reasons = [];
  const id = text(taskId, 200);
  const taskPurpose = text(purpose, 1000);
  if (!id) reasons.push('task-id-required');
  if (!taskPurpose) reasons.push('purpose-required');
  if (!Array.isArray(requestedFields) || requestedFields.length > 128) reasons.push('bounded-requested-fields-required');
  if (!Array.isArray(memoryItems) || memoryItems.length > 512) reasons.push('bounded-memory-items-required');
  if (!Array.isArray(allowedPrivacyClasses) || allowedPrivacyClasses.some(v => !PRIVATE_CLASSES.has(v))) reasons.push('valid-privacy-classes-required');
  if (consequenceAuthority !== 'NONE') reasons.push('external-task-packet-cannot-grant-consequence-authority');
  if (reasons.length) return fail(reasons);

  const requested = new Set(requestedFields.map(v => text(v, 200)).filter(Boolean));
  const allowed = new Set(allowedPrivacyClasses);
  const included = [];
  const excluded = [];
  for (const item of memoryItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { excluded.push({ reason: 'invalid-item' }); continue; }
    const key = text(item.key, 200);
    const privacyClass = text(item.privacyClass, 80);
    const value = item.value;
    if (!key || !privacyClass || !PRIVATE_CLASSES.has(privacyClass)) { excluded.push({ key, reason: 'invalid-metadata' }); continue; }
    if (!requested.has(key)) { excluded.push({ key, reason: 'not-requested' }); continue; }
    if (!allowed.has(privacyClass)) { excluded.push({ key, reason: 'privacy-class-denied' }); continue; }
    const secretPaths = inspectSecrets(value);
    if (secretPaths.length) { excluded.push({ key, reason: 'secret-like-content-denied' }); continue; }
    included.push({ key, privacyClass, value: structuredClone(value), provenanceRef: text(item.provenanceRef, 500) });
  }

  const packet = {
    schemaVersion: 'wessam-external-task-packet-1.0.0',
    taskId: id,
    purpose: taskPurpose,
    included,
    excluded,
    minimizationApplied: true,
    plaintextWessamInnermostIncluded: included.some(item => item.privacyClass === 'WESSAM_INNERMOST'),
    consequenceAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
  if (packet.plaintextWessamInnermostIncluded) return fail(['wessam-innermost-plaintext-externalization-prohibited'], { excluded });
  return { ok: true, status: 'MINIMUM_SUFFICIENT_EXTERNAL_TASK_PACKET_COMPILED', packet, packetFingerprint: digest(packet) };
}

export function verifyRestoredWessamState({ sourceState, restoredState, ownerAuthorization } = {}) {
  const reasons = [];
  if (!sourceState || !restoredState) reasons.push('source-and-restored-state-required');
  if (!ownerAuthorization || ownerAuthorization.ownerId !== sourceState?.ownerId) reasons.push('fresh-owner-authorization-required');
  if (sourceState && restoredState) {
    if (restoredState.ownerId !== sourceState.ownerId) reasons.push('owner-changed-during-restore');
    if (restoredState.memoryRootDigest !== sourceState.memoryRootDigest) reasons.push('memory-root-drift');
    if (restoredState.stateRootDigest !== sourceState.stateRootDigest) reasons.push('state-root-drift');
    if (Number(restoredState.recoveryEpoch) < Number(sourceState.recoveryEpoch)) reasons.push('stale-recovery-epoch');
    if (restoredState.selfAuthorityEscalationAllowed === true) reasons.push('authority-inflation-during-restore');
  }
  return reasons.length ? fail(reasons) : {
    ok: true,
    status: 'WESSAM_RESTORE_VERIFIED',
    sourceStateFingerprint: digest(sourceState),
    restoredStateFingerprint: digest(restoredState),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
