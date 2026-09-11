#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compileFounderOutcomeMission } from '../src/founder-outcome-mission.mjs';

const execFileAsync = promisify(execFile);
const CONTROL_DIR = path.resolve(process.env.UBERBOND_CONTROL_DIR || '/var/lib/uberbond-control');
const INTENT_DIR = path.join(CONTROL_DIR, 'founder-intents');
const MISSION_DIR = path.join(CONTROL_DIR, 'founder-missions');
const ACTIVE_PATH = path.join(MISSION_DIR, 'active.json');
const MAX_BYTES = 1_000_000;

async function readJson(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return null;
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp.${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(tmp, 0o600);
  await fs.rename(tmp, file);
}

async function latestIntent() {
  try {
    const names = (await fs.readdir(INTENT_DIR)).filter(name => /^intent-[a-f0-9]{24}\.json$/.test(name));
    const rows = [];
    for (const name of names) {
      const value = await readJson(path.join(INTENT_DIR, name));
      if (value?.intent) rows.push(value);
    }
    rows.sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
    return rows.at(-1) || null;
  } catch { return null; }
}

async function sourceRevision() {
  try {
    const cwd = path.resolve(process.env.UBERBOND_SOURCE_ROOT || process.cwd());
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: 10_000, maxBuffer: 100_000 });
    return String(stdout || '').trim();
  } catch { return null; }
}

export async function compileLatestFounderOutcomeMission({ now = new Date() } = {}) {
  const intent = await latestIntent();
  if (!intent?.intent) return { ok:true, status:'NO_FOUNDER_INTENT', missionCreated:false };

  const existing = await readJson(ACTIVE_PATH);
  if (existing?.ok === true && ['ACTIVE','RECONCILIATION_REQUIRED'].includes(existing.state)) {
    if (existing.founderIntent === intent.intent) {
      return { ok:true, status:'FOUNDER_OUTCOME_MISSION_ALREADY_ACTIVE', missionCreated:false, missionId:existing.missionId, deadlineAt:existing.deadlineAt };
    }
    return { ok:true, status:'FOUNDER_OUTCOME_MISSION_CONFLICT_ACTIVE', missionCreated:false, missionId:existing.missionId, deadlineAt:existing.deadlineAt, pendingFounderIntentId:intent.id || null, truthBoundary:'A different unresolved founder mission already owns the active slot. It is preserved rather than silently overwritten.' };
  }

  const mission = compileFounderOutcomeMission({
    founderIntent: intent.intent,
    now,
    timezone: 'Africa/Cairo',
    timezoneOffsetMinutes: 180,
    sourceRevision: await sourceRevision()
  });
  if (!mission.ok) return { ok:true, status:'LATEST_FOUNDER_INTENT_NOT_OUTCOME_MISSION', missionCreated:false, reasonCodes:mission.reasonCodes || [] };

  const durable = {
    ...mission,
    founderIntentId: intent.id || null,
    compiledAt: now.toISOString(),
    state: 'ACTIVE'
  };
  await atomicJson(ACTIVE_PATH, durable);
  return { ok:true, status:'FOUNDER_OUTCOME_MISSION_COMPILED', missionCreated:true, missionId:durable.missionId, deadlineAt:durable.deadlineAt, activePath:ACTIVE_PATH };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invoked) {
  compileLatestFounderOutcomeMission().then(result => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.ok === false) process.exitCode = 2;
  }).catch(error => {
    process.stdout.write(`${JSON.stringify({ ok:false, status:'FOUNDER_OUTCOME_MISSION_COMPILER_CRASH', reasonCodes:[String(error?.message || error).slice(0,300)] }, null, 2)}\n`);
    process.exitCode = 2;
  });
}
