#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAvengersRegistry, buildAvengersReadiness } from '../src/avengers-arsenal.mjs';
import { discoverLocalRuntimeModels } from '../src/avengers-local-discovery.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argMap(argv = process.argv.slice(2)) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) map.set(token, true);
    else { map.set(token, next); i += 1; }
  }
  return map;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function externalRole(id) {
  const roles = {
    'find-skills': ['researcher'],
    'claude-code-setup': ['planner'],
    'task-observer': ['critic'],
    'claude-mem': ['general'],
    headroom: ['general'],
    omniroute: ['planner'],
    strix: ['verifier'],
    'agent-reach': ['researcher'],
    'fable-orchestrator': ['planner', 'adjudicator'],
    metaswarm: ['planner', 'adjudicator'],
    superpowers: ['builder', 'verifier']
  };
  return roles[id] || ['general'];
}

function capabilityToTool(entry) {
  const integration = entry?.projectIntegration || {};
  const declaredPath = integration.path || integration.claudeSkillPath || integration.controlPlanePath || integration.canonPath || null;
  const resolved = declaredPath ? path.resolve(root, declaredPath) : null;
  const pathExists = Boolean(resolved && fs.existsSync(resolved));
  const runtimeRequired = integration.runtimeRequired === true
    || integration.runtimeEvidenceRequired === true
    || (integration.upstreamRuntimeOptional === true && integration.runtimeRequiredForProtocol !== false);
  let kind = 'METHOD_ONLY';
  if (entry.class === 'PROJECT_SKILL') kind = 'PROJECT_SKILL';
  else if (entry.class === 'OPTIONAL_RUNTIME') kind = 'OPTIONAL_RUNTIME';
  else if (entry.class === 'EXTERNAL_ADAPTER') kind = 'EXTERNAL_ADAPTER';
  else if (entry.class === 'PROJECT_SKILL_AND_OPTIONAL_RUNTIME') kind = pathExists ? 'PROJECT_SKILL' : 'OPTIONAL_RUNTIME';
  const callableSurfaceRuntimeRequired = entry.id === 'fable-orchestrator'
    ? false
    : runtimeRequired;
  return {
    id: entry.id,
    name: entry.name,
    kind,
    path: pathExists ? declaredPath : null,
    sourceRef: entry.sourceRef || entry.source || null,
    roles: externalRole(entry.id),
    runtimeRequired: callableSurfaceRuntimeRequired,
    notes: [
      `external-class:${entry.class}`,
      `activation:${entry.activation}`,
      `integration-status:${integration.status || 'UNDECLARED'}`,
      pathExists ? 'declared-project-surface-present' : 'declared-project-surface-not-observed'
    ]
  };
}

function mergeProfiles(base, rawEnv) {
  if (!rawEnv || !String(rawEnv).trim()) return base;
  const parsed = JSON.parse(String(rawEnv));
  if (!Array.isArray(parsed)) throw new Error('AVENGERS_MODEL_PROFILES_JSON must be a JSON array');
  const byId = new Map((base || []).map(item => [String(item.id || '').toLowerCase(), item]));
  for (const item of parsed) byId.set(String(item?.id || '').toLowerCase(), item);
  return [...byId.values()];
}

export async function runDoctor({
  registryPath = path.join(root, 'config/avengers-arsenal.json'),
  outputPath = path.join(root, 'artifacts/avengers-arsenal-readiness.json'),
  externalRegistryPath = path.join(root, 'artifacts/external-skill-plugin-registry.json'),
  profileJson = process.env.AVENGERS_MODEL_PROFILES_JSON || '',
  probeInference = false,
  discoverLocal = false,
  fetchImpl = globalThis.fetch,
  date = new Date()
} = {}) {
  const base = readJson(registryPath);
  const external = readJson(externalRegistryPath);
  const registry = {
    ...base,
    profiles: mergeProfiles(base.profiles || [], profileJson),
    tools: [
      ...(base.tools || []),
      ...(Array.isArray(external.entries) ? external.entries.map(capabilityToTool) : [])
    ]
  };
  const registryCheck = validateAvengersRegistry(registry);
  if (!registryCheck.ok) return { ok: false, status: registryCheck.status, reasonCodes: registryCheck.reasonCodes };
  const readiness = await buildAvengersReadiness(registryCheck.registry, { fetchImpl, probeInference, date });
  if (!readiness.ok) return readiness;
  const localDiscovery = discoverLocal
    ? await discoverLocalRuntimeModels({ fetchImpl, date })
    : null;
  const receipt = {
    ...readiness.receipt,
    localDiscovery: localDiscovery?.receipt || null,
    localDiscoveryStatus: localDiscovery?.status || 'NOT_REQUESTED',
    exactTruth: {
      callableModelCount: readiness.receipt.callableModelCount,
      callableToolSurfaceCount: readiness.receipt.callableToolSurfaceCount,
      inferenceProbeRequested: probeInference,
      localDiscoveryRequested: discoverLocal
    }
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return { ok: true, status: 'AVENGERS_DOCTOR_COMPLETE', receipt, outputPath };
}

async function main() {
  const args = argMap();
  const result = await runDoctor({
    registryPath: path.resolve(root, String(args.get('--registry') || 'config/avengers-arsenal.json')),
    outputPath: path.resolve(root, String(args.get('--output') || 'artifacts/avengers-arsenal-readiness.json')),
    externalRegistryPath: path.resolve(root, String(args.get('--external-registry') || 'artifacts/external-skill-plugin-registry.json')),
    profileJson: String(args.get('--profiles-json') || process.env.AVENGERS_MODEL_PROFILES_JSON || ''),
    probeInference: args.has('--probe-inference'),
    discoverLocal: args.has('--discover-local')
  });
  console.log(JSON.stringify({
    status: result.status,
    ok: result.ok,
    callableModelCount: result.receipt?.callableModelCount ?? 0,
    callableToolSurfaceCount: result.receipt?.callableToolSurfaceCount ?? 0,
    visibleLocalRuntimeCount: result.receipt?.localDiscovery?.visibleRuntimeCount ?? 0,
    visibleLocalModelCount: result.receipt?.localDiscovery?.visibleModelCount ?? 0,
    output: result.outputPath || null,
    reasonCodes: result.reasonCodes || []
  }, null, 2));
  return result.ok ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ status: 'AVENGERS_DOCTOR_CRASHED', reason: String(error?.message || error) }));
    process.exitCode = 2;
  });
}
