// The computation behind the frontier artifacts: baselines, epochs, the mission
// DAG, allocation, and the checkpoint.
//
// It lives in src/ rather than inside the generators because logic only a
// generator performs is logic no mutation can be pointed at -- a lesson this
// repository has now learned twice.
//
// One idea runs through all of it. A baseline read from a record somebody wrote
// weeks ago is not a measurement of this tree, and treating it as one is how a
// system reports 3,683 tests while running 7,717. So every number carries how it
// was obtained, and a recorded number that disagrees with a live one is surfaced
// rather than averaged away.

export const V7_FRONTIER_STATE_VERSION = 'uberbond.v7-frontier-state.v1';

// How a number got here. The distinction is the whole point: LIVE was measured
// by the run that produced the artifact, RECORDED was copied from something
// somebody else wrote down.
export const MEASUREMENT_MODES = Object.freeze(['LIVE', 'RECORDED', 'UNAVAILABLE']);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A baseline entry, with its provenance attached rather than implied.
 *
 * `staleAfterDays` is per-metric because the metrics decay at different rates. A
 * syntax file count is stale the moment a file is added; a browser-suite result
 * can reasonably stand for a week.
 */
export function baselineEntry({ metric, value, mode, ranAt = null, staleAfterDays = 1, now = new Date() }) {
  if (!MEASUREMENT_MODES.includes(mode)) {
    return { metric, value: null, mode: 'UNAVAILABLE', reason: `unknown measurement mode ${JSON.stringify(mode)}` };
  }
  if (mode === 'UNAVAILABLE') return { metric, value: null, mode, ranAt, reason: 'not measurable by this generator' };

  const observed = ranAt ? Date.parse(ranAt) : null;
  const ageMs = Number.isFinite(observed) ? now.getTime() - observed : null;
  // A LIVE measurement is current by construction. A RECORDED one is only as
  // current as its timestamp, and one with no timestamp can never be shown to be
  // current at all -- which is worse than being old.
  const stale = mode === 'LIVE' ? false
    : ageMs === null ? true
      : ageMs > staleAfterDays * DAY_MS;

  return {
    metric,
    value,
    mode,
    ranAt,
    ageDays: ageMs === null ? null : Math.round(ageMs / DAY_MS * 10) / 10,
    stale,
    staleReason: !stale ? null : ageMs === null ? 'no timestamp, so currency cannot be established' : `older than ${staleAfterDays}d`
  };
}

/**
 * Where a recorded baseline and a live one disagree.
 *
 * Not reconciled here. Overwriting the record would destroy the evidence that it
 * was wrong, and averaging them would produce a number describing no tree at all.
 */
export function baselineContradictions(entries) {
  const byMetric = new Map();
  for (const entry of entries) {
    const list = byMetric.get(entry.metric) ?? [];
    list.push(entry);
    byMetric.set(entry.metric, list);
  }
  const contradictions = [];
  for (const [metric, list] of byMetric) {
    const live = list.find(row => row.mode === 'LIVE');
    const recorded = list.find(row => row.mode === 'RECORDED');
    if (live && recorded && live.value !== recorded.value) {
      contradictions.push({
        metric,
        live: live.value,
        recorded: recorded.value,
        recordedAt: recorded.ranAt,
        resolution: 'The live measurement describes this tree. The record is preserved as evidence that it drifted, not corrected in place.'
      });
    }
  }
  return contradictions;
}

/**
 * Missions derived from open gaps.
 *
 * A mission is actionable when nothing external stands in front of it. That is
 * the only distinction that matters for what to do next, and it is computed from
 * the gap's own status rather than from an opinion about difficulty.
 */
export const EXTERNAL_STATUSES = Object.freeze([
  'EXTERNAL_BLOCKED', 'FOUNDER_ONLY', 'ELAPSED_TIME', 'PHYSICAL_ACTION',
  'LEGAL_FACT', 'CUSTOMER_RESPONSE', 'PROVIDER_ACCEPTANCE', 'PAYMENT_OR_SPEND'
]);

export function buildMissionDag(gaps = []) {
  const byId = new Map(gaps.map(gap => [gap.id, gap]));
  const nodes = gaps
    .filter(gap => gap.status !== 'CLOSED' && gap.status !== 'SUPERSEDED' && gap.status !== 'REJECTED_WITH_EVIDENCE')
    .map(gap => {
      const blockedBy = (gap.dependencies ?? []).filter(id => {
        const dep = byId.get(id);
        return dep && dep.status !== 'CLOSED';
      });
      const externallyBlocked = EXTERNAL_STATUSES.includes(gap.status);
      return {
        missionId: `M-${gap.id}`,
        gapId: gap.id,
        title: gap.title,
        family: gap.family,
        gapStatus: gap.status,
        blockedBy,
        // Two different ways to be stuck. A dependency is ours to clear; an
        // external blocker is not, and conflating them turns a waiting list into
        // a to-do list nobody can finish.
        actionable: !externallyBlocked && blockedBy.length === 0,
        blockedReason: externallyBlocked ? `external: ${gap.status}`
          : blockedBy.length ? `waiting on ${blockedBy.join(', ')}`
            : null,
        unblockCondition: gap.unblockCondition ?? null,
        nextExperiment: gap.nextExperiment ?? null
      };
    });

  const edges = nodes.flatMap(node => node.blockedBy.map(dep => ({ from: `M-${dep}`, to: node.missionId, kind: 'DEPENDS_ON' })));
  return {
    nodes,
    edges,
    counts: {
      total: nodes.length,
      actionable: nodes.filter(node => node.actionable).length,
      externallyBlocked: nodes.filter(node => EXTERNAL_STATUSES.includes(node.gapStatus)).length,
      dependencyBlocked: nodes.filter(node => !EXTERNAL_STATUSES.includes(node.gapStatus) && node.blockedBy.length > 0).length
    }
  };
}

/**
 * Allocation across missions.
 *
 * Deliberately not an expected-value ranking. No economic prior exists for any
 * of this work, and inventing one would dress a guess as arithmetic. What can be
 * said honestly is which missions are actionable now, and that is what is
 * allocated; everything else is listed as waiting, with what it waits on.
 */
export function allocateEffort(missionDag) {
  const actionable = missionDag.nodes.filter(node => node.actionable);
  const waiting = missionDag.nodes.filter(node => !node.actionable);
  return {
    basis: 'ACTIONABILITY_ONLY',
    whyNotExpectedValue: 'No economic prior exists for these missions. Ranking them by an invented expected contribution would be a guess wearing arithmetic.',
    allocated: actionable.map(node => ({
      missionId: node.missionId,
      gapId: node.gapId,
      title: node.title,
      share: actionable.length ? Math.round(1000 / actionable.length) / 10 : 0,
      nextExperiment: node.nextExperiment
    })),
    waiting: waiting.map(node => ({
      missionId: node.missionId,
      gapId: node.gapId,
      blockedReason: node.blockedReason,
      unblockCondition: node.unblockCondition
    })),
    counts: { allocated: actionable.length, waiting: waiting.length }
  };
}
