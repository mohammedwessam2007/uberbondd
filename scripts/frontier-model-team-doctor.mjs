#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateFrontierModelCandidateRegistry,
  frontierRoleCoverage,
  matchObservedProfilesToCandidates,
  compileFrontierModelTeamMission
} from '../src/frontier-model-team.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = path.join(root, 'config/frontier-model-candidates.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
let profiles = [];
try {
  if (String(process.env.AVENGERS_MODEL_PROFILES_JSON || '').trim()) profiles = JSON.parse(process.env.AVENGERS_MODEL_PROFILES_JSON);
} catch {
  process.stderr.write(`${JSON.stringify({ ok: false, status: 'FRONTIER_MODEL_PROFILE_ENV_INVALID', businessEffectAuthority: 'NONE' }, null, 2)}\n`);
  process.exit(2);
}
const checked = validateFrontierModelCandidateRegistry(registry);
const roles = checked.ok ? frontierRoleCoverage(registry) : checked;
const matched = checked.ok ? matchObservedProfilesToCandidates({ registry, profiles }) : checked;
let featureGenomeDigest = null;
try {
  const featureGenome = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/uberbond-feature-genome-latest.json'), 'utf8'));
  featureGenomeDigest = featureGenome?.genomeDigest || null;
} catch {}
const mission = checked.ok ? compileFrontierModelTeamMission({
  objective: 'Continuously improve UberBond toward risk-adjusted cleared contribution profit per founder minute while preserving truth, authority, reversibility and founder freedom.',
  featureGenomeDigest,
  complexity: 10,
  maxParallel: 6,
  dataClass: 'SOURCE_CODE'
}) : checked;
const report = {
  ok: checked.ok && roles.ok && matched.ok && mission.ok,
  status: checked.ok && roles.ok && matched.ok && mission.ok ? 'FRONTIER_MODEL_TEAM_DOCTOR_READY' : 'FRONTIER_MODEL_TEAM_DOCTOR_BLOCKED',
  candidateRegistry: checked,
  roleCoverage: roles,
  observedProfileMapping: matched,
  teamMission: mission,
  configuredCandidateCount: matched?.configuredCandidateIds?.length || 0,
  callableCandidateCount: 0,
  callableTruth: 'THIS DOCTOR DOES NOT PRODUCE CALLABILITY PROOF. FRONTIER COGNITIVE FABRIC REQUIRES FRESH PRODUCER-BOUND CALLABILITY RECEIPTS BEFORE LIVE EXECUTION.',
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE'
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 2;
