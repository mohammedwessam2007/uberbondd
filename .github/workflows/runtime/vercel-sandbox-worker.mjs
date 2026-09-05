import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

import { applyAgentCodeChangeSet } from '../../../src/agent-code-change-applier.mjs';
import { runSandboxVerification } from '../../../src/agent-sandbox-verifier.mjs';
import { collectAgentGitSandboxChanges } from '../../../src/agent-git-sandbox-collector.mjs';
import { validateAgentCodeChangeSet } from '../../../src/agent-code-change-contract.mjs';

export const VERCEL_SANDBOX_WORKER_POLICY_VERSION = 'uberbond.vercel-sandbox-worker-1.0.0';
const gunzip = promisify(zlib.gunzip);
const MAX_INPUT_BYTES = 500_000;

function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function fail(reasonCodes, status = 'SANDBOX_OPERATION_BLOCKED', extra = {}) {
  return { ok: false, policyVersion: VERCEL_SANDBOX_WORKER_POLICY_VERSION, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], businessEffectAuthority: 'NONE', ...extra };
}

export async function decodeWorkerPayload(encoded) {
  try {
    const compressed = Buffer.from(String(encoded || ''), 'base64url');
    if (!compressed.length || compressed.length > MAX_INPUT_BYTES) return fail(['bounded-compressed-payload-required']);
    const raw = await gunzip(compressed);
    if (raw.byteLength > MAX_INPUT_BYTES) return fail(['bounded-worker-payload-required']);
    const payload = JSON.parse(raw.toString('utf8'));
    return { ok: true, payload };
  } catch { return fail(['valid-gzip-json-payload-required']); }
}

export async function runSandboxWorkerOperation({ operation, payload, sandboxRoot = process.cwd(), date = new Date() } = {}) {
  const root = path.resolve(String(sandboxRoot || ''));
  if (!root || root === path.parse(root).root) return fail(['safe-sandbox-root-required']);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail(['worker-payload-object-required']);

  if (operation === 'apply') {
    const validation = validateAgentCodeChangeSet(payload.changeSet);
    if (!validation.ok) return fail(validation.reasonCodes || ['valid-change-set-required']);
    return applyAgentCodeChangeSet({ sandboxRoot: root, changeSet: payload.changeSet, date });
  }

  if (operation === 'verify') {
    return runSandboxVerification({
      sandboxRoot: root,
      isolationReceipt: payload.isolationReceipt,
      commands: payload.commands,
      timeoutMs: Math.min(15 * 60 * 1000, Math.max(1_000, Number(payload.timeoutMs || 900_000))),
      // Candidate subprocesses receive only the verifier's own sanitized PATH / HOME
      // projection. No Vercel OIDC, GitHub token or provider credential is forwarded.
      env: { PATH: process.env.PATH || '', LANG: process.env.LANG || 'C.UTF-8', TMPDIR: '/tmp' },
      date
    });
  }

  if (operation === 'collect') {
    return collectAgentGitSandboxChanges({
      sandboxRoot: root,
      taskId: payload.taskId,
      baseRevision: payload.baseRevision,
      verification: payload.verification,
      summary: payload.summary
    });
  }

  return fail(['supported-sandbox-operation-required']);
}

async function main() {
  const operation = text(process.argv[2], 40);
  const decoded = await decodeWorkerPayload(process.argv[3]);
  const outputPath = path.resolve(text(process.argv[4], 1000));
  if (!decoded.ok) {
    await fs.writeFile(outputPath, `${JSON.stringify(decoded)}\n`, 'utf8');
    process.exitCode = 2;
    return;
  }
  const result = await runSandboxWorkerOperation({ operation, payload: decoded.payload });
  await fs.writeFile(outputPath, `${JSON.stringify(result)}\n`, 'utf8');
  if (!result?.ok) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
