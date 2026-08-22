import crypto from 'node:crypto';
import { compileAutonomySession, compileTaskIntent } from './agent-autonomy-loop.mjs';

export const AGENT_AUTONOMY_OCCURRENCE_POLICY_VERSION = 'agent-autonomy-occurrence-1.0.0';

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_OCCURRENCE_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

function logicalMissionIdentity(session) {
  return {
    objective: session.objective,
    economicObjective: session.economicObjective,
    allowedAgents: session.allowedAgents,
    startAgent: session.startAgent,
    maxRounds: session.maxRounds,
    maxTasks: session.maxTasks,
    maxTotalTokens: session.maxTotalTokens,
    founderActionBudget: session.founderActionBudget
  };
}

export function compileAutonomyOccurrenceSession({ occurrenceKey, missionKey = null, ...sessionInput } = {}) {
  const occurrence = text(occurrenceKey, 240);
  if (!occurrence) return fail(['occurrence-key-required']);
  const base = compileAutonomySession(sessionInput);
  if (!base?.ok) return base;
  const logicalIdentity = logicalMissionIdentity(base);
  const stableMissionKey = text(missionKey, 240) || `mission_${hash(logicalIdentity).slice(0, 24)}`;
  const sessionId = `mesh_occ_${hash({ missionKey: stableMissionKey, occurrenceKey: occurrence }).slice(0, 24)}`;
  return { ...base, policyVersion: base.policyVersion, sessionId, missionKey: stableMissionKey, occurrenceKey: occurrence, occurrencePolicyVersion: AGENT_AUTONOMY_OCCURRENCE_POLICY_VERSION };
}

export function compileAutonomyOccurrenceTaskIntent(input = {}) {
  const session = input?.session;
  if (!session?.ok || !text(session.occurrenceKey, 240) || !text(session.missionKey, 240)) return fail(['valid-occurrence-session-required']);
  return compileTaskIntent(input);
}
