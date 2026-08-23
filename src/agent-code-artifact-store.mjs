import crypto from 'node:crypto';
import { validateAgentCodeChangeSet } from './agent-code-change-contract.mjs';
import { containsSecretValue } from './secret-patterns.mjs';

export const AGENT_CODE_ARTIFACT_STORE_POLICY_VERSION = 'agent-code-artifact-store-1.1.0';

const AUDIT_TYPE = 'agent_code_change_artifact';
const MAX_SCAN = 3000;
const MAX_ARTIFACT_BYTES = 220_000;


function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes, status = 'REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_CODE_ARTIFACT_STORE_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function validStore(store) {
  return Boolean(store && typeof store.log === 'function' && typeof store.list === 'function');
}

function artifactRef(changeSetId) {
  return `artifact:agent-code-change:${changeSetId}`;
}

function materialSecret(changeSet) {
  return (changeSet?.changes || []).some(change => containsSecretValue(String(change?.content || '')));
}

async function rows(store, limit = MAX_SCAN) {
  const result = await store.list('auditLog', {
    filters: { type: AUDIT_TYPE },
    limit: Math.max(1, Math.min(MAX_SCAN, Number(limit || MAX_SCAN)))
  });
  return Array.isArray(result) ? result : [];
}

function safeArtifact(value) {
  if (!validateAgentCodeChangeSet(value).ok) return null;
  if (materialSecret(value)) return null;
  if (bytes(value) > MAX_ARTIFACT_BYTES) return null;
  return structuredClone(value);
}

function inspectStoredArtifactRow(row, expectedRef = null) {
  const ref = row?.detail?.artifactRef;
  if (!ref || (expectedRef && ref !== expectedRef)) {
    return { ok: false, reasonCodes: ['stored-artifact-reference-invalid'] };
  }
  const artifact = safeArtifact(row?.detail?.changeSet);
  if (!artifact) return { ok: false, reasonCodes: ['stored-artifact-corrupt'] };
  const actualDigest = digest(artifact);
  const declaredDigest = text(row?.detail?.artifactSha256, 128).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(declaredDigest) || actualDigest !== declaredDigest) {
    return { ok: false, reasonCodes: ['stored-artifact-digest-mismatch'] };
  }
  if (artifactRef(artifact.changeSetId) !== ref) {
    return { ok: false, reasonCodes: ['stored-artifact-identity-mismatch'] };
  }
  return { ok: true, artifact, artifactSha256: actualDigest };
}

export async function saveAgentCodeChangeArtifact(store, changeSet, { date = new Date() } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const artifact = safeArtifact(changeSet);
  if (!artifact) return fail(['valid-secret-free-relay-bounded-change-set-required']);
  const ref = artifactRef(artifact.changeSetId);
  const artifactSha256 = digest(artifact);

  const existingRows = await rows(store);
  const matching = existingRows.filter(row => row?.detail?.artifactRef === ref);
  if (matching.length) {
    const inspected = matching.map(row => ({ row, inspection: inspectStoredArtifactRow(row, ref) }));
    const corrupt = inspected.find(item => !item.inspection.ok);
    if (corrupt) {
      return fail(corrupt.inspection.reasonCodes, 'CORRUPT', { artifactRef: ref, auditId: corrupt.row?.id || null });
    }
    const conflicting = inspected.find(item => item.inspection.artifactSha256 !== artifactSha256);
    if (conflicting) {
      return fail(['artifact-identity-collision'], 'CONFLICT', { artifactRef: ref, auditId: conflicting.row?.id || null });
    }
    const canonical = inspected
      .map(item => item.row)
      .sort((a, b) => String(b?.detail?.createdAt || b?.createdAt || '').localeCompare(String(a?.detail?.createdAt || a?.createdAt || '')))[0];
    return {
      ok: true,
      policyVersion: AGENT_CODE_ARTIFACT_STORE_POLICY_VERSION,
      status: 'ALREADY_STORED',
      artifactRef: ref,
      changeSetId: artifact.changeSetId,
      artifactSha256,
      auditId: canonical?.id || null,
      storedAt: canonical?.detail?.createdAt || canonical?.createdAt || null,
      businessEffectAuthority: 'NONE'
    };
  }

  const at = timestamp(date);
  const detail = {
    policyVersion: AGENT_CODE_ARTIFACT_STORE_POLICY_VERSION,
    artifactRef: ref,
    changeSetId: artifact.changeSetId,
    taskId: artifact.taskId,
    baseRevision: artifact.baseRevision,
    artifactSha256,
    changeSet: artifact,
    createdAt: at,
    businessEffectAuthority: 'NONE'
  };
  const row = await store.log(AUDIT_TYPE, detail);
  return {
    ok: true,
    policyVersion: AGENT_CODE_ARTIFACT_STORE_POLICY_VERSION,
    status: 'STORED',
    artifactRef: ref,
    changeSetId: artifact.changeSetId,
    artifactSha256,
    auditId: row?.id || null,
    storedAt: at,
    businessEffectAuthority: 'NONE'
  };
}

