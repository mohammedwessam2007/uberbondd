#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileContextMount } from '../src/context-history-retrieval.mjs';
import { runSovereignContextDoctor } from './sovereign-context-doctor.mjs';
import { readRuntimeCognitiveJournal } from './sovereign-cognitive-journal-runtime.mjs';

export const SOVEREIGN_CONTEXT_MOUNT_VERSION = 'sovereign-context-mount-1.1.0';

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function fail(reasonCodes, status = 'CONTEXT_MOUNT_REFUSED', extra = {}) {
  return {
    ok: false,
    mountVersion: SOVEREIGN_CONTEXT_MOUNT_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

function readJsonCache(file) {
  if (!file || !fs.existsSync(path.resolve(file))) return null;
  const absolute = path.resolve(file);
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_000_000) throw new Error('unsafe-context-cache-file');
  const value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('context-cache-object-required');
  return value;
}

function atomicWriteJson(file, value) {
  if (!file) return null;
  const absolute = path.resolve(file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  if (fs.existsSync(absolute)) {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('regular-nonsymlink-context-cache-required');
  }
  const temporary = `${absolute}.tmp.${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  const handle = fs.openSync(temporary, 'r');
  try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  fs.renameSync(temporary, absolute);
  fs.chmodSync(absolute, 0o600);
  return absolute;
}

export function mountSovereignContext({
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  journalPath,
  journalArchiveSnapshotPath = process.env.UBERBOND_CONTEXT_ARCHIVE_SNAPSHOT_PATH || null,
  journalTailPath = process.env.UBERBOND_CONTEXT_TAIL_PATH || null,
  capsuleCachePath = null,
  mountCachePath = null,
  mission = null,
  maxHistoricalEvents = 24,
  generatedAt = new Date()
} = {}) {
  if (!journalPath) return fail(['journal-path-required']);
  let cachedCapsule = null;
  try {
    cachedCapsule = readJsonCache(capsuleCachePath);
  } catch (error) {
    return fail(['brainstate-cache-read-failed'], 'CONTEXT_MOUNT_CACHE_REFUSED', { error: error?.message || 'cache-read-failed' });
  }

  let doctor = runSovereignContextDoctor({ rootDir, capsule: cachedCapsule, mission, generatedAt });
  let recompiledFromStale = false;
  if (!doctor.ok && cachedCapsule && doctor.status === 'CONTEXT_DRIFT__RECOMPILE_REQUIRED') {
    doctor = runSovereignContextDoctor({ rootDir, mission, generatedAt });
    recompiledFromStale = true;
  }
  if (!doctor.ok) {
    return fail(['context-doctor-refused', ...(doctor.reasonCodes || [])], 'CONTEXT_MOUNT_CONTEXT_REFUSED', {
      contextDoctorStatus: doctor.status
    });
  }

  const journal = readRuntimeCognitiveJournal({ journalPath, archiveSnapshotPath: journalArchiveSnapshotPath, tailPath: journalTailPath });
  if (!journal.ok) return fail(['cognitive-journal-invalid', ...(journal.reasonCodes || [])], 'CONTEXT_MOUNT_JOURNAL_REFUSED');
  const compiled = compileContextMount({
    doctorResult: doctor,
    journalEntries: journal.entries,
    mission: mission || doctor.missionContext?.mission,
    maxHistoricalEvents,
    recompiledFromStale
  });
  if (!compiled.ok) return compiled;

  try {
    const writtenCapsuleCache = capsuleCachePath ? atomicWriteJson(capsuleCachePath, doctor.capsule) : null;
    const writtenMountCache = mountCachePath ? atomicWriteJson(mountCachePath, compiled.mount) : null;
    return {
      ...compiled,
      mountVersion: SOVEREIGN_CONTEXT_MOUNT_VERSION,
      journalRuntimeMode: journal.runtimeMode,
      journalArchiveManifestId: journal.archiveManifestId || null,
      journalArchiveEntryCount: journal.archiveEntryCount || 0,
      journalTailEntryCount: journal.tailEntryCount || 0,
      capsuleCachePath: writtenCapsuleCache,
      mountCachePath: writtenMountCache
    };
  } catch (error) {
    return fail(['context-cache-write-failed'], 'CONTEXT_MOUNT_READY__CACHE_WRITE_FAILED', {
      contextMountId: compiled.mount.contextMountId,
      error: error?.message || 'cache-write-failed'
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const journalPath = argValue('--journal') || process.env.UBERBOND_CONTEXT_JOURNAL_PATH || null;
    const capsuleCachePath = argValue('--capsule-cache') || process.env.UBERBOND_BRAINSTATE_PATH || null;
    const mountCachePath = argValue('--mount-cache') || process.env.UBERBOND_CONTEXT_MOUNT_PATH || null;
    const mission = argValue('--mission');
    const maxHistoricalEvents = Number(argValue('--max-history') || 24);
    const result = mountSovereignContext({ journalPath, capsuleCachePath, mountCachePath, mission, maxHistoricalEvents });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      status: 'CONTEXT_MOUNT_FAILED',
      reason: error?.message || 'unknown-error',
      businessEffectAuthority: 'NONE',
      externalEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
