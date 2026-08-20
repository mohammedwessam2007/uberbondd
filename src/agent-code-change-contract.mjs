import crypto from 'node:crypto';
import path from 'node:path';

export const AGENT_CODE_CHANGE_POLICY_VERSION = 'agent-code-change-1.1.0';

const MAX_CHANGES = 20;
// Keep an entire change-set comfortably below the cloud relay's 250KB result
// ceiling so verified engineering artifacts can travel through the canonical
// result path without a second unbounded blob channel.
const MAX_FILE_BYTES = 80_000;
const MAX_TOTAL_BYTES = 180_000;
const MAX_TEXT = 4_000;
const OPS = new Set(['CREATE', 'UPDATE', 'DELETE']);

const PROTECTED_PREFIXES = Object.freeze([
  '.git',
  '.env',
  'credentials',
  'lite',
  'node_modules',
  '.github/workflows'
]);

const HIGH_RISK_SECRET_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/
]);

function text(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function bytes(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

function fail(reasonCodes, status = 'REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_CODE_CHANGE_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function normalizedRelativePath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const original = value.trim();
  if (path.isAbsolute(original) || /^[A-Za-z]:[\\/]/.test(original)) return null;
  const slash = original.replaceAll('\\', '/');
  const normalized = path.posix.normalize(slash);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return null;
  if (normalized.startsWith('/')) return null;
  return normalized;
}

function protectedPath(filePath) {
  const lower = filePath.toLowerCase();
  return PROTECTED_PREFIXES.some(prefix => {
    const p = prefix.toLowerCase();
    if (p === '.env') return lower === '.env' || lower.startsWith('.env.') || lower.startsWith('.env/');
    return lower === p || lower.startsWith(`${p}/`);
  });
}

function secretMaterial(content) {
  if (typeof content !== 'string') return false;
  return HIGH_RISK_SECRET_PATTERNS.some(pattern => pattern.test(content));
}

function sha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || '').trim()) ? String(value).trim().toLowerCase() : null;
}

function normalizedTests(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, 20);
}

function normalizeChange(change, index) {
  const reasons = [];
  if (!change || typeof change !== 'object' || Array.isArray(change)) {
    return { ok: false, reasons: [`change-${index}-object-required`] };
  }

  const operation = text(change.operation, 20).toUpperCase();
  if (!OPS.has(operation)) reasons.push(`change-${index}-operation-invalid`);
  const filePath = normalizedRelativePath(change.path);
  if (!filePath) reasons.push(`change-${index}-path-invalid`);
  else if (protectedPath(filePath)) reasons.push(`change-${index}-protected-path`);

  const beforeSha256 = sha256(change.beforeSha256);
  const content = change.content == null ? null : String(change.content);

  if (operation === 'CREATE') {
    if (change.beforeSha256 != null && String(change.beforeSha256).trim()) reasons.push(`change-${index}-create-before-hash-must-be-empty`);
    if (content == null) reasons.push(`change-${index}-create-content-required`);
  }

  if (operation === 'UPDATE' || operation === 'DELETE') {
    if (!beforeSha256) reasons.push(`change-${index}-before-hash-required`);
  }

  if (operation === 'UPDATE' && content == null) reasons.push(`change-${index}-update-content-required`);
  if (operation === 'DELETE' && content != null && content.length > 0) reasons.push(`change-${index}-delete-content-must-be-empty`);

  if (content != null && bytes(content) > MAX_FILE_BYTES) reasons.push(`change-${index}-file-size-limit`);
  if (content != null && secretMaterial(content)) reasons.push(`change-${index}-credential-material-rejected`);

  const rationale = text(change.rationale, 1000);
  if (!rationale) reasons.push(`change-${index}-rationale-required`);

  if (reasons.length) return { ok: false, reasons };

  return {
    ok: true,
    value: {
      operation,
      path: filePath,
      beforeSha256: operation === 'CREATE' ? null : beforeSha256,
      afterSha256: operation === 'DELETE' ? null : hash(content),
      content: operation === 'DELETE' ? null : content,
      rationale
    }
  };
}

