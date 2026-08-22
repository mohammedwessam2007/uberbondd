// Canonical scheduler boundary for recurring autonomy work.
//
// A logical mission may run many times. The scheduler must supply a durable
// occurrenceKey for the concrete occurrence; retries reuse it, later
// occurrences use a different key. This module is the one production-shaped
// constructor that binds occurrence-aware session identity, initial task
// identity, and durable run identity together.

import crypto from 'node:crypto';
import {
  compileAutonomyOccurrenceSession,
  compileAutonomyOccurrenceTaskIntent
} from './agent-autonomy-occurrence.mjs';
import { createAutonomyRun } from './agent-autonomy-pump.mjs';

export const AGENT_AUTONOMY_SCHEDULED_RUN_POLICY_VERSION = 'agent-autonomy-scheduled-run-1.0.0';

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_SCHEDULED_RUN_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  };
}

function stableRunId(session, initialIntent) {
  const identity = {
    sessionId: session.sessionId,
    taskId: initialIntent.taskId,
    missionKey: session.missionKey,
    occurrenceKey: session.occurrenceKey
  };
  return `autonomy_occ_run_${crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex').slice(0, 24)}`;
}

/**
 * Compile one concrete recurring/scheduled autonomy occurrence.
 *
 * `occurrenceKey` MUST be persisted by the scheduler before execution starts.
 * Reconstructing after a crash with the same key is idempotent. A future
 * scheduled occurrence MUST receive a different key even when every mission
 * field is otherwise identical.
 */
export function compileScheduledAutonomyRun({
  occurrenceKey,
  missionKey = null,
  session: sessionInput,
  initialIntent: initialIntentInput,
  date = new Date()
} = {}) {
  if (!sessionInput || typeof sessionInput !== 'object' || Array.isArray(sessionInput)) {
    return fail(['session-input-required']);
  }
  if (!initialIntentInput || typeof initialIntentInput !== 'object' || Array.isArray(initialIntentInput)) {
    return fail(['initial-intent-input-required']);
  }
  if ('session' in initialIntentInput || 'sessionId' in initialIntentInput || 'taskId' in initialIntentInput) {
    return fail(['scheduler-cannot-inject-derived-identity']);
  }

  const session = compileAutonomyOccurrenceSession({
    ...sessionInput,
    occurrenceKey,
    missionKey,
    date
  });
  if (!session?.ok) return fail(session?.reasonCodes || ['occurrence-session-compilation-failed']);

  const initialIntent = compileAutonomyOccurrenceTaskIntent({
    ...initialIntentInput,
    session,
    date
  });
  if (!initialIntent?.ok) {
    return fail(initialIntent?.reasonCodes || ['initial-intent-compilation-failed'], { session });
  }

  const createdRun = createAutonomyRun({ session, initialIntent, date });
  if (!createdRun?.ok) {
    return fail(createdRun?.reasonCodes || ['autonomy-run-compilation-failed'], { session, initialIntent });
  }

  // createAutonomyRun intentionally includes createdAt for legacy/manual runs.
  // At the scheduler boundary, however, restart reconstruction must not mint a
  // second durable run merely because the process restarted later. Replace the
  // legacy temporal run identity with the persisted occurrence identity while
  // retaining createdAt/updatedAt as observations rather than identity inputs.
  const run = {
    ...createdRun,
    runId: stableRunId(session, initialIntent)
  };

  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_SCHEDULED_RUN_POLICY_VERSION,
    status: 'READY',
    missionKey: session.missionKey,
    occurrenceKey: session.occurrenceKey,
    session,
    initialIntent,
    run
  };
}
