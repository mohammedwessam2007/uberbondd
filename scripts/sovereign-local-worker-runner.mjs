#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_LOCAL_WORKER_VERSION = 'uberbond.sovereign-local-worker.v1';
const MAX_BYTES = 8_000_000;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const fail = (reasonCodes, status = 'SOVEREIGN_LOCAL_WORKER_REFUSED', extra = {}) => ({ ok: false, policyVersion: SOVEREIGN_LOCAL_WORKER_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra });
function run(executable, args, { cwd, env = {}, timeoutMs = 45 * 60_000 } = {}) { return new Promise(resolve => execFile(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer: MAX_BYTES, windowsHide: true }, (error, stdout, stderr) => resolve({ exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0), stdout: String(stdout || ''), stderr: String(stderr || ''), timedOut: Boolean(error?.killed) }))); }
async function readJson(file) { try { const raw = await fs.readFile(file, 'utf8'); if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return null; const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } }
async function realExecutable(file) { try { if (!path.isAbsolute(file)) return null; const real = await fs.realpath(file); const stat = await fs.lstat(real); return stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o111) !== 0 ? real : null; } catch { return null; } }
async function atomicJson(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp.${process.pid}`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o640 }); await fs.chmod(tmp, 0o640); await fs.rename(tmp, file); }

export async function runSovereignLocalWorker({ env = process.env, runProcess = run } = {}) {
  const taskPath = path.resolve(env.UBERBOND_WORKER_TASK_PATH || '/var/lib/uberbond-worker/inbox/task.json');
  const outboxRoot = path.resolve(env.UBERBOND_WORKER_OUTBOX_ROOT || '/var/lib/uberbond-worker/outbox');
  const resultPath = path.resolve(env.UBERBOND_WORKER_RESULT_PATH || path.join(outboxRoot, 'result.json'));
  const sourceRoot = path.resolve(env.UBERBOND_SOURCE_ROOT || '/opt/uberbond/source');
  if (!resultPath.startsWith(`${outboxRoot}${path.sep}`) || resultPath === outboxRoot) return fail(['safe-worker-outbox-path-required']);
  const taskStat = await fs.lstat(taskPath).catch(() => null);
  if (!taskStat?.isFile() || taskStat.isSymbolicLink()) return fail(['regular-task-file-required']);
  const task = await readJson(taskPath);
  if (!task?.taskId || task.consequenceClass !== 'LOCAL_PREPARATION') return fail(['valid-local-preparation-task-required']);
  const worker = await realExecutable(text(env.UBERBOND_LOCAL_WORKER_EXECUTABLE, 2000));
  if (!worker) return fail(['local-worker-executable-required']);
  const tmpResult = path.join(outboxRoot, `.candidate-${process.pid}.json`);
  await fs.mkdir(outboxRoot, { recursive: true });
  await fs.rm(tmpResult, { force: true }).catch(() => {});
  const execution = await runProcess(worker, [taskPath, tmpResult], {
    cwd: sourceRoot,
    env: { PATH: env.PATH || '', HOME: env.HOME || '/tmp', UBERBOND_TASK_PATH: taskPath, UBERBOND_RESULT_PATH: tmpResult, UBERBOND_SOURCE_ROOT: sourceRoot },
    timeoutMs: Number(env.UBERBOND_LOCAL_WORKER_TIMEOUT_MS || 45 * 60_000)
  });
  if (execution.exitCode !== 0) { await fs.rm(tmpResult, { force: true }).catch(() => {}); return fail([`worker-exit:${execution.exitCode}`], 'SOVEREIGN_LOCAL_WORKER_FAILED', { taskId: task.taskId, timedOut: execution.timedOut }); }
  const result = await readJson(tmpResult);
  const candidate = result?.codeChangeSet || result?.changeSet || result;
  if (!candidate?.ok || !candidate?.changeSetId || candidate?.taskId !== task.taskId) { await fs.rm(tmpResult, { force: true }).catch(() => {}); return fail(['task-bound-agent-code-change-set-required'], 'SOVEREIGN_LOCAL_WORKER_OUTPUT_REFUSED', { taskId: task.taskId }); }
  await atomicJson(resultPath, result);
  await fs.rm(tmpResult, { force: true }).catch(() => {});
  return { ok: true, policyVersion: SOVEREIGN_LOCAL_WORKER_VERSION, status: 'ISOLATED_WORKER_CANDIDATE_EMITTED', taskId: task.taskId, changeSetId: candidate.changeSetId, resultPath, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'The worker emitted a candidate only. The worker identity cannot write authoring truth, merge, sign, release or deploy.' };
}

const invokedAsCli = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) runSovereignLocalWorker().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result?.ok) process.exitCode = 2; }).catch(error => { process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message, 300)}`]), null, 2)}\n`); process.exitCode = 2; });
