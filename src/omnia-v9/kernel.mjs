import { digestObject, sha256, verifyDigestSignature } from './canonical.mjs';
import {
  validateClosedRecord, ACTION_INTENT_SPEC, APPROVAL_SPEC, EVIDENCE_SPEC, EXECUTION_RECEIPT_SPEC,
  VERIFICATION_CLAIMS, LIFECYCLE_FLAGS
} from './schema.mjs';

const CONSEQUENT_EFFECTS = new Set(['WRITE_INTERNAL','COMMUNICATE_EXTERNAL','PRODUCTION_MUTATION','DATA_EXPORT','CREDENTIAL_USE','FINANCIAL','LEGAL_COMMITMENT','PHYSICAL_EFFECT','PROFESSIONAL_AUTHORITY']);
const BLOCKING_LIFECYCLE = new Set(['DISPUTED','STALE','REVOKED','QUARANTINED','EXPIRED']);
const EXTERNAL_ORIGINS = new Set(['EXTERNAL_SOURCE','PROVIDER_CALLBACK','CUSTOMER_ATTESTATION','PROFESSIONAL_ATTESTATION','PRODUCTION_TELEMETRY']);
const SHA256_HEX = /^[a-f0-9]{64}$/i;
const CLOCK_SKEW_MS = 5 * 60_000;

