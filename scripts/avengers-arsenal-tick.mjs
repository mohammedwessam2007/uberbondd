#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAvengersPlan } from '../src/avengers-arsenal.mjs';

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

export async function runTick({ readiness, plan, fetchImpl = globalThis.fetch, secretResolver = name => process.env[name] || '', maxTokensPerNode = 2000, costCeilingCentsPerNode = 100, date = new Date() } = {}) {
  if (!readiness?.resolvedRegistry) return { ok: false, status: 'AVENGERS_EXECUTION_BLOCKED', reasonCodes: ['doctor-resolved-registry-required'] };
  return executeAvengersPlan({
    registry: readiness.resolvedRegistry,
    plan,
    fetchImpl,
    secretResolver,
    maxTokensPerNode,
    costCeilingCentsPerNode,
    date
  });
}

async function main() {
  const map = args();
  const readinessPath = path.resolve(root, String(map.get('--readiness') || 'artifacts/avengers-arsenal-readiness.json'));
  const planPath = path.resolve(root, String(map.get('--plan') || 'artifacts/avengers-squad-plan.json'));
  const outputPath = path.resolve(root, String(map.get('--output') || 'artifacts/avengers-execution-latest.json'));
  const readiness = readJson(readinessPath);
  const plan = readJson(planPath);

  if (map.has('--dry-run')) {
    console.log(JSON.stringify({
      status: 'AVENGERS_TICK_DRY_RUN',
      missionId: plan?.mission?.id || null,
      callableModelCount: readiness.callableModelCount ?? 0,
      assignments: plan?.assignments || [],
      providerCalls: 0,
      businessEffectAuthority: 'NONE'
    }, null, 2));
    return 0;
  }

  const result = await runTick({
    readiness,
    plan,
    maxTokensPerNode: Number(map.get('--max-tokens') ?? process.env.AVENGERS_MAX_TOKENS_PER_NODE ?? 2000),
    costCeilingCentsPerNode: Number(map.get('--cost-ceiling-cents') ?? process.env.AVENGERS_COST_CEILING_CENTS_PER_NODE ?? 100)
  });
  const receipt = result.receipt || {
    schemaVersion: 'uberbond.avengers-execution-receipt.v1',
    generatedAt: new Date().toISOString(),
    missionId: plan?.mission?.id || null,
    status: result.status,
    ok: false,
    reasonCodes: result.reasonCodes || [],
    providerCalls: result.providerCalls ?? 0,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: result.externalEffectLedger || { providerCalls: result.providerCalls ?? 0 }
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: result.status,
    ok: result.ok,
    missionId: plan?.mission?.id || null,
    completedNodes: result.receipt?.completedNodes || result.completed || [],
    providerCalls: result.receipt?.providerCalls ?? result.providerCalls ?? 0,
    output: outputPath,
    reasonCodes: result.reasonCodes || [],
    businessEffectAuthority: 'NONE'
  }, null, 2));
  return result.ok ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ status: 'AVENGERS_TICK_CRASHED', reason: String(error?.message || error) }));
    process.exitCode = 2;
  });
}
