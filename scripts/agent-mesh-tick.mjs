#!/usr/bin/env node
// One finite invocation of the UberBond cognitive bus.
//
// This exists because the bus had no entry point at all. agent-mesh-control-plane
// composes the autonomy pump and the model workers into a bounded cycle, and it
// is the top of the whole mesh -- but nothing imported it outside tests. No
// scheduler job, no worker handler, no npm script, no workflow. Twenty-six
// modules and several thousand passing tests, and not one code path could ever
// reach them in production. "Implemented and tested" is not the same as
// "runnable", and that gap is invisible from a green suite.
//
// Deliberately a script and not a resident process: one invocation pumps a
// bounded set of runs, ticks each configured worker at most once, optionally
// pumps again to ingest fresh results, and exits. Anything that can run a
// command on a timer -- cron, GitHub Actions, a Vercel cron, a container
// scheduler -- can drive it, and none of them become load-bearing for the
// cognitive semantics.
//
// Disabled by default. AGENT_MESH_ENABLED must be exactly "true"; the control
// plane also defaults `enabled` to false independently, so importing this
// module can never start work.
//
// Usage:
//   AGENT_MESH_ENABLED=true node scripts/agent-mesh-tick.mjs
//   node scripts/agent-mesh-tick.mjs --dry-run     # report configuration only
//
// Env:
//   AGENT_MESH_ENABLED       required "true" to do anything
//   AGENT_MESH_RUN_LIMIT     autonomy runs pumped per cycle (default 5, cap 25)
//   AGENT_MESH_WORKERS       JSON array of worker configs; default none
//   AGENT_MESH_INGEST_AFTER  "false" to skip the post-worker ingestion pump
//   UBERBOND_RELAY_ENDPOINT  https .../api/agent-relay -- the transport
//   UBERBOND_RELAY_TOKEN     bearer credential for that endpoint
//   OPENAI_/ANTHROPIC_*      per-provider credential, pricing evidence, enable
//   STORE_BACKEND/DATABASE_URL/DATA_DIR  as the rest of the app uses them
//
// A worker in AGENT_MESH_WORKERS is JSON, so it cannot carry the two functions
// the mesh needs -- the relay transport and the model executor. This script is
// where those are resolved from the environment and attached, and it is the
// only reason a worker can be configured from outside the process at all.

import { pathToFileURL } from 'node:url';
import { config, validateStartupConfig } from '../src/config.mjs';
import { createStore } from '../src/store.mjs';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';
import { compileRelayTaskFromIntent } from '../src/agent-autonomy-relay-adapter.mjs';
import { createRelayAdapterFactory, describeRelayReadiness } from '../src/agent-relay-adapter-factory.mjs';
import { createModelExecutorFactory, describeProviderReadiness } from '../src/agent-model-executor-factory.mjs';

const RUN_LIMIT_CAP = 25;

// Attach the executor each declared worker needs. A provider that cannot be
// driven is reported by name rather than skipped: a worker the operator asked
// for and did not get is a configuration error, not an empty queue.
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
  const workers = parseWorkers(process.env.AGENT_MESH_WORKERS);
  const autonomyRunLimit = boundedInt(process.env.AGENT_MESH_RUN_LIMIT, 5, 1, RUN_LIMIT_CAP);
  const ingestAfterWorkers = process.env.AGENT_MESH_INGEST_AFTER !== 'false';

  if (dryRun) {
    // Report what a real tick would do without touching the store, so a
    // scheduler can be validated before it is allowed to act.
    console.log(JSON.stringify({
      dryRun: true, enabled, workersConfigured: workers.length,
      autonomyRunLimit, ingestAfterWorkers,
      storeBackend: process.env.STORE_BACKEND || 'json (default outside production)',
      relay: describeRelayReadiness(),
      providers: describeProviderReadiness()
    }, null, 2));
    return 0;
  }

  if (!enabled) {
    // Not an error. A scheduler firing against a deliberately disabled mesh is
    // the normal resting state, and it must not look like a failure.
    console.log('[agent-mesh-tick] AGENT_MESH_ENABLED is not "true"; nothing was run.');
    return 0;
  }

  // Same startup validation the server and worker use. A misconfigured store
  // must fail here, loudly, rather than half-running a cognitive cycle.
  validateStartupConfig(config);

  // Resolve both function dependencies before the store is opened, so a
  // misconfigured mesh costs nothing and leaves no connection behind.
  const { resolved, blockers } = resolveWorkers(workers, createModelExecutorFactory());
  if (blockers.length) {
    console.error(`[agent-mesh-tick] worker configuration refused:\n  ${blockers.join('\n  ')}`);
    return 2;
  }

  const store = createStore(config);
  const cycle = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory: createRelayAdapterFactory(),
    compileRelayTask: compileRelayTaskFromIntent,
    workers: resolved,
    autonomyRunLimit,
    ingestAfterWorkers
  });

  console.log(JSON.stringify({
    status: cycle.status,
    ok: cycle.ok,
    workersConfigured: cycle.workersConfigured ?? workers.length,
    reasonCodes: cycle.reasonCodes || [],
    businessEffectAuthority: cycle.businessEffectAuthority ?? 'NONE'
  }, null, 2));

  if (typeof store.close === 'function') await store.close();

  // DEGRADED is a real outcome, not a crash: the cycle ran and something is
  // uncertain. Exit non-zero so a scheduler surfaces it, but distinctly from a
  // hard failure so an operator can tell the two apart.
  if (!cycle.ok) return 2;
  if (cycle.status === 'DEGRADED') return 3;
  return 0;
}

// Only run when invoked as a command. resolveWorkers is exported for tests, and
// importing a module must never start a cognitive cycle as a side effect.
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
