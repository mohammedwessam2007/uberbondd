import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  compileAgentCodeChangeSet,
  contentSha256
} from './agent-code-change-contract.mjs';

export const AGENT_GIT_SANDBOX_COLLECTOR_POLICY_VERSION = 'agent-git-sandbox-collector-1.0.0';

const MAX_OUTPUT = 2_000_000;
const MAX_CHANGES = 20;
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;

function text(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_GIT_SANDBOX_COLLECTOR_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

function defaultRun({ cwd, args }) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 30_000, maxBuffer: MAX_OUTPUT, env: { PATH: process.env.PATH || '' } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error([stderr, stdout, error.message].filter(Boolean).join('\n').slice(0, 4000)));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parsePorcelainZ(stdout) {
  const entries = String(stdout || '').split('\0').filter(Boolean);
  const changes = [];
  for (let index = 0; index < entries.length; index += 1) {
    const record = entries[index];
    if (record.length < 4 || record[2] !== ' ') return { ok: false, reasonCodes: ['git-status-record-invalid'] };
    const status = record.slice(0, 2);
    let filePath = record.slice(3);
    if (!filePath) return { ok: false, reasonCodes: ['git-status-path-missing'] };
    if (/[RC]/.test(status)) {
      // Rename/copy records carry a second NUL-delimited path. Rather than
      // guessing delete/create semantics, reject and require a simpler edit.
      if (entries[index + 1]) index += 1;
      return { ok: false, reasonCodes: ['git-rename-copy-not-supported'] };
    }
    filePath = filePath.replaceAll('\\', '/');
    changes.push({ status, path: filePath });
  }
  return { ok: true, changes };
}

function classify(status) {
  if (status === '??' || status.includes('A')) return 'CREATE';
  if (status.includes('D')) return 'DELETE';
  if (status.includes('U') || status === 'AA' || status === 'DD') return 'CONFLICT';
  if (status.includes('M') || status.includes('T')) return 'UPDATE';
  return 'UNKNOWN';
}

async function readCurrentFile(root, relativePath) {
  const target = path.resolve(root, relativePath);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`sandbox path escape: ${relativePath}`);
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`non-regular changed file: ${relativePath}`);
  return fs.readFile(target, 'utf8');
}

async function gitShow(run, cwd, baseRevision, relativePath) {
  const response = await run({ cwd, args: ['show', `${baseRevision}:${relativePath}`] });
  return String(response.stdout ?? '');
}

export async function collectAgentGitSandboxChanges({
  sandboxRoot,
  taskId,
  baseRevision,
  verification = ['npm run check'],
  summary = 'Claude Code sandbox changes collected for deterministic verification.',
  runGit = defaultRun
} = {}) {
  const root = path.resolve(String(sandboxRoot || ''));
  const base = text(baseRevision, 160);
  const id = text(taskId, 160);
  const reasons = [];
  if (!sandboxRoot || root === path.parse(root).root) reasons.push('safe-sandbox-root-required');
  if (!id) reasons.push('task-id-required');
  if (!SAFE_REVISION.test(base)) reasons.push('safe-base-revision-required');
  if (typeof runGit !== 'function') reasons.push('git-runner-required');
  if (reasons.length) return fail(reasons);

  try {
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail(['real-sandbox-directory-required']);
  } catch {
    return fail(['real-sandbox-directory-required']);
  }

  let topLevel;
  let resolvedBase;
  let status;
  try {
    topLevel = text((await runGit({ cwd: root, args: ['rev-parse', '--show-toplevel'] })).stdout, 1000);
    resolvedBase = text((await runGit({ cwd: root, args: ['rev-parse', '--verify', `${base}^{commit}`] })).stdout, 160);
    status = await runGit({ cwd: root, args: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] });
  } catch (error) {
    return fail(['git-sandbox-introspection-failed'], 'INTROSPECTION_FAILED', { detail: text(error?.message, 1000) });
  }

  let realRoot;
  let realTop;
  try {
    realRoot = await fs.realpath(root);
    realTop = await fs.realpath(topLevel);
  } catch {
    return fail(['git-toplevel-realpath-failed']);
  }
  if (realRoot !== realTop) return fail(['sandbox-root-must-equal-git-toplevel']);
  if (!/^[a-f0-9]{40,64}$/i.test(resolvedBase)) return fail(['resolved-base-commit-invalid']);

  const parsed = parsePorcelainZ(status.stdout);
  if (!parsed.ok) return fail(parsed.reasonCodes);
  if (!parsed.changes.length) {
    return {
      ok: true,
      policyVersion: AGENT_GIT_SANDBOX_COLLECTOR_POLICY_VERSION,
      status: 'NO_CHANGES',
      taskId: id,
      baseRevision: resolvedBase,
      businessEffectAuthority: 'NONE'
    };
  }
  if (parsed.changes.length > MAX_CHANGES) return fail(['sandbox-change-count-limit']);

  const operations = [];
  try {
    for (const entry of parsed.changes) {
      const operation = classify(entry.status);
      if (operation === 'CONFLICT') return fail([`git-conflict-rejected:${entry.path}`]);
      if (operation === 'UNKNOWN') return fail([`git-status-unsupported:${entry.status}:${entry.path}`]);

      if (operation === 'CREATE') {
        const content = await readCurrentFile(root, entry.path);
        operations.push({
          operation,
          path: entry.path,
          content,
          rationale: 'Created by the bounded engineering sandbox.'
        });
        continue;
      }

      const before = await gitShow(runGit, root, resolvedBase, entry.path);
      if (operation === 'DELETE') {
        operations.push({
          operation,
          path: entry.path,
          beforeSha256: contentSha256(before),
          content: null,
          rationale: 'Deleted by the bounded engineering sandbox.'
        });
        continue;
      }

      const content = await readCurrentFile(root, entry.path);
      operations.push({
        operation,
        path: entry.path,
        beforeSha256: contentSha256(before),
        content,
        rationale: 'Updated by the bounded engineering sandbox.'
      });
    }
  } catch (error) {
    return fail(['sandbox-change-materialization-failed'], 'COLLECTION_FAILED', { detail: text(error?.message, 1000) });
  }

  const changeSet = compileAgentCodeChangeSet({
    taskId: id,
    baseRevision: resolvedBase,
    changes: operations,
    verification,
    summary,
    consequenceClass: 'LOCAL_PREPARATION'
  });
  if (!changeSet.ok) return fail(changeSet.reasonCodes || ['change-set-compilation-failed'], 'CHANGE_SET_REJECTED');

  return {
    ok: true,
    policyVersion: AGENT_GIT_SANDBOX_COLLECTOR_POLICY_VERSION,
    status: 'CHANGE_SET_COLLECTED',
    resolvedBaseRevision: resolvedBase,
    rawStatuses: parsed.changes.map(item => ({ status: item.status, path: item.path })),
    changeSet,
    businessEffectAuthority: 'NONE'
  };
}