export async function loadAgentCodeChangeArtifact(store, refOrId) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const raw = text(refOrId, 500);
  if (!raw) return fail(['artifact-reference-required']);
  const ref = raw.startsWith('artifact:agent-code-change:') ? raw : artifactRef(raw);
  const all = await rows(store);
  const matching = all.filter(row => row?.detail?.artifactRef === ref);
  if (!matching.length) return fail(['code-change-artifact-not-found'], 'NOT_FOUND', { artifactRef: ref });

  let expectedDigest = null;
  const inspected = [];
  for (const row of matching) {
    const inspection = inspectStoredArtifactRow(row, ref);
    if (!inspection.ok) {
      return fail(inspection.reasonCodes, 'CORRUPT', { artifactRef: ref, auditId: row?.id || null });
    }
    if (expectedDigest == null) expectedDigest = inspection.artifactSha256;
    else if (inspection.artifactSha256 !== expectedDigest) {
      return fail(['duplicate-artifact-digest-conflict'], 'CORRUPT', { artifactRef: ref, auditId: row?.id || null });
    }
    inspected.push({ row, inspection });
  }

  inspected.sort((a, b) => String(b?.row?.detail?.createdAt || b?.row?.createdAt || '').localeCompare(String(a?.row?.detail?.createdAt || a?.row?.createdAt || '')));
  const selected = inspected[0];
  return {
    ok: true,
    policyVersion: AGENT_CODE_ARTIFACT_STORE_POLICY_VERSION,
    status: 'LOADED',
    artifactRef: ref,
    artifactSha256: selected.inspection.artifactSha256,
    changeSet: selected.inspection.artifact,
    auditId: selected.row?.id || null,
    storedAt: selected.row?.detail?.createdAt || selected.row?.createdAt || null,
    businessEffectAuthority: 'NONE'
  };
}

export async function listAgentCodeChangeArtifacts(store, { taskId = null, limit = 20 } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const task = text(taskId, 160);
  const all = await rows(store);
  const latest = new Map();
  for (const row of all) {
    const ref = row?.detail?.artifactRef;
    if (!ref || (task && row?.detail?.taskId !== task)) continue;
    const current = latest.get(ref);
    const rowTime = String(row?.detail?.createdAt || row?.createdAt || '');
    const currentTime = String(current?.detail?.createdAt || current?.createdAt || '');
    if (!current || rowTime > currentTime) latest.set(ref, row);
  }
  const items = [...latest.values()]
    .sort((a, b) => String(b?.detail?.createdAt || '').localeCompare(String(a?.detail?.createdAt || '')))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 20))))
    .map(row => ({
      artifactRef: row.detail.artifactRef,
      changeSetId: row.detail.changeSetId,
      taskId: row.detail.taskId,
      baseRevision: row.detail.baseRevision,
      artifactSha256: row.detail.artifactSha256,
      createdAt: row.detail.createdAt,
      auditId: row.id || null
    }));
  return {
    ok: true,
    policyVersion: AGENT_CODE_ARTIFACT_STORE_POLICY_VERSION,
    status: 'LISTED',
    count: items.length,
    items,
    businessEffectAuthority: 'NONE'
  };
}

export const AGENT_CODE_ARTIFACT_AUDIT_TYPE = AUDIT_TYPE;
