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
// A real enabled tick must also provide a stable AGENT_MESH_OCCURRENCE_KEY for
// that concrete scheduled delivery. Re-delivery of the same occurrence reuses
// the key; the next scheduled tick uses a different one. That is what makes
// the cycle evidence durable and idempotent instead of a claim about process
// logs nobody kept.
//
// Usage:
//   AGENT_MESH_ENABLED=true AGENT_MESH_OCCURRENCE_KEY=... node scripts/agent-mesh-tick.mjs
//   node scripts/agent-mesh-tick.mjs --dry-run     # report configuration only
//
// Env:
//   AGENT_MESH_ENABLED         required "true" to do anything
//   AGENT_MESH_OCCURRENCE_KEY  required when enabled; identifies this delivery
//   AGENT_MESH_RUN_LIMIT       autonomy runs pumped per cycle (default 5, cap 25)
//   AGENT_MESH_MISSION         JSON mission declaration; without it the tick
//                              pumps existing runs and seeds nothing
//   AGENT_MESH_WORKERS         JSON array of worker configs; default none
//   AGENT_MESH_INGEST_AFTER    "false" to skip the post-worker ingestion pump
//   AGENT_MESH_SOURCE_COMMIT   commit the cycle receipt is attributed to
//   AGENT_MESH_INTERVAL_MINUTES  expected gap between ticks; lets the health
//                              check notice a scheduler that went silent
//   UBERBOND_RELAY_ENDPOINT    https .../api/agent-relay -- the transport
//   UBERBOND_RELAY_TOKEN       bearer credential for that endpoint
//   AGENT_MESH_EVIDENCE_FILE   path to the activation evidence JSON; without it
//                              the gate permits no provider calls at all
//   CLAUDE_CODE_SANDBOX_*      ROOT, ENABLED, ISOLATION_FILE for the local
//                              Claude Code sandbox provider
//   OPENAI_/ANTHROPIC_*        per-provider credential, pricing evidence, enable
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
import { evaluateAgentMeshActivation } from '../src/agent-mesh-activation-gate.mjs';
import { parseMissionSpec, seedScheduledMission } from '../src/agent-mesh-mission-seed.mjs';
import { composeOperatorHealthSnapshot } from '../src/operator-health-snapshot.mjs';
import {
  evaluateOperatorHealth,
  persistOperatorEscalations,
  readEscalationDeliveryState
} from '../src/operator-escalation.mjs';
import {
  dispatchOperatorPage,
  durableAuditTransport,
  DELIVERY_PROOF
} from '../src/operator-escalation-transport.mjs';
import {
  loadActivationEvidenceFile,
  loadSandboxIsolationReceipt,
  composeActivationInput,
  permittedWorkers
} from '../src/agent-mesh-activation-evidence.mjs';

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
  const schedulerOccurrenceKey = String(process.env.AGENT_MESH_OCCURRENCE_KEY || '').trim();

  // The gate decides whether a provider may be called. Evaluate it before
  // anything else so --dry-run reports the same verdict a real tick enforces.
  const evidence = await loadActivationEvidenceFile(process.env.AGENT_MESH_EVIDENCE_FILE);
  const isolation = await loadSandboxIsolationReceipt(process.env.CLAUDE_CODE_SANDBOX_ISOLATION_FILE);
  const activation = evaluateAgentMeshActivation(composeActivationInput({
    attested: evidence.evidence,
    sandboxIsolationReceipt: isolation.receipt
  }));
  const workers = parseWorkers(process.env.AGENT_MESH_WORKERS);
  const autonomyRunLimit = boundedInt(process.env.AGENT_MESH_RUN_LIMIT, 5, 1, RUN_LIMIT_CAP);
  const ingestAfterWorkers = process.env.AGENT_MESH_INGEST_AFTER !== 'false';
  // A recurring mission has to enter the store somewhere. Without this the
  // occurrence-identity layer is a compiler nothing ever calls.
  const missionSpec = parseMissionSpec(process.env.AGENT_MESH_MISSION);

  if (dryRun) {
    // Report what a real tick would do without touching the store, so a
    // scheduler can be validated before it is allowed to act.
    console.log(JSON.stringify({
      dryRun: true, enabled, workersConfigured: workers.length,
      autonomyRunLimit, ingestAfterWorkers,
      occurrenceKeyConfigured: Boolean(schedulerOccurrenceKey),
      missionConfigured: missionSpec.present,
      missionProblems: missionSpec.reasonCodes,
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
    // Not an error. A scheduler firing against a deliberately disabled mesh is
    // the normal resting state, and it must not look like a failure.
    console.log('[agent-mesh-tick] AGENT_MESH_ENABLED is not "true"; nothing was run.');
    return 0;
  }

  if (!schedulerOccurrenceKey) {
    console.error('[agent-mesh-tick] AGENT_MESH_OCCURRENCE_KEY is required for an enabled scheduled cycle.');
    return 2;
  }
  // A malformed attestation is a refusal, not a shrug. Falling back to "no
  // evidence" would turn an operator's broken file into the same outcome as
  // never having written one.
  if (!evidence.ok) {
    console.error(`[agent-mesh-tick] activation evidence refused: ${evidence.reasonCodes.join(', ')}`);
    return 2;
  }
  if (!isolation.ok) {
    console.error(`[agent-mesh-tick] sandbox isolation receipt refused: ${isolation.reasonCodes.join(', ')}`);
    return 2;
  }
  // A mission that was configured but cannot be parsed is a refusal. Falling
  // through to "no mission" would make an operator's broken JSON look the same
  // as never having written one.
  if (!missionSpec.ok) {
    console.error(`[agent-mesh-tick] mission spec refused: ${missionSpec.reasonCodes.join(', ')}`);
    return 2;
  }

  // Same startup validation the server and worker use. A misconfigured store
  // must fail here, loudly, rather than half-running a cognitive cycle.
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

  // Seed before pumping, so the run this occurrence declares exists to be
  // pumped in the same tick. Idempotent: the runId is derived from the
  // occurrence key, so a redelivered tick finds the run rather than making a
  // second one.
  const seeded = await seedScheduledMission({
    store,
    mission: missionSpec.mission,
    occurrenceKey: schedulerOccurrenceKey
  });
  if (!seeded.ok) {
    console.error(`[agent-mesh-tick] mission seeding refused: ${seeded.reasonCodes.join(', ')}`);
    if (typeof store.close === 'function') await store.close();
    return 2;
  }

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

  // Assess health after the cycle, from durable truth only, and write down
  // anything an owner would need to act on. This is the queue, not the pager:
  // nothing here delivers a message, and the report says so rather than
  // implying somebody was told.
  let escalation = null;
  try {
    const health = await composeOperatorHealthSnapshot({
      store,
      schedulerEnabled: true,
      expectedIntervalMinutes: boundedInt(process.env.AGENT_MESH_INTERVAL_MINUTES, null, 1, 10_080),
      date: new Date()
    });
    // What has already been raised, and what of it ever reached a person.
    // Without this the suppression the kernel was built with is never fed: ten
    // ticks against one unchanging condition wrote thirty durable rows for
    // three real problems.
    const delivery = await readEscalationDeliveryState(store, { date: new Date() });
    const report = evaluateOperatorHealth({
      snapshot: { ...health.snapshot, paging: delivery.ok ? delivery.paging : undefined },
      activeFingerprints: delivery.ok ? delivery.activeFingerprints : []
    });
    if (report.ok) {
      const persisted = await persistOperatorEscalations(store, report);

      // Attempt delivery for what is genuinely new. Only the durable-audit
      // transport is configured, and it reaches nobody -- which is exactly the
      // condition the next assessment will escalate as OWNER_UNREACHABLE.
      // Configuring a transport that reaches a device requires owner
      // authorization this system does not hold, so the honest thing is to try
      // what exists, record the result, and be loud about the gap.
      const transports = [durableAuditTransport(store)];
      const pages = [];
      for (const item of report.escalations) {
        if (item.status !== 'NEW_ESCALATION') continue;
        pages.push(await dispatchOperatorPage(store, { escalation: item, transports, date: new Date() }));
      }

      escalation = {
        health: report.health,
        newEscalations: report.newEscalationCount,
        persistedEscalations: persisted.length,
        ownerActionQueue: report.ownerActionQueue,
        paging: report.paging,
        pagesAttempted: pages.length,
        ownerReached: pages.some(page => page.ownerReached),
        deliveryProof: pages.length
          ? (pages.every(page => page.deliveryProof === DELIVERY_PROOF.DURABLE_RECORD_ONLY)
            ? DELIVERY_PROOF.DURABLE_RECORD_ONLY
            : DELIVERY_PROOF.DELIVERY_INDETERMINATE)
          : report.paging.deliveryProof,
        unreadableDimensions: health.unreadable
      };
    }
  } catch (error) {
    // A health check that cannot run must not take the cycle down with it, but
    // it must not be silent either: an unreported blind spot is worse than a
    // reported one.
    escalation = { health: 'UNKNOWN', error: String(error?.message || '').slice(0, 300) };
  }

  console.log(JSON.stringify({
    status: cycle.status,
    ok: cycle.ok,
    escalation,
    cycleId: cycle.cycleId || null,
    cycleReceiptState: cycle.cycleReceiptState || null,
    duplicateDelivery: cycle.duplicateDelivery === true,
    missionSeed: { status: seeded.status, runId: seeded.runId || null },
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
