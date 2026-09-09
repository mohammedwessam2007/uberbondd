#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { runUberBondSelfMaintenance } from '../src/uberbond-self-maintainer.mjs';
import { createLinuxSelfMaintainerSandboxHost } from '../src/linux-self-maintainer-sandbox.mjs';
import { decideSelfMaintainerContinuation } from '../src/self-maintainer-continuation-policy.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_AUTONOMY_VERIFY_VERSION = 'uberbond.sovereign-autonomy-verify.v4';
const SHA40 = /^[a-f0-9]{40}$/i;
const ATTEMPT64 = /^[a-f0-9]{64}$/i;
const MAX_BYTES = 8_000_000;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
function fail(reasonCodes, status = 'SOVEREIGN_AUTONOMY_VERIFY_REFUSED', extra = {}) { return { ok: false, policyVersion: SOVEREIGN_AUTONOMY_VERIFY_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra }; }
function run(executable, args, { cwd, env = {}, timeoutMs = 30_000 } = {}) { return new Promise(resolve => execFile(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer: MAX_BYTES, windowsHide: true }, (error, stdout, stderr) => resolve({ exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0), stdout: String(stdout || ''), stderr: String(stderr || '') }))); }
async function readJson(file) { try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null; const v = JSON.parse(await fs.readFile(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } }
async function atomicJson(file, value, mode = 0o600) { await fs.mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp.${process.pid}`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode }); await fs.chmod(tmp, mode); await fs.rename(tmp, file); }
function safeChild(rootValue, fileValue, defaultRoot, defaultName) { const root = path.resolve(rootValue || defaultRoot); const target = path.resolve(fileValue || path.join(root, defaultName)); return target.startsWith(`${root}${path.sep}`) && target !== root ? target : null; }
async function writeContinuation({ continuationPath, priorReceipt, head, taskId, relayStatus, reasonCodes = [] }) {
  const continuation = decideSelfMaintainerContinuation({
    taskId,
    baseRevision: head,
    relayStatus,
    reasonCodes,
    evidenceRefs: [`sovereign-autonomy-verifier:${relayStatus}`, ...reasonCodes.map(code => `reason:${code}`)]
  });
  const priorAttemptId = text(priorReceipt?.observedAttemptId, 100).toLowerCase();
  const receipt = {
    schemaVersion: 'uberbond.sovereign-local-continuation-receipt.v1',
    observedBaseRevision: head,
    observedTaskId: taskId,
    observedAttemptId: ATTEMPT64.test(priorAttemptId) ? priorAttemptId : null,
    observedReasonCodes: reasonCodes,
    continuation,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'THE VERIFIER ADVANCES ONLY THE EXISTING DIGEST-BOUND ATTEMPT. FAILURE REQUIRES CANONICAL STRATEGY MUTATION; VERIFIED OUTPUT WAITS FOR SEPARATE PROMOTION AUTHORITY.'
  };
  await atomicJson(continuationPath, receipt);
  return receipt;
}

export async function runSovereignAutonomyVerification({ env = process.env, repoRoot = process.cwd(), runProcess = run } = {}) {
  if (process.platform !== 'linux') return fail(['linux-authoring-host-required'], 'SOVEREIGN_AUTONOMY_ISOLATION_UNAVAILABLE');
  const root = await fs.realpath(repoRoot).catch(() => null); if (!root) return fail(['real-source-repository-required']);
  const controlDir = path.resolve(env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control'); const autonomyDir = path.join(controlDir, 'autonomy'); const taskPath = path.join(autonomyDir, 'next-task.json'); const continuationPath = path.join(autonomyDir, 'continuation-receipt.json');
  const resultPath = safeChild(env.UBERBOND_WORKER_OUTBOX_ROOT, env.UBERBOND_WORKER_RESULT_PATH, '/var/lib/uberbond-worker/outbox', 'result.json');
  const governancePath = safeChild(env.UBERBOND_GOVERNANCE_INBOX_ROOT, env.UBERBOND_GOVERNANCE_VERIFIED_PATH, '/var/lib/uberbond-governance/inbox', 'verified.json');
  const verifiedPath = path.join(autonomyDir, 'verified-change.json');
  if (!resultPath) return fail(['safe-isolated-worker-result-path-required']); if (!governancePath) return fail(['safe-governance-inbox-path-required']);

  const headRead = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: root, env: { PATH: env.PATH || '' } }); const head = text(headRead.stdout, 80).toLowerCase(); if (headRead.exitCode !== 0 || !SHA40.test(head)) return fail(['exact-source-commit-required']);
  const dirty = await runProcess('git', ['status', '--porcelain'], { cwd: root, env: { PATH: env.PATH || '' } }); if (dirty.exitCode !== 0 || text(dirty.stdout, 20_000)) return fail(['clean-source-checkout-required']);
  const task = await readJson(taskPath); const result = await readJson(resultPath); const priorReceipt = await readJson(continuationPath);
  if (!task?.taskId) return fail(['task-bound-candidate-required']);

  if (result?.ok === false && (!result.taskId || result.taskId === task.taskId)) {
    const reasons = Array.isArray(result.reasonCodes) && result.reasonCodes.length ? result.reasonCodes.map(String) : ['isolated-worker-failed-without-candidate'];
    const refused = fail(reasons, 'SOVEREIGN_AUTONOMY_CANDIDATE_REJECTED', { verifierStatus: result.status || null, baseRevision: head, taskId: task.taskId });
    await atomicJson(verifiedPath, refused);
    await writeContinuation({ continuationPath, priorReceipt, head, taskId: task.taskId, relayStatus: 'CANDIDATE_REJECTED', reasonCodes: reasons });
    return refused;
  }

  const candidate = result?.codeChangeSet || result?.changeSet || result;
  if (!candidate?.ok || !candidate?.changeSetId || candidate?.taskId !== task.taskId) {
    const reasons = ['task-bound-candidate-required'];
    const refused = fail(reasons, 'SOVEREIGN_AUTONOMY_CANDIDATE_REJECTED', { baseRevision: head, taskId: task.taskId });
    await atomicJson(verifiedPath, refused);
    await writeContinuation({ continuationPath, priorReceipt, head, taskId: task.taskId, relayStatus: 'CANDIDATE_REJECTED', reasonCodes: reasons });
    return refused;
  }
  if (text(candidate.baseRevision, 80).toLowerCase() !== head) {
    const reasons = ['candidate-base-must-equal-current-source-head'];
    const refused = fail(reasons, 'SOVEREIGN_AUTONOMY_STALE_CANDIDATE', { currentHead: head, candidateBase: text(candidate.baseRevision, 80).toLowerCase(), taskId: task.taskId });
    await atomicJson(verifiedPath, refused);
    await writeContinuation({ continuationPath, priorReceipt, head, taskId: task.taskId, relayStatus: 'CANDIDATE_REJECTED', reasonCodes: reasons });
    return refused;
  }

  const host = createLinuxSelfMaintainerSandboxHost({ repoRoot: root, env });
  const verified = await runUberBondSelfMaintenance({ task, candidateChangeSet: candidate, createSandbox: host.createSandbox, destroySandbox: host.destroySandbox, verifySandbox: host.verifySandbox, repository: text(env.UBERBOND_REPOSITORY, 300) || 'local/uberbond', promotionAdapter: null, date: new Date() });
  if (!verified?.ok || verified.status !== 'VERIFIED_CHANGESET_READY_FOR_PROMOTION') {
    const reasons = verified?.reasonCodes || ['independent-sandbox-verification-failed'];
    const refused = fail(reasons, 'SOVEREIGN_AUTONOMY_CANDIDATE_REJECTED', { verifierStatus: verified?.status || null, baseRevision: head, taskId: task.taskId });
    await atomicJson(verifiedPath, refused);
    await writeContinuation({ continuationPath, priorReceipt, head, taskId: task.taskId, relayStatus: 'CANDIDATE_REJECTED', reasonCodes: reasons });
    return refused;
  }
  const out = { ok: true, policyVersion: SOVEREIGN_AUTONOMY_VERIFY_VERSION, status: 'VERIFIED_CHANGESET_READY_FOR_SEPARATE_PROMOTION_AUTHORITY', baseRevision: head, taskId: task.taskId, verifiedReceipt: verified.verifiedReceipt, observedChangeSet: verified.observedChangeSet, promotion: 'NOT_PERFORMED', signingAuthority: 'NONE', deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'Independent zero-network verification passed. This receipt does not merge, sign, release or deploy the change.' };
  await atomicJson(verifiedPath, out);
  await writeContinuation({ continuationPath, priorReceipt, head, taskId: task.taskId, relayStatus: out.status, reasonCodes: [] });
  await atomicJson(governancePath, out, 0o640);
  return { ...out, governanceHandoff: governancePath };
}

const invokedAsCli = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) runSovereignAutonomyVerification().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result?.ok) process.exitCode = 2; }).catch(error => { process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message, 300)}`]), null, 2)}\n`); process.exitCode = 2; });
