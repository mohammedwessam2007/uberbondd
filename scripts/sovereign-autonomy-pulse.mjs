#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { compileFiniteCompletionDirective, compileFiniteCompletionTask } from './uberbond-finite-completion-seed.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_AUTONOMY_PULSE_VERSION = 'uberbond.sovereign-autonomy-pulse.v2';
const SHA40 = /^[a-f0-9]{40}$/i;
const MAX_JSON_BYTES = 4_000_000;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
function fail(reasonCodes, status = 'SOVEREIGN_AUTONOMY_REFUSED', extra = {}) {
  return { ok: false, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}
function run(executable, args, { cwd, env = {}, timeoutMs = 20 * 60_000 } = {}) {
  return new Promise(resolve => execFile(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer: 8_000_000, windowsHide: true }, (error, stdout, stderr) => resolve({ exitCode: typeof error?.code === 'number' ? error.code : (error ? 1 : 0), signal: error?.signal || null, timedOut: Boolean(error?.killed), stdout: String(stdout || ''), stderr: String(stderr || '') })));
}
async function readJson(file) { try { const raw = await fs.readFile(file, 'utf8'); if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BYTES) return null; const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } }
async function atomicJson(file, value, mode = 0o600) { await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 }); const tmp = `${file}.tmp.${process.pid}`; await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode }); await fs.chmod(tmp, mode); await fs.rename(tmp, file); }
function safeWorkerTaskPath(env) {
  const root = path.resolve(env.UBERBOND_WORKER_INBOX_ROOT || '/var/lib/uberbond-worker/inbox');
  const target = path.resolve(env.UBERBOND_WORKER_TASK_PATH || path.join(root, 'task.json'));
  return target.startsWith(`${root}${path.sep}`) && target !== root ? target : null;
}

export function compileLocalAutonomyState({ paused = false, baseRevision, directive, isolatedWorkerEnabled = false } = {}) {
  if (!SHA40.test(text(baseRevision, 80))) return fail(['exact-source-commit-required']);
  if (paused) return { ok: true, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status: 'FOUNDER_PAUSED', baseRevision: baseRevision.toLowerCase(), taskRequired: false, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  if (!directive?.ok) return fail(['finite-completion-directive-required']);
  if (directive.taskRequired !== true) return { ok: true, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status: 'FINITE_ENGINEERING_ALREADY_CLOSED', baseRevision: baseRevision.toLowerCase(), taskRequired: false, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'Finite engineering closure is inherited only from the exact-current terminal tribunal; runtime, commercial, personal and ASI evidence remain separate.' };
  return { ok: true, policyVersion: SOVEREIGN_AUTONOMY_PULSE_VERSION, status: isolatedWorkerEnabled ? 'TASK_READY_FOR_ISOLATED_WORKER' : 'TASK_READY_NO_LOCAL_WORKER', baseRevision: baseRevision.toLowerCase(), taskRequired: true, repairMode: directive.repairMode || null, targetRequirementId: directive.targetRequirementId || null, businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), truthBoundary: 'The authoring controller may select one LOCAL_PREPARATION task. Model execution occurs under a separate OS identity and cannot merge, sign, deploy or create business effects.' };
}

export async function runSovereignAutonomyPulse({ env = process.env, repoRoot = process.cwd(), runProcess = run } = {}) {
  const root = await fs.realpath(repoRoot).catch(() => null);
  if (!root) return fail(['real-source-repository-required']);
  const controlDir = path.resolve(env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
  const autonomyDir = path.join(controlDir, 'autonomy');
  const pauseFile = path.join(autonomyDir, 'PAUSED');
  const statusPath = path.join(autonomyDir, 'status.json');
  const taskPath = path.join(autonomyDir, 'next-task.json');
  const paused = await fs.lstat(pauseFile).then(s => s.isFile() && !s.isSymbolicLink()).catch(() => false);
  const headRead = await runProcess('git', ['rev-parse', 'HEAD'], { cwd: root, env: { PATH: env.PATH || '' }, timeoutMs: 30_000 });
  const head = text(headRead.stdout, 80).toLowerCase();
  if (headRead.exitCode !== 0 || !SHA40.test(head)) return fail(['exact-source-commit-required']);
  const dirty = await runProcess('git', ['status', '--porcelain'], { cwd: root, env: { PATH: env.PATH || '' }, timeoutMs: 30_000 });
  if (dirty.exitCode !== 0 || text(dirty.stdout, 20_000)) return fail(['clean-source-checkout-required'], 'SOVEREIGN_AUTONOMY_DIRTY_SOURCE_REFUSED', { baseRevision: head });
  if (paused) { const state = compileLocalAutonomyState({ paused: true, baseRevision: head, directive: { ok: true } }); await atomicJson(statusPath, { ...state, observedAt: new Date().toISOString() }); return state; }

  const terminal = await runProcess(process.execPath, ['scripts/terminal-realization.mjs'], { cwd: root, env: { PATH: env.PATH || '', HOME: env.HOME || '' }, timeoutMs: 20 * 60_000 });
  if (![0, 2].includes(terminal.exitCode)) return fail([`terminal-realization-unexpected-exit:${terminal.exitCode}`], 'SOVEREIGN_AUTONOMY_TERMINAL_CRASH', { baseRevision: head });
  const terminalDoc = await readJson(path.join(root, 'artifacts/sovereign/terminal-realization.json'));
  const graphDoc = await readJson(path.join(root, 'artifacts/sovereign/canonical-execution-leaf-graph.json'));
  const directive = compileFiniteCompletionDirective({ baseRevision: head, terminalRealization: terminalDoc, executionGraph: graphDoc });
  if (!directive?.ok) return fail(directive?.reasonCodes || ['finite-completion-directive-refused']);
  const workerEnabled = String(env.UBERBOND_ISOLATED_WORKER_ENABLED || '').toLowerCase() === 'true';
  const state = compileLocalAutonomyState({ paused: false, baseRevision: head, directive, isolatedWorkerEnabled: workerEnabled });
  if (!directive.taskRequired) { await fs.rm(taskPath, { force: true }).catch(() => {}); await atomicJson(statusPath, { ...state, terminalExitCode: terminal.exitCode, observedAt: new Date().toISOString() }); return state; }

  const task = compileFiniteCompletionTask({ directive });
  if (!task?.taskId) return fail(['finite-completion-task-compilation-failed']);
  await atomicJson(taskPath, task);
  if (!workerEnabled) { await atomicJson(statusPath, { ...state, taskId: task.taskId, taskPath, terminalExitCode: terminal.exitCode, observedAt: new Date().toISOString() }); return { ...state, taskId: task.taskId, taskPath }; }
  const workerTaskPath = safeWorkerTaskPath(env);
  if (!workerTaskPath) return fail(['safe-isolated-worker-task-path-required'], 'SOVEREIGN_AUTONOMY_WORKER_HANDOFF_REFUSED', { baseRevision: head, taskId: task.taskId });
  await atomicJson(workerTaskPath, task, 0o640);
  const dispatched = { ...state, status: 'TASK_DISPATCHED_TO_ISOLATED_WORKER', taskId: task.taskId, taskPath, workerTaskPath, terminalExitCode: terminal.exitCode, truthBoundary: 'Task selection and model execution are OS-separated. This dispatch is not a verified change, merge, signature, release or deployment.' };
  await atomicJson(statusPath, { ...dispatched, observedAt: new Date().toISOString() });
  return dispatched;
}

const invokedAsCli = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) runSovereignAutonomyPulse().then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (!result?.ok) process.exitCode = 2; }).catch(error => { process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message, 300)}`]), null, 2)}\n`); process.exitCode = 2; });
