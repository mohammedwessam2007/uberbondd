import { digestObject, sha256, verifyDigestSignature } from './canonical.mjs';
import { validateClosedRecord, ACTION_INTENT_SPEC, APPROVAL_SPEC, EVIDENCE_SPEC } from './schema.mjs';

const CONSEQUENT_EFFECTS = new Set(['WRITE_INTERNAL','COMMUNICATE_EXTERNAL','PRODUCTION_MUTATION','DATA_EXPORT','CREDENTIAL_USE','FINANCIAL','LEGAL_COMMITMENT','PHYSICAL_EFFECT','PROFESSIONAL_AUTHORITY']);
const BLOCKING_LIFECYCLE = new Set(['DISPUTED','STALE','REVOKED','QUARANTINED','EXPIRED']);
const EXTERNAL_ORIGINS = new Set(['EXTERNAL_SOURCE','PROVIDER_CALLBACK','CUSTOMER_ATTESTATION','PROFESSIONAL_ATTESTATION','PRODUCTION_TELEMETRY']);

function isoMs(value) { const ms = Date.parse(value); return Number.isFinite(ms) ? ms : NaN; }
function includesOrWildcard(list, value) { return Array.isArray(list) && (list.includes('*') || list.includes(value)); }
function prefixMatch(prefixes, resource) { return Array.isArray(prefixes) && prefixes.some(prefix => prefix === '*' || resource === prefix || resource.startsWith(prefix)); }

export function createActionIntent(input, now = new Date()) {
  const base = {
    schemaVersion: 'omnia.v9.p0',
    missionId: input.missionId,
    tenantId: input.tenantId,
    actorId: input.actorId,
    operation: input.operation,
    resource: input.resource,
    purpose: input.purpose,
    effectClass: input.effectClass,
    argumentsDigest: input.argumentsDigest || sha256(input.arguments ?? {}),
    evidenceIds: [...new Set(input.evidenceIds || [])].sort(),
    maxCostUsd: Number(input.maxCostUsd ?? 0),
    blastRadius: Number(input.blastRadius ?? 1),
    rollback: input.rollback || 'NONE',
    createdAt: input.createdAt || now.toISOString(),
    expiresAt: input.expiresAt,
    nonce: input.nonce,
    idempotencyKey: input.idempotencyKey
  };
  return { ...base, intentDigest: digestObject(base) };
}

