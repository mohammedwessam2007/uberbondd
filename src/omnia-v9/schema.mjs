function typeOk(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'finite-number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

export function validateClosedRecord(name, value, spec) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: [`${name}:not-object`] };
  const allowed = new Set(Object.keys(spec));
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${name}:unknown-field:${key}`);
  for (const [key, rule] of Object.entries(spec)) {
    const present = Object.prototype.hasOwnProperty.call(value, key);
    if (rule.required && !present) { errors.push(`${name}:missing:${key}`); continue; }
    if (!present) continue;
    if (rule.type && !typeOk(value[key], rule.type)) errors.push(`${name}:type:${key}`);
    if (rule.enum && !rule.enum.includes(value[key])) errors.push(`${name}:enum:${key}`);
    if (rule.nonEmpty && typeof value[key] === 'string' && !value[key].trim()) errors.push(`${name}:empty:${key}`);
  }
  return { ok: errors.length === 0, errors };
}

export const EFFECT_CLASSES = Object.freeze(['READ_INTERNAL','READ_EXTERNAL','WRITE_INTERNAL','COMMUNICATE_EXTERNAL','PRODUCTION_MUTATION','DATA_EXPORT','CREDENTIAL_USE','FINANCIAL','LEGAL_COMMITMENT','PHYSICAL_EFFECT','PROFESSIONAL_AUTHORITY']);
export const EVIDENCE_ORIGINS = Object.freeze(['SYNTHETIC_FIXTURE','MODEL_OUTPUT','INTERNAL_OBSERVATION','EXTERNAL_SOURCE','PROVIDER_CALLBACK','CUSTOMER_ATTESTATION','PROFESSIONAL_ATTESTATION','PRODUCTION_TELEMETRY']);
export const EPISTEMIC_RELATIONS = Object.freeze(['DIRECT','DERIVED','INFERRED','PREDICTED','SCENARIO_MODELED']);
export const VERIFICATION_CLAIMS = Object.freeze(['DIGEST_VERIFIED','IDENTITY_VERIFIED','SIGNATURE_VERIFIED','CORROBORATED']);
export const LIFECYCLE_FLAGS = Object.freeze(['ACTIVE','DISPUTED','STALE','REVOKED','QUARANTINED','EXPIRED']);

export const ACTION_INTENT_SPEC = Object.freeze({
  schemaVersion: { required: true, type: 'string', enum: ['omnia.v9.p0'] },
  missionId: { required: true, type: 'string', nonEmpty: true }, tenantId: { required: true, type: 'string', nonEmpty: true },
  actorId: { required: true, type: 'string', nonEmpty: true }, operation: { required: true, type: 'string', nonEmpty: true },
  resource: { required: true, type: 'string', nonEmpty: true }, purpose: { required: true, type: 'string', nonEmpty: true },
  effectClass: { required: true, type: 'string', enum: EFFECT_CLASSES }, argumentsDigest: { required: true, type: 'string', nonEmpty: true },
  evidenceIds: { required: true, type: 'array' }, maxCostUsd: { required: true, type: 'finite-number' }, blastRadius: { required: true, type: 'integer' },
  rollback: { required: true, type: 'string', nonEmpty: true }, createdAt: { required: true, type: 'string', nonEmpty: true },
  expiresAt: { required: true, type: 'string', nonEmpty: true }, nonce: { required: true, type: 'string', nonEmpty: true },
  idempotencyKey: { required: true, type: 'string', nonEmpty: true }, intentDigest: { required: true, type: 'string', nonEmpty: true }
});

export const APPROVAL_SPEC = Object.freeze({
  schemaVersion: { required: true, type: 'string', enum: ['omnia.v9.p0'] }, approvalId: { required: true, type: 'string', nonEmpty: true },
  issuerId: { required: true, type: 'string', nonEmpty: true }, keyId: { required: true, type: 'string', nonEmpty: true }, tenantId: { required: true, type: 'string', nonEmpty: true },
  actorIds: { required: true, type: 'array' }, operations: { required: true, type: 'array' }, resourcePrefixes: { required: true, type: 'array' },
  purposes: { required: true, type: 'array' }, effectClasses: { required: true, type: 'array' }, maxBlastRadius: { required: true, type: 'integer' },
  maxCostUsd: { required: true, type: 'finite-number' }, maxUses: { required: true, type: 'integer' }, notBefore: { required: true, type: 'string', nonEmpty: true },
  expiresAt: { required: true, type: 'string', nonEmpty: true }, issuedAt: { required: true, type: 'string', nonEmpty: true },
  approvalDigest: { required: true, type: 'string', nonEmpty: true }, signature: { required: true, type: 'string', nonEmpty: true }
});

export const EVIDENCE_SPEC = Object.freeze({
  schemaVersion: { required: true, type: 'string', enum: ['omnia.v9.p0'] }, evidenceId: { required: true, type: 'string', nonEmpty: true },
  tenantId: { required: true, type: 'string', nonEmpty: true }, subject: { required: true, type: 'string', nonEmpty: true },
  origin: { required: true, type: 'string', enum: EVIDENCE_ORIGINS }, relation: { required: true, type: 'string', enum: EPISTEMIC_RELATIONS },
  verificationClaims: { required: true, type: 'array' }, lifecycleFlags: { required: true, type: 'array' }, sourceRef: { required: true, type: 'string', nonEmpty: true },
  payloadDigest: { required: true, type: 'string', nonEmpty: true }, observedAt: { required: true, type: 'string', nonEmpty: true },
  expiresAt: { required: false, type: 'string' }, evidenceDigest: { required: true, type: 'string', nonEmpty: true }
});

export const EXECUTION_RECEIPT_SPEC = Object.freeze({
  schemaVersion: { required: true, type: 'string', enum: ['omnia.v9.p0'] }, intentDigest: { required: true, type: 'string', nonEmpty: true },
  authorizationDigest: { required: true, type: 'string', nonEmpty: true }, executorId: { required: true, type: 'string', nonEmpty: true },
  executorVersion: { required: true, type: 'string', nonEmpty: true }, startedAt: { required: true, type: 'string', nonEmpty: true },
  finishedAt: { required: true, type: 'string', nonEmpty: true }, outcome: { required: true, type: 'string', enum: ['SUCCEEDED','FAILED','UNCERTAIN','BLOCKED'] },
  providerRefs: { required: true, type: 'array' }, evidenceIds: { required: true, type: 'array' }, rollbackState: { required: true, type: 'string', nonEmpty: true },
  actualCostUsd: { required: true, type: 'finite-number' }, idempotencyKey: { required: true, type: 'string', nonEmpty: true },
  receiptDigest: { required: true, type: 'string', nonEmpty: true }
});
