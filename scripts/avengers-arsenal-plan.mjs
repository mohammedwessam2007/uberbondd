#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileAvengersSquad } from '../src/avengers-arsenal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function args(argv = process.argv.slice(2)) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i];
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out.set(key, true);
    else { out.set(key, next); i += 1; }
  }
  return out;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

export function runPlanner({ readiness, mission, maxFallbacks = 2 } = {}) {
  if (!readiness?.resolvedRegistry) return { ok: false, status: 'AVENGERS_PLAN_BLOCKED', reasonCodes: ['doctor-resolved-registry-required'] };
  return compileAvengersSquad({ registry: readiness.resolvedRegistry, readiness, mission, maxFallbacks });
}

async function main() {
  const map = args();
  const readinessPath = path.resolve(root, String(map.get('--readiness') || 'artifacts/avengers-arsenal-readiness.json'));
  const outputPath = path.resolve(root, String(map.get('--output') || 'artifacts/avengers-squad-plan.json'));
  const readiness = readJson(readinessPath);
  const mission = map.get('--mission-json')
    ? JSON.parse(String(map.get('--mission-json')))
    : readJson(path.resolve(root, String(map.get('--mission') || 'config/avengers-mission.json')));
  const result = runPlanner({ readiness, mission, maxFallbacks: Number(map.get('--fallbacks') ?? 2) });
  if (!result.ok) {
    console.error(JSON.stringify({ status: result.status, reasonCodes: result.reasonCodes || [], assignments: result.assignments || [] }, null, 2));
    return 2;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result.plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: result.status,
    missionId: result.plan.mission.id,
    graphDigest: result.plan.graphDigest,
    assignments: result.plan.assignments.map(item => ({
      nodeId: item.nodeId,
      primary: item.primary?.profileId || null,
      fallbacks: item.fallbacks.map(fallback => fallback.profileId),
      toolIds: item.toolIds
    })),
    output: outputPath,
    businessEffectAuthority: 'NONE'
  }, null, 2));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ status: 'AVENGERS_PLANNER_CRASHED', reason: String(error?.message || error) }));
    process.exitCode = 2;
  });
}
