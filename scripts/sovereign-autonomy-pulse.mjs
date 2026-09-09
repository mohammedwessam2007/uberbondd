#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { compileFiniteCompletionDirective, compileFiniteCompletionTask } from './uberbond-finite-completion-seed.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_AUTONOMY_PULSE_VERSION = 'uberbond.sovereign-autonomy-pulse.v1';
const SHA40 = /^[a-f0-9]{40}$/i;
const MAX_JSON_BYTES = 4_000_000;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function fail(reasonCodes, status = 'SOVEREIGN_AUTONOMY_REFUSED', extra = {}) {
  return { ok: false, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}

function run(executable, args, { cwd, env = {}, timeoutMs = 20 * 60_000 } = {}) {
  return new Promise(resolve => {
    execFile(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer: 8_000_000, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0), signal: error?.signal || null, timedOut: Boolean(error?.killed), stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function readJson(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) return null;
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(tmp, file);
}

async function realExecutable(file) {
  try {
    if (!path.isAbsolute(file)) return null;
    const real = await fs.realpath(file);
    const stat = await fs.lstat(real);
    return stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o111) !== 0 ? real : null;
  } catch { return null; }
}

export function compileLocalAutonomyState({ paused = false, baseRevision, directive, workerConfigured = false } = {}) {
  if (!SHA40.test(text(baseRevision, 80))) return fail(['exact-source-commit-required']);
  if (paused) return { ok: true, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status: 'FOUNDER_PAUSED', baseRevision: baseRevision.toLowerCase(), taskRequired: false, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  if (!directive?.ok) return fail(['finite-completion-directive-required']);
  if (directive.taskRequired !== true) return { ok: true, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status: 'FINITE_ENGINEERING_ALREADY_CLOSED', baseRevision: baseRevision.toLowerCase(), taskRequired: false, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'Finite engineering closure is inherited only from the exact-current terminal tribunal; runtime, commercial, personal and ASI evidence remain separate.' };
  return { ok: true, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status: workerConfigured ? 'LOCAL_WORKER_DISPATCH_READY' : 'TASK_READY_NO_LOCAL_WORKER', baseRevision: baseRevision.toLowerCase(), taskRequired: true, repairMode: directive.repairMode || null, targetRequirementId: directive.targetRequirementId || null, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'A sovereign authoring pulse may select and dispatch one LOCAL_PREPARATION engineering task. It may not merge, sign, deploy or create business effects.' };
}

export async function runSovereignAutonomyPulse({ env = process.env, repoRoot = process.cwd(), runProcess = run } = {}) {
  const root = await fs.realpath(repoRoot).catch(() => null);
  if (!root) return fail(['real-source-repository-required']);
  const controlDir = path.resolve(env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
  const autonomyDir = path.join(controlDir, 'autonomy');
  const pauseFile = path.join(autonomyDir, 'PAUSED');
  const statusPath = path.join(autonomyDir, 'status.json');
  const taskPath = path.join(autonomyDir, 'next-task.json');
  const resultPath = path.join(autonomyDir, 'worker-result.json');
  const paused = await fs.lstat(pauseFile).then(s => s.isFile() && !s.isSymbolicLink()).catch(() => false);

  const gitEnv = { PATH: env.PATH || '' };
  const headRead = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: root, env: gitEnv, timeoutMs: 30_000 });
  const head = text(headRead.stdout, 80).toLowerCase();
  if (headRead.exitCode !== 0 || !SHA40.test(head)) return fail(['exact-source-commit-required']);
  const dirty = await runProcess('git', ['status', '--porcelain'], { cwd: root, env: gitEnv, timeoutMs: 30_000 });
  if (dirty.exitCode !== 0 || text(dirty.stdout, 20_000)) return fail(['clean-source-checkout-required'], 'SOVEREIGN_AUTONOMY_DIRTY_SOURCE_REFUSED', { baseRevision: head });

  if (paused) {
    const state = compileLocalAutonomyState({ paused: true, baseRevision: head, directive: { ok: true } });
    await atomicJson(statusPath, { ...state, observedAt: new Date().toISOString() });
    return state;
  }

  const terminal = await runProcess(process.execPath, ['scripts/terminal-realization.mjs'], { cwd: root, env: { PATH: env.PATH || '', HOME: env.HOME || '' }, timeoutMs: 20 * 60_000 });
  if (![0, 2].includes(terminal.exitCode)) return fail([`terminal-realization-unexpected-exit:${terminal.exitCode}`], 'SOVEREIGN_AUTONOMY_TERMINAL_CRASH', { baseRevision: head });
  const terminalDoc = await readJson(path.join(root, 'artifacts/sovereign/terminal-realization.json'));
  const graphDoc = await readJson(path.join(root, 'artifacts/sovereign/canonical-execution-leaf-graph.json'));
  const directive = compileFiniteCompletionDirective({ baseRevision: head, terminalRealization: terminalDoc, executionGraph: graphDoc });
  if (!directive?.ok) return fail(directive?.reasonCodes || ['finite-completion-directive-refused']);

  const workerPathRaw = text(env.UBERBOND_LOCAL_WORKER_EXECUTABLE, 2000);
  const workerPath = workerPathRaw ? await realExecutable(workerPathRaw) : null;
  if (workerPathRaw && !workerPath) return fail(['local-worker-executable-invalid-or-unsafe'], 'SOVEREIGN_AUTONOMY_WORKER_REFUSED', { baseRevision: head });
  const state = compileLocalAutonomyState({ paused: false, baseRevision: head, directive, workerConfigured: Boolean(workerPath) });
  if (!directive.taskRequired) {
    await fs.rm(taskPath, { force: true }).catch(() => {});
    await atomicJson(statusPath, { ...state, terminalExitCode: terminal.exitCode, observedAt: new Date().toISOString() });
    return state;
  }

  const task = compileFiniteCompletionTask({ directive });
  if (!task?.taskId) return fail(['finite-completion-task-compilation-failed']);
  await atomicJson(taskPath, task);
  if (!workerPath) {
    await atomicJson(statusPath, { ...state, taskId: task.taskId, taskPath, terminalExitCode: terminal.exitCode, observedAt: new Date().toISOString() });
    return { ...state, taskId: task.taskId, taskPath };
  }

  await fs.rm(resultPath, { force: true }).catch(() => {});
  const worker = await runProcess(workerPath, [taskPath, resultPath], { cwd: root, env: { PATH: env.PATH || '', HOME: env.HOME || '', UBERBOND_TASK_PATH: taskPath, UBERBOND_RESULT_PATH: resultPath, UBERBOND_SOURCE_ROOT: root }, timeoutMs: Number(env.UBERBOND_LOCAL_WORKER_TIMEOUT_MS || 45 * 60_000) });
  if (worker.exitCode !== 0) {
    const refused = fail([`local-worker-exit:${worker.exitCode}`], 'SOVEREIGN_AUTONOMY_WORKER_FAILED', { baseRevision: head, taskId: task.taskId });
    await atomicJson(statusPath, { ...refused, observedAt: new Date().toISOString() });
    return refused;
  }
  const result = await readJson(resultPath);
  const candidate = result?.codeChangeSet || result?.changeSet || result;
  if (!candidate?.ok || !candidate?.changeSetId || candidate?.taskId !== task.taskId) {
    const refused = fail(['worker-must-return-task-bound-agent-code-change-set'], 'SOVEREIGN_AUTONOMY_CANDIDATE_REFUSED', { baseRevision: head, taskId: task.taskId });
    await atomicJson(statusPath, { ...refused, observedAt: new Date().toISOString() });
    return refused;
  }
  const ready = { ok: true, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status: 'CANDIDATE_READY_FOR_INDEPENDENT_SANDBOX_VERIFICATION', baseRevision: head, taskId: task.taskId, taskPath, resultPath, changeSetId: candidate.changeSetId, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'The model/worker result is only a candidate. It has not been applied, merged, signed, deployed or promoted.' };
  await atomicJson(statusPath, { ...ready, observedAt: new Date().toISOString() });
  return ready;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSovereignAutonomyPulse().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result?.ok) process.exitCode = 2;
  }).catch(error => {
    process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message, 300)}`]), null, 2)}\n`);
    process.exitCode = 2;
  });
}