export function compileAgentCodeChangeSet({
  taskId,
  baseRevision,
  changes = [],
  verification = [],
  summary = '',
  consequenceClass = 'LOCAL_PREPARATION'
} = {}) {
  const reasons = [];
  const id = text(taskId, 160);
  const base = text(baseRevision, 160);
  const normalizedConsequence = text(consequenceClass, 80).toUpperCase();
  if (!id) reasons.push('task-id-required');
  if (!base) reasons.push('base-revision-required');
  if (normalizedConsequence !== 'LOCAL_PREPARATION') reasons.push('local-preparation-only');
  if (!Array.isArray(changes) || !changes.length) reasons.push('at-least-one-change-required');
  if (Array.isArray(changes) && changes.length > MAX_CHANGES) reasons.push('change-count-limit');

  const normalizedChanges = [];
  for (let index = 0; index < (Array.isArray(changes) ? changes.length : 0); index += 1) {
    const normalized = normalizeChange(changes[index], index);
    if (!normalized.ok) reasons.push(...normalized.reasons);
    else normalizedChanges.push(normalized.value);
  }

  const paths = normalizedChanges.map(change => change.path);
  if (new Set(paths).size !== paths.length) reasons.push('duplicate-change-path');
  const totalBytes = normalizedChanges.reduce((sum, change) => sum + bytes(change.content), 0);
  if (totalBytes > MAX_TOTAL_BYTES) reasons.push('change-set-total-size-limit');

  const tests = normalizedTests(verification);
  if (!tests.length) reasons.push('verification-required');
  const normalizedSummary = text(summary, 2000);
  if (!normalizedSummary) reasons.push('change-summary-required');

  if (reasons.length) return fail(reasons);

  const identity = {
    taskId: id,
    baseRevision: base,
    changes: normalizedChanges.map(change => ({
      operation: change.operation,
      path: change.path,
      beforeSha256: change.beforeSha256,
      afterSha256: change.afterSha256,
      rationale: change.rationale
    })),
    verification: tests,
    summary: normalizedSummary
  };

  return {
    ok: true,
    policyVersion: AGENT_CODE_CHANGE_POLICY_VERSION,
    status: 'READY_FOR_SANDBOX_APPLY',
    changeSetId: `agent_changes_${hash(identity).slice(0, 24)}`,
    taskId: id,
    baseRevision: base,
    consequenceClass: 'LOCAL_PREPARATION',
    businessEffectAuthority: 'NONE',
    summary: normalizedSummary,
    changes: normalizedChanges,
    verification: tests,
    totals: {
      files: normalizedChanges.length,
      contentBytes: totalBytes,
      relaySafeEnvelopeBytes: MAX_TOTAL_BYTES
    }
  };
}

export function validateAgentCodeChangeSet(changeSet) {
  if (!changeSet || typeof changeSet !== 'object' || Array.isArray(changeSet)) return fail(['change-set-object-required'], 'INVALID');
  if (changeSet.ok !== true || changeSet.policyVersion !== AGENT_CODE_CHANGE_POLICY_VERSION) return fail(['change-set-policy-mismatch'], 'INVALID');
  const rebuilt = compileAgentCodeChangeSet({
    taskId: changeSet.taskId,
    baseRevision: changeSet.baseRevision,
    changes: (changeSet.changes || []).map(change => ({
      operation: change.operation,
      path: change.path,
      beforeSha256: change.beforeSha256,
      content: change.content,
      rationale: change.rationale
    })),
    verification: changeSet.verification,
    summary: changeSet.summary,
    consequenceClass: changeSet.consequenceClass
  });
  if (!rebuilt.ok) return fail(rebuilt.reasonCodes, 'INVALID');
  if (rebuilt.changeSetId !== changeSet.changeSetId) return fail(['change-set-identity-mismatch'], 'INVALID');
  if (changeSet.businessEffectAuthority !== 'NONE') return fail(['business-effect-authority-must-remain-none'], 'INVALID');
  return {
    ok: true,
    policyVersion: AGENT_CODE_CHANGE_POLICY_VERSION,
    status: 'VALID',
    changeSetId: changeSet.changeSetId,
    taskId: changeSet.taskId
  };
}

export function contentSha256(content) {
  return hash(String(content ?? ''));
}
