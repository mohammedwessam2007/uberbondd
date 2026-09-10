#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileSandwichAutocatalyticDirective,
  compileSandwichAutocatalyticTask
} from '../src/sandwich-autocatalytic-governor.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export const SOVEREIGN_CONTINUOUS_AUTHORING_VERSION = 'uberbond.sovereign-continuous-authoring.v1';
const SHA40 = /^[a-f0-9]{40}$/i;
const MAX_JSON_BYTES = 8_000_000;
const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);

function fail(reasonCodes, status = 'SOVEREIGN_CONTINUOUS_AUTHORING_REFUSED', extra = {}) {
  return {
    ok: false,
    policyVersion: SOVEREIGN_CONTINUOUS_AUTHORING_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

async function defaultPrimaryPulse(input) {
  const { runSovereignAutonomyPulse } = await import('./sovereign-autonomy-pulse.mjs');
  return runSovereignAutonomyPulse(input);
}

async function readJson(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_JSON_BYTES) return null;
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

async function atomicJson(file, value, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode });
  await fs.chmod(tmp, mode);
  await fs.rename(tmp, file);
}

function safeWorkerTaskPath(env) {
  const root = path.resolve(env.UBERBOND_WORKER_INBOX_ROOT || '/var/lib/uberbond-worker/inbox');
  const target = path.resolve(env.UBERBOND_WORKER_TASK_PATH || path.join(root, 'task.json'));
  return target !== root && target.startsWith(`${root}${path.sep}`) ? target : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}

// Must remain byte-for-behavior compatible with sovereign-autonomy-pulse.mjs so
// its canonical continuation gate can recognize a descendant attempt on the
// next minute/event wake instead of manufacturing a duplicate task.
export function sovereignLocalAttemptId(baseRevision, task = {}) {
  const core = {
    baseRevision: text(baseRevision, 80).toLowerCase(),
    taskId: text(task.taskId, 300),
    repairMode: task.repairMode || null,
    targetRequirementId: task.targetRequirementId || null,
    evidenceRefs: Array.isArray(task.evidenceRefs) ? task.evidenceRefs.map(String) : [],
    requiredOutputs: Array.isArray(task.requiredOutputs) ? task.requiredOutputs.map(String) : [],
    acceptanceTests: Array.isArray(task.acceptanceTests) ? task.acceptanceTests.map(String) : []
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable(core))).digest('hex');
}

function waitingReceipt({ baseRevision, task, attemptId }) {
  return {
    schemaVersion: 'uberbond.sovereign-local-continuation-receipt.v1',
    observedBaseRevision: text(baseRevision, 80).toLowerCase(),
    observedTaskId: text(task?.taskId, 300),
    observedAttemptId: attemptId,
    observedEvidenceRefs: Array.isArray(task?.evidenceRefs) ? task.evidenceRefs.map(String) : [],
    continuation: {
      ok: true,
      status: 'WAIT_FOR_EXISTING_ATTEMPT',
      decision: 'DO_NOT_CREATE_DUPLICATE_TASK',
      taskId: text(task?.taskId, 300),
      businessEffectAuthority: 'NONE'
    },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'THIS RECEIPT RESERVES ONE DIGEST-BOUND LOCAL ATTEMPT ON ONE EXACT BASE. MINUTE OR EVENT REENTRY MAY RESUME THAT ATTEMPT BUT MAY NOT CREATE A SECOND SAME-BASE DISPATCH.'
  };
}

/**
 * Sovereign authoring heartbeat.
 *
 * First gives the mature finite-completion pulse absolute priority. Only when
 * exact-current tribunal truth says that finite engineering is closed does the
 * Sandwich governor get one chance to generate the next bounded descendant
 * requirement task. The same local worker/verifier/promoter chain then owns it.
 *
 * No Vercel, GitHub Actions scheduler, cloud cron, or ChatGPT timer is required.
 * A local systemd timer/path unit may invoke this every minute or immediately on
 * promotion/founder-intent events. Reentry is idempotent through the existing
 * digest-bound continuation receipt.
 */
