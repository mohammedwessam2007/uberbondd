import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  validateAgentCodeChangeSet,
  contentSha256,
  AGENT_CODE_CHANGE_POLICY_VERSION
} from './agent-code-change-contract.mjs';

export const AGENT_CODE_APPLIER_POLICY_VERSION = 'agent-code-applier-1.0.0';

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const d = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_CODE_APPLIER_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function underRoot(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

async function assertNoSymlinkEscape(root, relativePath) {
  const parts = relativePath.replaceAll('\\', '/').split('/').filter(Boolean);
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = path.join(current, parts[index]);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) return false;
      if (!stat.isDirectory()) return false;
    } catch (error) {
      if (error?.code === 'ENOENT') return true;
      throw error;
    }
  }
  if (await exists(path.join(root, ...parts))) {
    const stat = await fs.lstat(path.join(root, ...parts));
    if (stat.isSymbolicLink()) return false;
  }
  return true;
}

async function currentFileState(target) {
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) return { exists: true, symlink: true, sha256: null };
    if (!stat.isFile()) return { exists: true, symlink: false, sha256: null, nonFile: true };
    const content = await fs.readFile(target, 'utf8');
    return { exists: true, symlink: false, nonFile: false, content, sha256: contentSha256(content) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, symlink: false, nonFile: false, content: null, sha256: null };
    throw error;
  }
}

export async function preflightAgentCodeChangeSet({ sandboxRoot, changeSet } = {}) {
  const validation = validateAgentCodeChangeSet(changeSet);
  if (!validation.ok) return fail(validation.reasonCodes || ['valid-change-set-required']);
  const root = path.resolve(String(sandboxRoot || ''));
  if (!sandboxRoot || root === path.parse(root).root) return fail(['safe-sandbox-root-required']);

  const rootStat = await fs.lstat(root).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) return fail(['existing-real-sandbox-directory-required']);

  const checks = [];
  const reasons = [];
  for (const change of changeSet.changes) {
    const target = underRoot(root, change.path);
    if (!target) {
      reasons.push(`sandbox-path-escape:${change.path}`);
      continue;
    }
    const safeAncestry = await assertNoSymlinkEscape(root, change.path);
    if (!safeAncestry) {
      reasons.push(`symlink-path-rejected:${change.path}`);
      continue;
    }
    const state = await currentFileState(target);
    if (state.symlink) reasons.push(`symlink-target-rejected:${change.path}`);
    if (state.nonFile) reasons.push(`non-file-target-rejected:${change.path}`);
    if (change.operation === 'CREATE' && state.exists) reasons.push(`create-target-already-exists:${change.path}`);
    if ((change.operation === 'UPDATE' || change.operation === 'DELETE') && !state.exists) reasons.push(`existing-target-required:${change.path}`);
    if ((change.operation === 'UPDATE' || change.operation === 'DELETE') && state.sha256 && state.sha256 !== change.beforeSha256) {
      reasons.push(`before-hash-mismatch:${change.path}`);
    }
    checks.push({
      operation: change.operation,
      path: change.path,
      exists: state.exists,
      currentSha256: state.sha256,
      expectedBeforeSha256: change.beforeSha256,
      expectedAfterSha256: change.afterSha256
    });
  }

  if (reasons.length) return fail(reasons, 'PREFLIGHT_FAILED', { checks });
  return {
    ok: true,
    policyVersion: AGENT_CODE_APPLIER_POLICY_VERSION,
    status: 'PREFLIGHT_PASS',
    changeSetId: changeSet.changeSetId,
    sandboxRoot: root,
    checks,
    businessEffectAuthority: 'NONE'
  };
}

export async function applyAgentCodeChangeSet({ sandboxRoot, changeSet, date = new Date() } = {}) {
  const preflight = await preflightAgentCodeChangeSet({ sandboxRoot, changeSet });
  if (!preflight.ok) return preflight;
  const root = preflight.sandboxRoot;
  const applied = [];

  // Apply only after the entire set preflights. Every UPDATE/DELETE is protected
  // by its before hash, preventing stale model output from silently overwriting
  // a newer sandbox state.
  try {
    for (const change of changeSet.changes) {
      const target = underRoot(root, change.path);
      if (!target) throw new Error(`sandbox escape after preflight: ${change.path}`);
      if (change.operation === 'CREATE') {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, change.content, { encoding: 'utf8', flag: 'wx' });
      } else if (change.operation === 'UPDATE') {
        const current = await currentFileState(target);
        if (!current.exists || current.sha256 !== change.beforeSha256) throw new Error(`concurrent change detected: ${change.path}`);
        await fs.writeFile(target, change.content, { encoding: 'utf8', flag: 'w' });
      } else if (change.operation === 'DELETE') {
        const current = await currentFileState(target);
        if (!current.exists || current.sha256 !== change.beforeSha256) throw new Error(`concurrent change detected: ${change.path}`);
        await fs.unlink(target);
      }
      const after = await currentFileState(target);
      const actualAfterSha256 = after.exists ? after.sha256 : null;
      if (actualAfterSha256 !== change.afterSha256) throw new Error(`post-write hash mismatch: ${change.path}`);
      applied.push({ operation: change.operation, path: change.path, afterSha256: actualAfterSha256 });
    }
  } catch (error) {
    // This layer intentionally does not pretend it can rollback arbitrary file
    // writes after an I/O failure. A failed apply quarantines the sandbox and
    // requires it to be discarded/recreated from the immutable base revision.
    return fail(['sandbox-apply-incomplete-discard-required'], 'SANDBOX_QUARANTINED', {
      changeSetId: changeSet.changeSetId,
      applied,
      detail: text(error?.message, 1000)
    });
  }

  const receiptCore = {
    policyVersion: AGENT_CODE_APPLIER_POLICY_VERSION,
    changeSetPolicyVersion: AGENT_CODE_CHANGE_POLICY_VERSION,
    changeSetId: changeSet.changeSetId,
    taskId: changeSet.taskId,
    baseRevision: changeSet.baseRevision,
    applied,
    verificationRequested: [...changeSet.verification],
    appliedAt: timestamp(date),
    sandboxOnly: true,
    businessEffectAuthority: 'NONE'
  };

  return {
    ok: true,
    ...receiptCore,
    status: 'SANDBOX_APPLIED_VERIFICATION_REQUIRED',
    applyReceiptId: `agent_apply_${digest(receiptCore).slice(0, 24)}`
  };
}