export function createEvidenceRecord(input) {
  const base = {
    schemaVersion: 'omnia.v9.p0',
    evidenceId: input.evidenceId,
    tenantId: input.tenantId,
    subject: input.subject,
    origin: input.origin,
    relation: input.relation,
    verificationClaims: [...new Set(input.verificationClaims || [])].sort(),
    lifecycleFlags: [...new Set(input.lifecycleFlags || ['ACTIVE'])].sort(),
    sourceRef: input.sourceRef,
    payloadDigest: input.payloadDigest || sha256(input.payload ?? {}),
    observedAt: input.observedAt,
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

export function verifyIntent(intent) {
  const schema = validateClosedRecord('intent', intent, ACTION_INTENT_SPEC);
  const errors = [...schema.errors];
  if (intent) {
    try { if (digestObject(intent, ['intentDigest']) !== intent.intentDigest) errors.push('intent:digest-mismatch'); }
    catch { errors.push('intent:canonicalization-failed'); }
  }
  if (intent) {
    const createdMs = isoMs(intent.createdAt); const expiresMs = isoMs(intent.expiresAt);
    if (!Number.isFinite(createdMs) || !Number.isFinite(expiresMs)) errors.push('intent:invalid-time');
    else if (createdMs > expiresMs) errors.push('intent:invalid-window');
  }
  if (intent && (!Number.isInteger(intent.blastRadius) || intent.blastRadius < 0)) errors.push('intent:invalid-blast-radius');
  if (intent && (!(intent.maxCostUsd >= 0))) errors.push('intent:invalid-cost');
  return { ok: errors.length === 0, errors };
}

export function verifyEvidence(record, { now = new Date(), requireExternal = false } = {}) {
  const schema = validateClosedRecord('evidence', record, EVIDENCE_SPEC);
  const errors = [...schema.errors];
  if (record) {
    try { if (digestObject(record, ['evidenceDigest']) !== record.evidenceDigest) errors.push('evidence:digest-mismatch'); }
    catch { errors.push('evidence:canonicalization-failed'); }
  }
  if (record && record.lifecycleFlags?.some(flag => BLOCKING_LIFECYCLE.has(flag))) errors.push('evidence:inactive');
  if (record) {
    const observedMs = isoMs(record.observedAt); if (!Number.isFinite(observedMs)) errors.push('evidence:invalid-observed-at');
    if (record.expiresAt) { const expiresMs = isoMs(record.expiresAt); if (!Number.isFinite(expiresMs)) errors.push('evidence:invalid-expires-at'); else if (expiresMs <= now.getTime()) errors.push('evidence:expired'); }
  }
  if (requireExternal && record && !EXTERNAL_ORIGINS.has(record.origin)) errors.push('evidence:external-required');
  return { ok: errors.length === 0, errors };
}

export function verifyApproval(approval, { now = new Date(), keyResolver, revokedApprovalIds = new Set() } = {}) {
  const schema = validateClosedRecord('approval', approval, APPROVAL_SPEC);
  const errors = [...schema.errors];
  if (!approval) return { ok: false, errors };
  try { if (digestObject(approval, ['approvalDigest','signature']) !== approval.approvalDigest) errors.push('approval:digest-mismatch'); }
  catch { errors.push('approval:canonicalization-failed'); }
  const notBeforeMs = isoMs(approval.notBefore); const expiresMs = isoMs(approval.expiresAt); const issuedMs = isoMs(approval.issuedAt);
  if (![notBeforeMs, expiresMs, issuedMs].every(Number.isFinite)) errors.push('approval:invalid-time');
  else {
    if (notBeforeMs > now.getTime()) errors.push('approval:not-yet-valid');
    if (expiresMs <= now.getTime()) errors.push('approval:expired');
    if (issuedMs > expiresMs || notBeforeMs > expiresMs) errors.push('approval:invalid-window');
  }
  if (revokedApprovalIds.has(approval.approvalId)) errors.push('approval:revoked');
  if (!Number.isInteger(approval.maxUses) || approval.maxUses <= 0) errors.push('approval:invalid-max-uses');
  if (!Number.isInteger(approval.maxBlastRadius) || approval.maxBlastRadius < 0) errors.push('approval:invalid-blast-radius');
  if (!(approval.maxCostUsd >= 0)) errors.push('approval:invalid-cost');
  const publicKey = keyResolver?.(approval.keyId, approval.issuerId);
  if (!publicKey || !verifyDigestSignature(approval.approvalDigest, approval.signature, publicKey)) errors.push('approval:signature-invalid');
  return { ok: errors.length === 0, errors };
}

export function approvalCoversIntent(approval, intent, usage = { uses: 0, costUsd: 0, blastRadius: 0 }) {
  const errors = [];
  if (approval.tenantId !== intent.tenantId) errors.push('scope:tenant');
  if (!includesOrWildcard(approval.actorIds, intent.actorId)) errors.push('scope:actor');
  if (!includesOrWildcard(approval.operations, intent.operation)) errors.push('scope:operation');
  if (!prefixMatch(approval.resourcePrefixes, intent.resource)) errors.push('scope:resource');
  if (!includesOrWildcard(approval.purposes, intent.purpose)) errors.push('scope:purpose');
  if (!includesOrWildcard(approval.effectClasses, intent.effectClass)) errors.push('scope:effect');
  if (intent.blastRadius > approval.maxBlastRadius) errors.push('scope:blast-radius');
  if (intent.maxCostUsd > approval.maxCostUsd) errors.push('scope:intent-cost');
  if (Number(usage.uses || 0) >= approval.maxUses) errors.push('scope:uses-exhausted');
  if (Number(usage.costUsd || 0) + intent.maxCostUsd > approval.maxCostUsd) errors.push('scope:budget-exhausted');
  return { ok: errors.length === 0, errors };
}

export function admitAction(intent, context = {}) {
  const now = context.now || new Date();
  const reasons = [];
  const verifiedIntent = verifyIntent(intent);
  reasons.push(...verifiedIntent.errors);
  if (!verifiedIntent.ok) return decision('DENY', intent, reasons, context);
  if (isoMs(intent.expiresAt) <= now.getTime()) reasons.push('intent:expired');
  if (context.killState?.active) reasons.push('kill-state:active');
  if (context.revokedIntentDigests?.has(intent.intentDigest)) reasons.push('intent:revoked');
  if (CONSEQUENT_EFFECTS.has(intent.effectClass) && context.effectKnown === false) reasons.push('effect:unknown-consequential');
  if (reasons.length) return decision('DENY', intent, reasons, context);

  const evidence = (intent.evidenceIds || []).map(id => context.evidenceResolver?.(id)).filter(Boolean);
  if (evidence.length !== intent.evidenceIds.length) reasons.push('evidence:unresolved');
  for (const record of evidence) {
    const check = verifyEvidence(record, { now, requireExternal: Boolean(context.requireExternalEvidence) });
    if (record.tenantId !== intent.tenantId) check.errors.push('evidence:tenant-mismatch');
    reasons.push(...check.errors);
  }
  if (reasons.length) return decision('DENY', intent, reasons, context);

  const approvals = (context.approvals || []).map(approval => ({ approval, verify: verifyApproval(approval, context), usage: context.usageResolver?.(approval.approvalId) || { uses: 0, costUsd: 0, blastRadius: 0 } }));
  const covering = approvals.find(item => item.verify.ok && approvalCoversIntent(item.approval, intent, item.usage).ok);
  if (!covering) {
    const approvalProblems = approvals.flatMap(item => [...item.verify.errors, ...approvalCoversIntent(item.approval, intent, item.usage).errors]);
    return decision('REVIEW', intent, ['approval:no-covering-resolvable-approval', ...new Set(approvalProblems)], context);
  }

  if (typeof context.policyAuthorizer !== 'function') return decision('DENY', intent, ['policy:authorizer-missing'], context, covering.approval);
  let policy;
  try { policy = context.policyAuthorizer({ intent, approval: covering.approval, evidence }); }
  catch (error) { return decision('DENY', intent, [`policy:error:${String(error?.message || error)}`], context, covering.approval); }
  if (!policy || policy.decision !== 'ALLOW') return decision(policy?.decision === 'REVIEW' ? 'REVIEW' : 'DENY', intent, ['policy:not-allowed', ...(policy?.reasons || [])], context, covering.approval);
  return decision('ALLOW', intent, ['admission:all-gates-satisfied'], context, covering.approval);
}

function decision(value, intent, reasons, context, approval = null) {
  const base = {
    schemaVersion: 'omnia.v9.p0',
    decision: value,
    intentDigest: intent?.intentDigest || '',
    approvalId: approval?.approvalId || '',
    policyVersion: String(context.policyVersion || 'unversioned'),
    constitutionDigest: String(context.constitutionDigest || ''),
    reasons: [...new Set(reasons)].sort(),
    decidedAt: (context.now || new Date()).toISOString()
  };
  return { ...base, decisionDigest: digestObject(base) };
}

export function createExecutionReceipt(input) {
  if (!input.intentDigest || !input.authorizationDigest) throw new TypeError('receipt requires intent and authorization digests');
  const base = {
    schemaVersion: 'omnia.v9.p0', intentDigest: input.intentDigest, authorizationDigest: input.authorizationDigest,
    executorId: input.executorId, executorVersion: input.executorVersion, startedAt: input.startedAt, finishedAt: input.finishedAt,
    outcome: input.outcome, providerRefs: input.providerRefs || [], evidenceIds: input.evidenceIds || [], rollbackState: input.rollbackState || 'NOT_REQUIRED',
    actualCostUsd: Number(input.actualCostUsd || 0), idempotencyKey: input.idempotencyKey
  };
  return { ...base, receiptDigest: digestObject(base) };
}
