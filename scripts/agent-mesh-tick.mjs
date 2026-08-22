#!/usr/bin/env node
// One finite invocation of the UberBond cognitive bus.
// Disabled by default. A real enabled scheduler tick must provide a stable
// AGENT_MESH_OCCURRENCE_KEY for that concrete scheduled delivery. Re-delivery
// of the same occurrence must reuse the same key; the next scheduled tick must
// use a different one. This is what makes aggregate cycle evidence durable and
// idempotent instead of depending on process logs.

import { pathToFileURL } from 'node:url';
import { config, validateStartupConfig } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';
import { compileRelayTaskFromIntent } from '../src/agent-autonomy-relay-adapter.mjs';
import { createRelayAdapterFactory, describeRelayReadiness } from '../src/agent-relay-adapter-factory.mjs';
import { createModelExecutorFactory, describeProviderReadiness } from '../src/agent-model-executor-factory.mjs';
import { evaluateAgentMeshActivation } from '../src/agent-mesh-activation-gate.mjs';
import {
  loadActivationEvidenceFile,
  loadSandboxIsolationReceipt,
  composeActivationInput,
  permittedWorkers
} from '../src/agent-mesh-activation-evidence.mjs';

const RUN_LIMIT_CAP = 25;

export function resolveWorkers(workers, modelExecutorFor) {
  const resolved = [];
  const blockers = [];
  workers.forEach((worker, index) => {
    const label = worker?.workerId || `worker[${index}]`;
    try {
      resolved.push({ ...worker, modelExecutor: modelExecutorFor(worker) });
    } catch (error) {
      blockers.push(`${label}: ${String(error?.message || error).slice(0, 160)}`);
    }
  });
  return { resolved, blockers };
}

function boundedInt(value, fallback, min, max) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function parseWorkers(raw) {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('AGENT_MESH_WORKERS must be a JSON array');
    return parsed;
  } catch (error) {
    throw new Error(`AGENT_MESH_WORKERS is not valid JSON: ${String(error.message).slice(0, 120)}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const enabled = process.env.AGENT_MESH_ENABLED === 'true';
  const schedulerOccurrenceKey = String(process.env.AGENT_MESH_OCCURRENCE_KEY || '').trim();

  const evidence = await loadActivationEvidenceFile(process.env.AGENT_MESH_EVIDENCE_FILE);
  const isolation = await loadSandboxIsolationReceipt(process.env.CLAUDE_CODE_SANDBOX_ISOLATION_FILE);
  const activation = evaluateAgentMeshActivation(composeActivationInput({
    attested: evidence.evidence,
    sandboxIsolationReceipt: isolation.receipt
  }));
  const workers = parseWorkers(process.env.AGENT_MESH_WORKERS);
  const autonomyRunLimit = boundedInt(process.env.AGENT_MESH_RUN_LIMIT, 5, 1, RUN_LIMIT_CAP);
  const ingestAfterWorkers = process.env.AGENT_MESH_INGEST_AFTER !== 'false';

  if (dryRun) {
    console.log(JSON.stringify({
      dryRun: true, enabled, workersConfigured: workers.length,
      autonomyRunLimit, ingestAfterWorkers,
      occurrenceKeyConfigured: Boolean(schedulerOccurrenceKey),
      storeBackend: process.env.STORE_BACKEND || 'json (default outside production)',
      relay: describeRelayReadiness(),
      providers: describeProviderReadiness({ sandboxIsolationReceipt: isolation.receipt }),
      activation: {
        evidenceFile: evidence.present ? 'present' : 'absent',
        evidenceProblems: evidence.reasonCodes,
        isolationReceipt: isolation.present ? 'present' : 'absent',
        isolationProblems: isolation.reasonCodes,
        status: activation.status,
        permittedMode: activation.permittedMode,
        nextGates: activation.nextGates
      }
    }, null, 2));
    return 0;
  }

  if (!enabled) {
    console.log('[agent-mesh-tick] AGENT_MESH_ENABLED is not "true"; nothing was run.');
    return 0;
  }

  if (!schedulerOccurrenceKey) {
    console.error('[agent-mesh-tick] AGENT_MESH_OCCURRENCE_KEY is required for an enabled scheduled cycle.');
    return 2;
  }
  if (!evidence.ok) {
    console.error(`[agent-mesh-tick] activation evidence refused: ${evidence.reasonCodes.join(', ')}`);
    return 2;
  }
  if (!isolation.ok) {
    console.error(`[agent-mesh-tick] sandbox isolation receipt refused: ${isolation.reasonCodes.join(', ')}`);
    return 2;
  }

  validateStartupConfig(config);
  const { resolved, blockers } = resolveWorkers(
    workers,
    createModelExecutorFactory({ sandboxIsolationReceipt: isolation.receipt })
  );
  if (blockers.length) {
    console.error(`[agent-mesh-tick] worker configuration refused:\n  ${blockers.join('\n  ')}`);
    return 2;
  }

  const gated = permittedWorkers(resolved, activation);
  if (gated.withheld.length) {
    const names = gated.withheld.map(worker => worker.workerId || '(unnamed)').join(', ');
    console.error(`[agent-mesh-tick] activation gate is ${activation.status} (${gated.mode}); withholding ${gated.withheld.length} worker(s): ${names}`);
    if (gated.reason) console.error(`[agent-mesh-tick] ${gated.reason}`);
    for (const gate of activation.nextGates) console.error(`[agent-mesh-tick] next gate: ${gate}`);
  }

  const store = createStore(config);
  const cycle = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory: createRelayAdapterFactory(),
    compileRelayTask: compileRelayTaskFromIntent,
    workers: gated.allowed,
    autonomyRunLimit,
    ingestAfterWorkers,
    schedulerOccurrenceKey,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null
  });

  console.log(JSON.stringify({
    status: cycle.status,
    ok: cycle.ok,
    cycleId: cycle.cycleId || null,
    cycleReceiptState: cycle.cycleReceiptState || null,
    duplicateDelivery: cycle.duplicateDelivery === true,
    activationStatus: activation.status,
    permittedMode: gated.mode,
    workersConfigured: cycle.workersConfigured ?? gated.allowed.length,
    workersWithheld: gated.withheld.length,
    reasonCodes: cycle.reasonCodes || [],
    businessEffectAuthority: cycle.businessEffectAuthority ?? 'NONE'
  }, null, 2));

  if (typeof store.close === 'function') await store.close();
  if (!cycle.ok) return 2;
  if (cycle.status === 'DEGRADED') return 3;
  if (gated.withheld.length) return 3;
  return 0;
}

const invokedDirectly = process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  main()
    .then(code => { process.exitCode = code; })
    .catch(error => {
      console.error(`[agent-mesh-tick] ${String(error.message || error).slice(0, 300)}`);
      process.exitCode = 1;
    });
}
