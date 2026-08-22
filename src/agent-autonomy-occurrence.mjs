import crypto from 'node:crypto';
import { compileAutonomySession, compileTaskIntent } from './agent-autonomy-loop.mjs';

export const AGENT_AUTONOMY_OCCURRENCE_POLICY_VERSION = 'agent-autonomy-occurrence-1.1.0';

const MAX_IDENTITY_KEY_LENGTH = 240;

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function rawText(value) {
  return String(value ?? '').trim();
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
  const rawOccurrence = rawText(occurrenceKey);
  if (!rawOccurrence) return fail(['occurrence-key-required']);
  if (rawOccurrence.length > MAX_IDENTITY_KEY_LENGTH) return fail(['occurrence-key-too-long']);

  const rawMissionKey = missionKey == null ? '' : rawText(missionKey);
  if (rawMissionKey.length > MAX_IDENTITY_KEY_LENGTH) return fail(['mission-key-too-long']);

  const base = compileAutonomySession(sessionInput);
  if (!base?.ok) return base;
  const logicalIdentity = logicalMissionIdentity(base);
  const stableMissionKey = rawMissionKey || `mission_${hash(logicalIdentity).slice(0, 24)}`;
  const sessionId = `mesh_occ_${hash({ missionKey: stableMissionKey, occurrenceKey: rawOccurrence }).slice(0, 24)}`;
  return {
    ...base,
    policyVersion: base.policyVersion,
    sessionId,
    missionKey: stableMissionKey,
    occurrenceKey: rawOccurrence,
    occurrencePolicyVersion: AGENT_AUTONOMY_OCCURRENCE_POLICY_VERSION
  };
}

export function compileAutonomyOccurrenceTaskIntent(input = {}) {
  const session = input?.session;
  const occurrenceKey = rawText(session?.occurrenceKey);
  const missionKey = rawText(session?.missionKey);
  if (
    !session?.ok ||
    !occurrenceKey || occurrenceKey.length > MAX_IDENTITY_KEY_LENGTH ||
    !missionKey || missionKey.length > MAX_IDENTITY_KEY_LENGTH
  ) {
    return fail(['valid-occurrence-session-required']);
  }
  return compileTaskIntent(input);
}