function isoMs(value) { const ms = Date.parse(value); return Number.isFinite(ms) ? ms : NaN; }
function includesOrWildcard(list, value) { return Array.isArray(list) && (list.includes('*') || list.includes(value)); }
function prefixMatch(prefixes, resource) { return Array.isArray(prefixes) && prefixes.some(prefix => typeof prefix === 'string' && (prefix === '*' || resource === prefix || resource.startsWith(prefix))); }
function stringArray(value, { nonEmpty = false, allowed = null } = {}) {
  if (!Array.isArray(value)) return false;
  if (nonEmpty && value.length === 0) return false;
  return value.every(item => typeof item === 'string' && item.trim() && (!allowed || allowed.has(item)));
}
function isValidExternalSource(record) {
  if (record.origin !== 'EXTERNAL_SOURCE') return true;
  try {
    const url = new URL(record.sourceRef);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function createActionIntent(input, now = new Date()) {
  const base = {
    schemaVersion: 'omnia.v9.p0', missionId: input.missionId, tenantId: input.tenantId, actorId: input.actorId,
    operation: input.operation, resource: input.resource, purpose: input.purpose, effectClass: input.effectClass,
    argumentsDigest: input.argumentsDigest || sha256(input.arguments ?? {}), evidenceIds: [...new Set(input.evidenceIds || [])].sort(),
    maxCostUsd: Number(input.maxCostUsd ?? 0), blastRadius: Number(input.blastRadius ?? 1), rollback: input.rollback || 'NONE',
    createdAt: input.createdAt || now.toISOString(), expiresAt: input.expiresAt, nonce: input.nonce, idempotencyKey: input.idempotencyKey
  };
  return { ...base, intentDigest: digestObject(base) };
}

export function createEvidenceRecord(input) {
  const base = {
    schemaVersion: 'omnia.v9.p0', evidenceId: input.evidenceId, tenantId: input.tenantId, subject: input.subject,
    origin: input.origin, relation: input.relation, verificationClaims: [...new Set(input.verificationClaims || [])].sort(),
    lifecycleFlags: [...new Set(input.lifecycleFlags || ['ACTIVE'])].sort(), sourceRef: input.sourceRef,
    payloadDigest: input.payloadDigest || sha256(input.payload ?? {}), observedAt: input.observedAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
  };
  return { ...base, evidenceDigest: digestObject(base) };
}

export function createApproval(input, signer) {
  const base = {
    schemaVersion: 'omnia.v9.p0', approvalId: input.approvalId, issuerId: input.issuerId, keyId: input.keyId,
    tenantId: input.tenantId, actorIds: [...new Set(input.actorIds || [])].sort(), operations: [...new Set(input.operations || [])].sort(),
    resourcePrefixes: [...new Set(input.resourcePrefixes || [])].sort(), purposes: [...new Set(input.purposes || [])].sort(),
    effectClasses: [...new Set(input.effectClasses || [])].sort(), maxBlastRadius: Number(input.maxBlastRadius ?? 0),
    maxCostUsd: Number(input.maxCostUsd ?? 0), maxUses: Number(input.maxUses ?? 0), notBefore: input.notBefore,
    expiresAt: input.expiresAt, issuedAt: input.issuedAt
  };
  const approvalDigest = digestObject(base);
  return { ...base, approvalDigest, signature: signer(approvalDigest) };
}

export function verifyIntent(intent, { now = new Date() } = {}) {
  const schema = validateClosedRecord('intent', intent, ACTION_INTENT_SPEC);
  const errors = [...schema.errors];
  if (!intent) return { ok: false, errors };
  try { if (digestObject(intent, ['intentDigest']) !== intent.intentDigest) errors.push('intent:digest-mismatch'); }
  catch { errors.push('intent:canonicalization-failed'); }
  if (!SHA256_HEX.test(String(intent.intentDigest || ''))) errors.push('intent:digest-format');
  if (!SHA256_HEX.test(String(intent.argumentsDigest || ''))) errors.push('intent:arguments-digest-format');
  if (!stringArray(intent.evidenceIds)) errors.push('intent:invalid-evidence-ids');
  const createdMs = isoMs(intent.createdAt); const expiresMs = isoMs(intent.expiresAt);
  if (!Number.isFinite(createdMs) || !Number.isFinite(expiresMs)) errors.push('intent:invalid-time');
  else {
    if (createdMs > expiresMs) errors.push('intent:invalid-window');
    if (createdMs > now.getTime() + CLOCK_SKEW_MS) errors.push('intent:created-in-future');
    if (expiresMs <= now.getTime()) errors.push('intent:expired');
  }
  if (!Number.isInteger(intent.blastRadius) || intent.blastRadius < 0) errors.push('intent:invalid-blast-radius');
  if (!(intent.maxCostUsd >= 0)) errors.push('intent:invalid-cost');
  return { ok: errors.length === 0, errors };
}

export function verifyEvidence(record, { now = new Date(), requireExternal = false } = {}) {
  const schema = validateClosedRecord('evidence', record, EVIDENCE_SPEC);
  const errors = [...schema.errors];
  if (!record) return { ok: false, errors };
  try { if (digestObject(record, ['evidenceDigest']) !== record.evidenceDigest) errors.push('evidence:digest-mismatch'); }
  catch { errors.push('evidence:canonicalization-failed'); }
  if (!SHA256_HEX.test(String(record.evidenceDigest || ''))) errors.push('evidence:digest-format');
  if (!SHA256_HEX.test(String(record.payloadDigest || ''))) errors.push('evidence:payload-digest-format');
  if (!stringArray(record.verificationClaims, { allowed: new Set(VERIFICATION_CLAIMS) })) errors.push('evidence:invalid-verification-claims');
  if (!stringArray(record.lifecycleFlags, { nonEmpty: true, allowed: new Set(LIFECYCLE_FLAGS) })) errors.push('evidence:invalid-lifecycle-flags');
  if (record.lifecycleFlags?.some(flag => BLOCKING_LIFECYCLE.has(flag))) errors.push('evidence:inactive');
  if (!isValidExternalSource(record)) errors.push('evidence:invalid-external-source-ref');
  const observedMs = isoMs(record.observedAt);
  if (!Number.isFinite(observedMs)) errors.push('evidence:invalid-observed-at');
  else if (observedMs > now.getTime() + CLOCK_SKEW_MS) errors.push('evidence:observed-in-future');
  if (record.expiresAt) {
    const expiresMs = isoMs(record.expiresAt);
    if (!Number.isFinite(expiresMs)) errors.push('evidence:invalid-expires-at');
    else if (expiresMs <= now.getTime()) errors.push('evidence:expired');
  }
  if (requireExternal && !EXTERNAL_ORIGINS.has(record.origin)) errors.push('evidence:external-required');
  return { ok: errors.length === 0, errors };
}

export function verifyApproval(approval, { now = new Date(), keyResolver, revokedApprovalIds = new Set() } = {}) {
  const schema = validateClosedRecord('approval', approval, APPROVAL_SPEC);
  const errors = [...schema.errors];
  if (!approval) return { ok: false, errors };
  try { if (digestObject(approval, ['approvalDigest','signature']) !== approval.approvalDigest) errors.push('approval:digest-mismatch'); }
  catch { errors.push('approval:canonicalization-failed'); }
  if (!SHA256_HEX.test(String(approval.approvalDigest || ''))) errors.push('approval:digest-format');
  for (const [field, value] of [['actorIds', approval.actorIds], ['operations', approval.operations], ['resourcePrefixes', approval.resourcePrefixes], ['purposes', approval.purposes], ['effectClasses', approval.effectClasses]]) {
    if (!stringArray(value, { nonEmpty: true })) errors.push(`approval:invalid-${field}`);
  }
  const notBeforeMs = isoMs(approval.notBefore); const expiresMs = isoMs(approval.expiresAt); const issuedMs = isoMs(approval.issuedAt);
  if (![notBeforeMs, expiresMs, issuedMs].every(Number.isFinite)) errors.push('approval:invalid-time');
  else {
    if (issuedMs > now.getTime() + CLOCK_SKEW_MS) errors.push('approval:issued-in-future');
    if (notBeforeMs > now.getTime()) errors.push('approval:not-yet-valid');
    if (expiresMs <= now.getTime()) errors.push('approval:expired');
    if (issuedMs > notBeforeMs || notBeforeMs > expiresMs) errors.push('approval:invalid-window');
  }
  if (revokedApprovalIds.has(approval.approvalId)) errors.push('approval:revoked');
  if (!Number.isInteger(approval.maxUses) || approval.maxUses <= 0) errors.push('approval:invalid-max-uses');
  if (!Number.isInteger(approval.maxBlastRadius) || approval.maxBlastRadius < 0) errors.push('approval:invalid-blast-radius');
  if (!(approval.maxCostUsd >= 0)) errors.push('approval:invalid-cost');
  const publicKey = keyResolver?.(approval.keyId, approval.issuerId);
  if (!publicKey || !verifyDigestSignature(approval.approvalDigest, approval.signature, publicKey)) errors.push('approval:signature-invalid');
  return { ok: errors.length === 0, errors };
}

export function approvalCoversIntent(approval, intent, usage = { uses: 0, costUsd: 0 }) {
  const errors = [];
  if (approval.tenantId !== intent.tenantId) errors.push('scope:tenant');
  if (!includesOrWildcard(approval.actorIds, intent.actorId)) errors.push('scope:actor');
  if (!includesOrWildcard(approval.operations, intent.operation)) errors.push('scope:operation');
  if (!prefixMatch(approval.resourcePrefixes, intent.resource)) errors.push('scope:resource');
  if (!includesOrWildcard(approval.purposes, intent.purpose)) errors.push('scope:purpose');
  if (!includesOrWildcard(approval.effectClasses, intent.effectClass)) errors.push('scope:effect');
  if (intent.blastRadius > approval.maxBlastRadius) errors.push('scope:blast-radius');
  if (intent.maxCostUsd > approval.maxCostUsd) errors.push('scope:intent-cost');
  if (!Number.isFinite(Number(usage.uses)) || Number(usage.uses) < 0 || Number(usage.uses) >= approval.maxUses) errors.push('scope:uses-exhausted');
  if (!Number.isFinite(Number(usage.costUsd)) || Number(usage.costUsd) < 0 || Number(usage.costUsd) + intent.maxCostUsd > approval.maxCostUsd) errors.push('scope:budget-exhausted');
  return { ok: errors.length === 0, errors };
}

function resolveEvidenceRequirements(intent, context) {
  if (typeof context.evidenceRequirementResolver !== 'function') {
    return CONSEQUENT_EFFECTS.has(intent.effectClass) ? { ok: false, error: 'evidence:requirement-resolver-missing' } : { ok: true, requirements: { minCount: 0, allowedOrigins: null } };
  }
  try {
    const requirements = context.evidenceRequirementResolver(intent);
    if (!requirements || !Number.isInteger(requirements.minCount) || requirements.minCount < 0) return { ok: false, error: 'evidence:invalid-requirements' };
    if (requirements.allowedOrigins && !stringArray(requirements.allowedOrigins, { nonEmpty: true })) return { ok: false, error: 'evidence:invalid-requirements' };
    return { ok: true, requirements };
  } catch {
    return { ok: false, error: 'evidence:requirement-resolver-error' };
  }
}

export function admitAction(intent, context = {}) {
  const now = context.now || new Date();
  const verifiedIntent = verifyIntent(intent, { now });
  if (!verifiedIntent.ok) return decision('DENY', intent, verifiedIntent.errors, context);
  const reasons = [];
  if (context.killState?.active) reasons.push('kill-state:active');
  if (context.revokedIntentDigests?.has(intent.intentDigest)) reasons.push('intent:revoked');
  if (reasons.length) return decision('DENY', intent, reasons, context);

  const requirementResult = resolveEvidenceRequirements(intent, context);
  if (!requirementResult.ok) return decision('DENY', intent, [requirementResult.error], context);
  const requirements = requirementResult.requirements;
  const evidence = (intent.evidenceIds || []).map(id => context.evidenceResolver?.(id)).filter(Boolean);
  if (evidence.length !== intent.evidenceIds.length) reasons.push('evidence:unresolved');
  if (evidence.length < requirements.minCount) reasons.push('evidence:insufficient-count');
  for (const record of evidence) {
    const requireExternal = Array.isArray(requirements.allowedOrigins) && requirements.allowedOrigins.every(origin => EXTERNAL_ORIGINS.has(origin));
    const check = verifyEvidence(record, { now, requireExternal });
    if (record.tenantId !== intent.tenantId) check.errors.push('evidence:tenant-mismatch');
    if (requirements.allowedOrigins && !requirements.allowedOrigins.includes(record.origin)) check.errors.push('evidence:origin-not-allowed');
    reasons.push(...check.errors);
  }
  if (reasons.length) return decision('DENY', intent, reasons, context);

  const approvals = (context.approvals || []).map(approval => ({ approval, verify: verifyApproval(approval, context), usage: context.usageResolver?.(approval.approvalId) || { uses: 0, costUsd: 0 } }));
  const covering = approvals.find(item => item.verify.ok && approvalCoversIntent(item.approval, intent, item.usage).ok);
  if (!covering) {
    const approvalProblems = approvals.flatMap(item => [...item.verify.errors, ...approvalCoversIntent(item.approval, intent, item.usage).errors]);
    return decision('REVIEW', intent, ['approval:no-covering-resolvable-approval', ...new Set(approvalProblems)], context);
  }

  if (typeof context.policyAuthorizer !== 'function') return decision('DENY', intent, ['policy:authorizer-missing'], context, covering.approval);
  if (CONSEQUENT_EFFECTS.has(intent.effectClass)) {
    if (!context.policyVersion || context.policyVersion === 'unversioned') return decision('DENY', intent, ['policy:version-missing'], context, covering.approval);
    if (!SHA256_HEX.test(String(context.policyDigest || ''))) return decision('DENY', intent, ['policy:digest-missing'], context, covering.approval);
    if (!SHA256_HEX.test(String(context.constitutionDigest || ''))) return decision('DENY', intent, ['constitution:digest-missing'], context, covering.approval);
  }
  let policy;
  try { policy = context.policyAuthorizer({ intent, approval: covering.approval, evidence, requirements }); }
  catch (error) { return decision('DENY', intent, [`policy:error:${String(error?.message || error)}`], context, covering.approval); }
  if (!policy || policy.decision !== 'ALLOW') return decision(policy?.decision === 'REVIEW' ? 'REVIEW' : 'DENY', intent, ['policy:not-allowed', ...(policy?.reasons || [])], context, covering.approval);
  return decision('ALLOW', intent, ['admission:all-gates-satisfied'], context, covering.approval);
}

function decision(value, intent, reasons, context, approval = null) {
  const base = {
    schemaVersion: 'omnia.v9.p0', decision: value, intentDigest: intent?.intentDigest || '', approvalId: approval?.approvalId || '',
    policyVersion: String(context.policyVersion || 'unversioned'), policyDigest: String(context.policyDigest || ''),
    constitutionDigest: String(context.constitutionDigest || ''), reasons: [...new Set(reasons)].sort(),
    decidedAt: (context.now || new Date()).toISOString()
  };
  return { ...base, decisionDigest: digestObject(base) };
}

export function createExecutionReceipt(input) {
  const base = {
    schemaVersion: 'omnia.v9.p0', intentDigest: input.intentDigest, authorizationDigest: input.authorizationDigest,
    executorId: input.executorId, executorVersion: input.executorVersion, startedAt: input.startedAt, finishedAt: input.finishedAt,
    outcome: input.outcome, providerRefs: input.providerRefs || [], evidenceIds: input.evidenceIds || [], rollbackState: input.rollbackState || 'NOT_REQUIRED',
    actualCostUsd: Number(input.actualCostUsd ?? 0), idempotencyKey: input.idempotencyKey
  };
  const receipt = { ...base, receiptDigest: digestObject(base) };
  const verified = verifyExecutionReceipt(receipt);
  if (!verified.ok) throw new TypeError(`invalid execution receipt: ${verified.errors.join(',')}`);
  return receipt;
}

export function verifyExecutionReceipt(receipt) {
  const schema = validateClosedRecord('receipt', receipt, EXECUTION_RECEIPT_SPEC);
  const errors = [...schema.errors];
  if (!receipt) return { ok: false, errors };
  try { if (digestObject(receipt, ['receiptDigest']) !== receipt.receiptDigest) errors.push('receipt:digest-mismatch'); }
  catch { errors.push('receipt:canonicalization-failed'); }
  for (const field of ['receiptDigest', 'intentDigest', 'authorizationDigest']) if (!SHA256_HEX.test(String(receipt[field] || ''))) errors.push(`receipt:${field}-format`);
  if (!stringArray(receipt.providerRefs) || !stringArray(receipt.evidenceIds)) errors.push('receipt:invalid-references');
  if (!(receipt.actualCostUsd >= 0)) errors.push('receipt:invalid-cost');
  const startedMs = isoMs(receipt.startedAt); const finishedMs = isoMs(receipt.finishedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(finishedMs)) errors.push('receipt:invalid-time');
  else if (finishedMs < startedMs) errors.push('receipt:invalid-window');
  return { ok: errors.length === 0, errors };
}