export async function runSovereignContinuousAuthoringPulse({
  env = process.env,
  repoRoot = process.cwd(),
  runPrimaryPulse = defaultPrimaryPulse,
  date = new Date()
} = {}) {
  if (typeof runPrimaryPulse !== 'function') return fail(['primary-autonomy-pulse-required']);
  const primary = await runPrimaryPulse({ env, repoRoot });
  if (!primary?.ok) return primary;

  // Existing finite work, pause state, or an already reserved attempt retains
  // complete priority. Sandwich never races it.
  if (primary.status !== 'FINITE_ENGINEERING_ALREADY_CLOSED' || primary.taskRequired !== false) {
    return primary;
  }

  const baseRevision = text(primary.baseRevision, 80).toLowerCase();
  if (!SHA40.test(baseRevision)) return fail(['exact-closed-base-revision-required']);
  const directive = compileSandwichAutocatalyticDirective({
    baseRevision,
    finiteDirective: primary
  });
  if (!directive?.ok) return fail(directive?.reasonCodes || ['post-finite-sandwich-directive-required']);

  const task = compileSandwichAutocatalyticTask({ directive, date });
  if (!task?.taskId || task.consequenceClass !== 'LOCAL_PREPARATION') {
    return fail(['bounded-local-descendant-task-required']);
  }

  const controlDir = path.resolve(env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
  const autonomyDir = path.join(controlDir, 'autonomy');
  const statusPath = path.join(autonomyDir, 'status.json');
  const taskPath = path.join(autonomyDir, 'next-task.json');
  const continuationPath = path.join(autonomyDir, 'continuation-receipt.json');
  await atomicJson(taskPath, task);

  const workerEnabled = String(env.UBERBOND_ISOLATED_WORKER_ENABLED || '').toLowerCase() === 'true';
  if (!workerEnabled) {
    const ready = {
      ok: true,
      policyVersion: SOVEREIGN_CONTINUOUS_AUTHORING_VERSION,
      status: 'SANDWICH_DESCENDANT_TASK_READY_NO_LOCAL_WORKER',
      baseRevision,
      taskId: task.taskId,
      taskRequired: true,
      newWorkerDispatch: false,
      taskPath,
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects(),
      truthBoundary: 'Exact-current finite engineering is closed and one descendant-genesis LOCAL_PREPARATION task is ready. No model executed and no external effect occurred.'
    };
    await atomicJson(statusPath, { ...ready, observedAt: new Date().toISOString() });
    return ready;
  }

  const workerTaskPath = safeWorkerTaskPath(env);
  if (!workerTaskPath) return fail(['safe-isolated-worker-task-path-required'], 'SOVEREIGN_CONTINUOUS_AUTHORING_WORKER_HANDOFF_REFUSED', { baseRevision, taskId: task.taskId });
  const existingWorkerTask = await readJson(workerTaskPath);
  if (existingWorkerTask && existingWorkerTask.taskId !== task.taskId) {
    return fail(['worker-inbox-bound-to-different-attempt'], 'SOVEREIGN_CONTINUOUS_AUTHORING_WORKER_HANDOFF_REFUSED', { baseRevision, taskId: task.taskId });
  }

  const attemptId = sovereignLocalAttemptId(baseRevision, task);
  await atomicJson(continuationPath, waitingReceipt({ baseRevision, task, attemptId }));
  if (!existingWorkerTask) await atomicJson(workerTaskPath, task, 0o640);

  const dispatched = {
    ok: true,
    policyVersion: SOVEREIGN_CONTINUOUS_AUTHORING_VERSION,
    status: existingWorkerTask ? 'SANDWICH_DESCENDANT_EXISTING_ATTEMPT_RESUMED' : 'SANDWICH_DESCENDANT_TASK_DISPATCHED_TO_ISOLATED_WORKER',
    baseRevision,
    taskId: task.taskId,
    attemptId,
    taskRequired: true,
    newWorkerDispatch: !existingWorkerTask,
    taskPath,
    workerTaskPath,
    continuationPath,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'Finite closure triggered one digest-bound descendant-genesis attempt. The local worker remains OS-separated and cannot merge, sign, deploy, spend, message, or manufacture external proof.'
  };
  await atomicJson(statusPath, { ...dispatched, observedAt: new Date().toISOString() });
  return dispatched;
}

const invokedAsCli = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  runSovereignContinuousAuthoringPulse().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result?.ok) process.exitCode = 2;
  }).catch(error => {
    process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(error?.message, 300)}`]), null, 2)}\n`);
    process.exitCode = 2;
  });
}
