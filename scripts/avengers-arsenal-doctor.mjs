#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAvengersRegistry, buildAvengersReadiness } from '../src/avengers-arsenal.mjs';
import { discoverLocalRuntimeModels } from '../src/avengers-local-discovery.mjs';
import { composeAvengersRegistry } from '../src/avengers-arsenal-config.mjs';

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
  const registry = composeAvengersRegistry({
    baseRegistry: readJson(registryPath),
    externalCapabilityRegistry: readJson(externalRegistryPath),
    profileOverrides: profileJson,
    root
  });
  const registryCheck = validateAvengersRegistry(registry);
  if (!registryCheck.ok) return { ok: false, status: registryCheck.status, reasonCodes: registryCheck.reasonCodes };
  const readiness = await buildAvengersReadiness(registryCheck.registry, { fetchImpl, probeInference, date });
  if (!readiness.ok) return readiness;
  const localDiscovery = discoverLocal
    ? await discoverLocalRuntimeModels({ fetchImpl, date })
    : null;
  const receipt = {
    ...readiness.receipt,
    resolvedRegistry: registryCheck.registry,
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
