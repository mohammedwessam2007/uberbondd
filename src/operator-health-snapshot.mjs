// Compose the health snapshot the operator escalation kernel evaluates.
//
// The kernel knows how to recognise eleven ways the system is in trouble. It
// does not know how to look at the store, and nothing was calling it -- the
// same shape as the mesh entry point in #88 and the occurrence compiler in
// #100: a capable module no code path could reach.
//
// This reads durable truth and nothing else. Every field is a count or a
// timestamp already written down by something that had authority to write it,
// so a snapshot cannot manufacture health it has not observed. Where a
// dimension cannot be read it is left undefined rather than defaulted to zero,
// because "nothing is wrong" and "we did not look" must not be the same value.

import {
  listTerminalAgentMeshCycleReceipts,
  findAbandonedAgentMeshCycles
} from './agent-mesh-cycle-receipts.mjs';
import { listLatestAutonomyRuns } from './agent-autonomy-store.mjs';

export const OPERATOR_HEALTH_SNAPSHOT_POLICY_VERSION = 'operator-health-snapshot-1.0.0';

const STALLED_AFTER_MS = 6 * 60 * 60 * 1000;

function isoOrNull(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * @returns {{ok: boolean, snapshot: object, unreadable: string[]}}
 *   `unreadable` names the dimensions this store could not answer. A caller
 *   that escalates on a partial snapshot should know which parts were blind.
 */
export async function composeOperatorHealthSnapshot({
  store,
  schedulerEnabled = false,
  expectedIntervalMinutes = null,
  abandonedAfterMs = 60 * 60 * 1000,
  stalledAfterMs = STALLED_AFTER_MS,
  historyLimit = 2000,
  date = new Date()
} = {}) {
  const unreadable = [];
  const nowMs = new Date(isoOrNull(date) || Date.now()).getTime();

  let terminalReceipts = [];
  try {
    terminalReceipts = await listTerminalAgentMeshCycleReceipts({ store, limit: historyLimit });
  } catch {
    unreadable.push('scheduler.lastTerminalAt');
  }

  let abandonedCycles;
  try {
    abandonedCycles = (await findAbandonedAgentMeshCycles({ store, now: date, abandonedAfterMs, limit: historyLimit })).length;
  } catch {
    unreadable.push('queue.abandonedCycles');
  }

  let openDeadLetters;
  try {
    const jobs = await store.list('jobs', { limit: 10_000 });
    openDeadLetters = Array.isArray(jobs) ? jobs.filter(job => job?.status === 'dead-letter').length : undefined;
    if (openDeadLetters === undefined) unreadable.push('queue.openDeadLetters');
  } catch {
    unreadable.push('queue.openDeadLetters');
  }

  // A run is stalled if it is still active and nothing has touched it for
  // longer than the horizon. That is the observable shape of work that stopped
  // without saying so.
  let stalledRuns;
  let strandedRuns;
  try {
    const listed = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 200, order: 'oldest' });
    if (listed.ok) {
      stalledRuns = listed.runs.filter(run => {
        const updated = Date.parse(run?.updatedAt || '');
        return Number.isFinite(updated) && nowMs - updated > stalledAfterMs;
      }).length;
      // A run awaiting a result with no relay reference has nothing that could
      // ever deliver one.
      strandedRuns = listed.runs.filter(run => run?.phase === 'AWAITING_RESULT' && !run?.relayRef).length;
    } else {
      unreadable.push('queue.stalledRuns');
    }
  } catch {
    unreadable.push('queue.stalledRuns');
  }

  const lastTerminal = terminalReceipts.length ? terminalReceipts[terminalReceipts.length - 1] : null;

  // Effect-ledger integrity, read off the receipts themselves rather than
  // asserted: a terminal receipt claiming authority or a non-zero effect is a
  // contradiction of the contract it was written under.
  const nonZeroUnauthorizedEffects = terminalReceipts.filter(receipt =>
    receipt.businessEffectAuthority !== 'NONE'
    || Object.values(receipt.externalEffectLedger || {}).some(value => Number(value) !== 0)).length;

  return {
    ok: true,
    policyVersion: OPERATOR_HEALTH_SNAPSHOT_POLICY_VERSION,
    observedAt: isoOrNull(date),
    unreadable,
    snapshot: {
      scheduler: {
        enabled: schedulerEnabled === true,
        lastTerminalAt: lastTerminal ? isoOrNull(lastTerminal.finishedAt || lastTerminal.startedAt) : null,
        expectedIntervalMinutes,
        evidenceRefs: lastTerminal?.cycleId ? [`receipt:${lastTerminal.cycleId}`] : []
      },
      queue: {
        openDeadLetters,
        abandonedCycles,
        stalledRuns,
        strandedRuns
      },
      truth: {
        nonZeroUnauthorizedEffects
      }
      // `commercial` is deliberately absent. Payment and send state have no
      // durable source in this system yet, and inventing zeros would report
      // health nobody observed.
    }
  };
}
