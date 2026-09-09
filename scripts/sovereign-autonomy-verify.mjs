#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { runUberBondSelfMaintenance } from '../src/uberbond-self-maintainer.mjs';
import { createLinuxSelfMaintainerSandboxHost } from '../src/linux-self-maintainer-sandbox.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_AUTONOMY_VERIFY_VERSION = 'uberbond.sovereign-autonomy-verify.v2';
const SHA40 = /^[a-f0-9]{40}$/i;
const MAX_BYTES = 8_000_000;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
function fail(reasonCodes, status = 'SOVEREIGN_AUTONOMY_VERIFY_REFUSED', extra = {}) { return { ok: false, policyVersion: SOVEREIGN_AUTONOMY_VERIFY_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra }; }
function run(executable, args, { cwd, env = {}, timeoutMs = 30_000 } = {}) { return new Promise(resolve => execFile(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer: MAX_BYTES, windowsHide: true }, (error, stdout, stderr) => resolve({ exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0), stdout: String(stdout || ''), stderr: String(stderr || '') }))); }
async function readJson(file) { try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null; const v = JSON.parse(await fs.readFile(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } }
async function atomicJson(file, value) { await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); const tmp = `${file}.tmp.${process.pid}`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); await fs.rename(tmp, file); }
function safeWorkerResultPath(env) { const root = path.resolve(env.UBERBOND_WORKER_OUTBOX_ROOT || '/var/lib/uberbond-worker/outbox'); const target = path.resolve(env.UBERBOND_WORKER_RESULT_PATH || path.join(root, 'result.json')); return target.startsWith(`${root}${path.sep}`) && target !== root ? target : null; }

export async function runSovereignAutonomyVerification({ env = process.env, repoRoot = process.cwd(), runProcess = run } = {}) {
  if (process.platform !== 'linux') return fail(['linux-authoring-host-required'], 'SOVEREIGN_AUTONOMY_ISOLATION_UNAVAILABLE');
  const root = await fs.realpath(repoRoot).catch(() => null);
  if (!root) return fail(['real-source-repository-required']);
  const controlDir = path.resolve(env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
  const autonomyDir = path.join(controlDir, 'autonomy');
  const taskPath = path.join(autonomyDir, 'next-task.json');
  const resultPath = safeWorkerResultPath(env);
  const verifiedPath = path.join(autonomyDir, 'verified-change.json');
  if (!resultPath) return fail(['safe-isolated-worker-result-path-required']);
  const task = await readJson(taskPath);
  const result = await readJson(resultPath);
  const candidate = result?.codeChangeSet || result?.changeSet || result;
  if (!task?.taskId || !candidate?.ok || !candidate?.changeSetId || candidate?.taskId !== task.taskId) return fail(['task-bound-candidate-required']);
  const headRead = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: root, env: { PATH: env.PATH || '' } });
  const head = text(headRead.stdout, 80).toLowerCase();
  if (headRead.exitCode !== 0 || !SHA40.test(head)) return fail(['exact-source-commit-required']);
  if (text(candidate.baseRevision, 80).toLowerCase() !== head) return fail(['candidate-base-must-equal-current-source-head'], 'SOVEREIGN_AUTONOMY_STALE_CANDIDATE', { currentHead: head, candidateBase: text(candidate.baseRevision, 80).toLowerCase() });
  const dirty = await runProcess('git', ['status', '--porcelain'], { cwd: root, env: { PATH: env.PATH || '' } });
  if (dirty.exitCode !== 0 || text(dirty.stdout, 20_000)) return fail(['clean-source-checkout-required']);
  const host = createLinuxSelfMaintainerSandboxHost({ repoRoot: root, env });
  const verified = await runUberBondSelfMaintenance({ task, candidateChangeSet: candidate, createSandbox: host.createSandbox, destroySandbox: host.destroySandbox, verifySandbox: host.verifySandbox, repository: text(env.UBERBOND_REPOSITORY, 300) || 'local/uberbond', promotionAdapter: null, date: new Date() });
  if (!verified?.ok || verified.status !== 'VERIFIED_CHANGESET_READY_FOR_PROMOTION') { const refused = fail(verified?.reasonCodes || ['independent-sandbox-verification-failed'], 'SOVEREIGN_AUTONOMY_CANDIDATE_REJECTED', { verifierStatus: verified?.status || null, baseRevision: head, taskId: task.taskId }); await atomicJson(verifiedPath, refused); return refused; }
  const out = { ok: true, policyVersion: SOVEREIGN_AUTONOMY_VERIFY_VERSION, status: 'VERIFIED_CHANGESET_READY_FOR_SEPARATE_PROMOTION_AUTHORITY', baseRevision: head, taskId: task.taskId, verifiedReceipt: verified.verifiedReceipt, observedChangeSet: verified.observedChangeSet, promotion: 'NOT_PERFORMED', signingAuthority: 'NONE', deploymentAuthority: 'NONE', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'Independent zero-network verification passed. This receipt does not merge, sign, release or deploy the change.' };
  await atomicJson(verifiedPath, out);
  return out;
}

const invokedAsCli = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) runSovereignAutonomyVerification().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result?.ok) process.exitCode = 2; }).catch(error => { process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message, 300)}`]), null, 2)}\n`); process.exitCode = 2; });
