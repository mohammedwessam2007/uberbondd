#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileContextProjection } from '../src/context-projection.mjs';
import { mountSovereignContext } from './sovereign-context-mount.mjs';

export const SOVEREIGN_CONTEXT_PROJECT_WORKER_VERSION = 'sovereign-context-project-worker-1.0.0';

function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function fail(reasonCodes, status = 'WORKER_CONTEXT_PROJECTION_REFUSED', extra = {}) {
  return {
    ok: false,
    projectorVersion: SOVEREIGN_CONTEXT_PROJECT_WORKER_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}
function atomicJson(file, value, mode = 0o640) {
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o750 });
  if (fs.existsSync(absolute)) {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('regular-nonsymlink-projection-target-required');
  }
  const temporary = `${absolute}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
  const handle = fs.openSync(temporary, 'r');
  try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  fs.renameSync(temporary, absolute);
  fs.chmodSync(absolute, mode);
  return absolute;
}

export function projectWorkerContext({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  journalPath,
  capsuleCachePath = null,
  mountCachePath = null,
  outputPath,
  mission = null,
  generatedAt = new Date()
} = {}) {
  if (!journalPath || !outputPath) return fail(['journal-and-output-path-required']);
  const mounted = mountSovereignContext({
    rootDir,
    journalPath,
    capsuleCachePath,
    mountCachePath,
    mission,
    maxHistoricalEvents: 8,
    generatedAt
  });
  if (!mounted.ok) return fail(['verified-current-context-mount-required', ...(mounted.reasonCodes || [])], 'WORKER_CONTEXT_MOUNT_REFUSED');
  const compiled = compileContextProjection({ mountResult: mounted, audience: 'isolated-worker', maxHistory: 8 });
  if (!compiled.ok) return fail(['worker-context-projection-compilation-failed', ...(compiled.reasonCodes || [])]);
  let written;
  try { written = atomicJson(outputPath, compiled.projection, 0o640); }
  catch (error) { return fail(['worker-context-projection-write-failed'], 'WORKER_CONTEXT_PROJECTION_WRITE_REFUSED', { detail: String(error?.message || error).slice(0, 300) }); }
  return {
    ok: true,
    projectorVersion: SOVEREIGN_CONTEXT_PROJECT_WORKER_VERSION,
    status: 'WORKER_CONTEXT_PROJECTION_PUBLISHED',
    sourceCommit: compiled.projection.sourceCommit,
    brainstateId: compiled.projection.brainstateId,
    contextMountId: compiled.projection.contextMountId,
    projectionId: compiled.projection.projectionId,
    outputPath: written,
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const controlDir = path.resolve(process.env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
    const workerInbox = path.resolve(process.env.UBERBOND_WORKER_INBOX_ROOT || '/var/lib/uberbond-worker/inbox');
    const journalPath = argValue('--journal') || process.env.UBERBOND_CONTEXT_JOURNAL_PATH || path.join(controlDir, 'context', 'events.jsonl');
    const capsuleCachePath = argValue('--capsule-cache') || process.env.UBERBOND_BRAINSTATE_PATH || path.join(controlDir, 'context', 'brainstate.json');
    const mountCachePath = argValue('--mount-cache') || process.env.UBERBOND_CONTEXT_MOUNT_PATH || path.join(controlDir, 'context', 'mount.json');
    const outputPath = argValue('--out') || process.env.UBERBOND_WORKER_CONTEXT_PATH || path.join(workerInbox, 'context-projection.json');
    const mission = argValue('--mission');
    const result = projectWorkerContext({ journalPath, capsuleCachePath, mountCachePath, outputPath, mission });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, status: 'WORKER_CONTEXT_PROJECTION_FAILED', reason: error?.message || 'unknown-error', businessEffectAuthority: 'NONE', externalEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
