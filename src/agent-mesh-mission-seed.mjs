// The missing half of the scheduler boundary.
//
// #93 gave recurring work a restart-stable identity: a logical mission runs
// many times, each concrete delivery is an occurrence, and a retry of the same
// occurrence must reuse the same run. compileScheduledAutonomyRun is the one
// constructor that binds occurrence-aware session identity, initial task
// identity and durable run identity together.
//
// Nothing in production ever called it. The mesh tick pumps whatever runs
// already exist in the store, and no production path created one with an
// occurrence identity -- so the whole occurrence-identity layer was a compiler
// nobody compiled with, which is the exact failure mode #88 recorded for the
// mesh itself and issue #100 warned about by name.
//
// This is the seeding step. It is deliberately narrow: it turns one declared
// mission into at most one durable run for this occurrence, it is disabled
// unless a mission is explicitly configured, and it is idempotent -- the same
// occurrence key yields the same runId, so a redelivered tick finds the run
// already there rather than creating a second one.
//
// It creates preparation work. It carries no business-effect authority, and
// the run it seeds is bound by the same constraints every other autonomy run
// is bound by.

import { compileScheduledAutonomyRun } from './agent-autonomy-scheduled-run.mjs';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun } from './agent-autonomy-store.mjs';

export const AGENT_MESH_MISSION_SEED_POLICY_VERSION = 'agent-mesh-mission-seed-1.0.0';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_MESH_MISSION_SEED_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    ...extra
  };
}

/**
 * Parse a mission declaration supplied from outside the process.
 *
 * Kept separate from seeding so a --dry-run can report exactly what a real
 * tick would seed without touching the store.
 */
export function parseMissionSpec(raw) {
  const source = text(raw, 20_000);
  if (!source) return { ok: true, present: false, mission: null, reasonCodes: [] };
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, present: true, mission: null, reasonCodes: ['mission-spec-json-required'] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, present: true, mission: null, reasonCodes: ['mission-spec-object-required'] };
  }
  if (!text(parsed.objective, 1600)) {
    return { ok: false, present: true, mission: null, reasonCodes: ['mission-objective-required'] };
  }
  if (!Array.isArray(parsed.acceptanceTests) || !parsed.acceptanceTests.length) {
    return { ok: false, present: true, mission: null, reasonCodes: ['mission-acceptance-tests-required'] };
  }
  return { ok: true, present: true, mission: parsed, reasonCodes: [] };
}

/**
 * Seed at most one durable autonomy run for this scheduled occurrence.
 *
 * @returns {{ok: boolean, status: string, runId?: string, duplicate?: boolean}}
 *   status is SEEDED for a new run, ALREADY_SEEDED when this occurrence has
 *   already produced one, and DISABLED when no mission is configured.
 */
export async function seedScheduledMission({
  store,
  mission,
  occurrenceKey,
  date = new Date()
} = {}) {
  if (!mission) {
    return {
      ok: true,
      policyVersion: AGENT_MESH_MISSION_SEED_POLICY_VERSION,
      status: 'DISABLED',
      seeded: false,
      businessEffectAuthority: 'NONE'
    };
  }
  if (!store || typeof store.log !== 'function' || typeof store.list !== 'function') {
    return fail(['store-log-and-list-required']);
  }
  if (!text(occurrenceKey, 300)) return fail(['scheduler-occurrence-key-required']);

  const compiled = compileScheduledAutonomyRun({
    occurrenceKey,
    missionKey: text(mission.missionKey, 240) || null,
    session: {
      objective: mission.objective,
      maxRounds: mission.maxRounds,
      maxTasks: mission.maxTasks,
      maxTotalTokens: mission.maxTotalTokens,
      founderActionBudget: mission.founderActionBudget
    },
    initialIntent: {
      originAgent: 'uberbond',
      targetAgent: text(mission.targetAgent, 80) || 'chatgpt',
      objective: mission.objective,
      acceptanceTests: mission.acceptanceTests,
      evidenceRefs: Array.isArray(mission.evidenceRefs) && mission.evidenceRefs.length
        ? mission.evidenceRefs
        : ['mission:scheduled'],
      constraints: Array.isArray(mission.constraints) ? mission.constraints : [],
      tokenBudget: mission.tokenBudget
    },
    date
  });
  if (!compiled.ok) return fail(compiled.reasonCodes || ['mission-compilation-failed']);

  // Idempotent by construction: the runId is derived from the occurrence key,
  // so a redelivered tick finds the run that already exists instead of
  // creating a second one for the same delivery.
  const existing = await loadLatestAutonomyRun(store, compiled.run.runId);
  if (existing.ok) {
    return {
      ok: true,
      policyVersion: AGENT_MESH_MISSION_SEED_POLICY_VERSION,
      status: 'ALREADY_SEEDED',
      seeded: false,
      duplicate: true,
      runId: compiled.run.runId,
      missionKey: compiled.missionKey,
      businessEffectAuthority: 'NONE'
    };
  }
  // A saturated scan cannot tell "no such run" from "the run is past the
  // bound", and seeding on that ambiguity would create a duplicate run for one
  // occurrence. Refuse instead.
  if (existing.reasonCodes?.includes('autonomy-run-snapshot-scan-saturated')) {
    return fail(['autonomy-run-snapshot-scan-saturated'], { runId: compiled.run.runId });
  }

  const saved = await saveAutonomyRunSnapshot(store, compiled.run, { reason: 'scheduled-mission-seed', date });
  if (!saved.ok) return fail(saved.reasonCodes || ['mission-run-persist-failed'], { runId: compiled.run.runId });

  return {
    ok: true,
    policyVersion: AGENT_MESH_MISSION_SEED_POLICY_VERSION,
    status: 'SEEDED',
    seeded: true,
    duplicate: false,
    runId: compiled.run.runId,
    missionKey: compiled.missionKey,
    occurrenceKey: compiled.occurrenceKey,
    businessEffectAuthority: 'NONE'
  };
}
