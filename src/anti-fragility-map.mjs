// Where a life or a business depends on one thing not failing.
//
// Redundancy is easy to fake and the fake is convincing. Three income sources
// all invoicing the same client is one income source. Two backups in the same
// building is one backup. Four model providers all reselling one upstream is one
// provider. In each case the instance count says three or four and the failure
// count says one, and only the second number is about survival.
//
// So redundancy here is counted in independent failure modes, never in
// instances, and a domain whose instances share a mode is reported as a single
// point of failure however many instances it has.
//
// The second rule is about the class labels. Fragile, robust, resilient,
// adaptive, gains-from-variation -- these describe how something responded when
// it was actually shaken. A system nobody has stressed has an unknown class, and
// writing "robust" on it is a prediction wearing the clothes of an observation.
//
// The third is the one the canon insists on and that a maximiser would miss:
// redundancy is not maximised blindly. Every duplicated thing costs money, time,
// attention and coordination, and a life spent maintaining backups is a cost
// too. The map reports the cost beside the coverage rather than recommending
// more of it.
export const ANTI_FRAGILITY_MAP_VERSION = 'uberbond.anti-fragility-map.v1';

/** How a system responded to variation. Earned by observation, never asserted. */
export const FRAGILITY_CLASSES = Object.freeze([
  'UNKNOWN_NOT_STRESSED',   // nobody has shaken it
  'FRAGILE',                // variation degrades it
  'ROBUST',                 // variation does not move it
  'RESILIENT',              // it degrades and recovers
  'ADAPTIVE',               // it changes shape and keeps working
  'GAINS_FROM_VARIATION'    // it is better afterwards
]);

/** Domains a life is asked not to have a single point of failure in. */
export const CRITICAL_DOMAINS = Object.freeze([
  'INCOME', 'IDENTITY', 'MEMORY', 'COMMUNITY', 'HEALTH_SUPPORT', 'HOUSING', 'KNOWLEDGE_ACCESS', 'MOBILITY'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * One thing a domain depends on, with the ways it can fail.
 *
 * Failure modes are mandatory. A dependency that lists none is not a proven-safe
 * dependency; it is one nobody has thought about, and counting it as redundancy
 * is how the theatre starts.
 */
export function dependency(input = {}) {
  const name = text(input?.name, 240);
  const domain = text(input?.domain, 40);
  if (!name) return fail('DEPENDENCY_INVALID', ['dependency-name-required']);
  if (!domain || !CRITICAL_DOMAINS.includes(domain)) {
    return fail('DEPENDENCY_INVALID', ['known-critical-domain-required'], { known: CRITICAL_DOMAINS });
  }
  const modes = [...new Set((Array.isArray(input?.failureModes) ? input.failureModes : [])
    .map(item => text(item, 240)).filter(Boolean))].sort();
  if (modes.length === 0) {
    return fail('DEPENDENCY_INVALID', ['failure-modes-required'], {
      dependency: name,
      note: 'A dependency listing no failure mode has not been thought about, and counting it as redundancy is how the theatre starts.'
    });
  }
  return {
    ok: true,
    status: 'DEPENDENCY_RECORDED',
    dependency: { name, domain, failureModes: modes, maintenanceCostPerMonth: finite(input?.maintenanceCostPerMonth) },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Redundancy per domain, counted the only way that survives contact with reality.
 *
 * Instances and independent modes are both reported. A reader who sees only the
 * instance count learns the wrong thing, and a reader who sees only the mode
 * count cannot tell how much duplication produced it.
 */
export function mapRedundancy(dependencies = []) {
  const rows = (Array.isArray(dependencies) ? dependencies : [])
    .filter(row => row?.name && CRITICAL_DOMAINS.includes(row?.domain) && Array.isArray(row?.failureModes) && row.failureModes.length);

  const byDomain = new Map();
  for (const row of rows) {
    if (!byDomain.has(row.domain)) byDomain.set(row.domain, { instances: [], modeSets: [] });
    const entry = byDomain.get(row.domain);
    entry.instances.push(row.name);
    entry.modeSets.push(new Set(row.failureModes));
  }

  const domains = [];
  for (const [domain, entry] of [...byDomain.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // A mode shared by every instance takes the whole domain down at once.
    const shared = [...entry.modeSets[0]].filter(mode => entry.modeSets.every(set => set.has(mode))).sort();
    const distinct = new Set();
    for (const set of entry.modeSets) for (const mode of set) distinct.add(mode);

    // Survivable modes are the ones that do not hit every instance.
    const independentSurvivableModes = [...distinct].filter(mode => !shared.includes(mode)).length;
    const singlePointOfFailure = entry.instances.length > 0 && shared.length > 0;

    domains.push({
      domain,
      instances: entry.instances.length,
      instanceNames: [...entry.instances].sort(),
      sharedFailureModes: shared,
      independentSurvivableModes,
      singlePointOfFailure
    });
  }

  const uncovered = CRITICAL_DOMAINS.filter(domain => !byDomain.has(domain));
  const totalCost = rows.reduce((sum, row) => sum + (finite(row.maintenanceCostPerMonth) || 0), 0);

  return {
    ok: true,
    status: domains.some(row => row.singlePointOfFailure) ? 'SINGLE_POINT_OF_FAILURE_PRESENT' : 'REDUNDANCY_MAPPED',
    domains,
    domainsWithNoRecordedDependency: uncovered,
    maintenanceCostPerMonth: totalCost,
    law: 'REDUNDANCY_IS_COUNTED_IN_INDEPENDENT_FAILURE_MODES__NEVER_IN_INSTANCES',
    // Beside the coverage, never as a recommendation to add more.
    costBoundary: 'DUPLICATION_COSTS_MONEY_TIME_AND_ATTENTION__REDUNDANCY_IS_NOT_MAXIMISED_BLINDLY',
    uncoveredBoundary: 'A_DOMAIN_WITH_NO_RECORDED_DEPENDENCY_IS_UNMAPPED__NOT_PROVEN_SAFE',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The fragility class, which has to be earned by an actual stress.
 *
 * Predicted classes are accepted and kept separate from observed ones, because
 * the useful question later is whether the prediction was right, and merging
 * them now destroys the only evidence that could answer it.
 */
export function classify({ system = null, stressesObserved = [], predictedClass = null } = {}) {
  const name = text(system, 240);
  if (!name) return fail('CLASSIFY_INVALID', ['system-name-required']);

  const predicted = text(predictedClass, 40);
  if (predicted && !FRAGILITY_CLASSES.includes(predicted)) {
    return fail('CLASSIFY_INVALID', ['known-fragility-class-required'], { known: FRAGILITY_CLASSES });
  }

  const stresses = (Array.isArray(stressesObserved) ? stressesObserved : [])
    .map(row => ({
      event: text(row?.event, 480),
      degraded: row?.degraded === true,
      recovered: row?.recovered === true,
      changedShape: row?.changedShape === true,
      betterAfterwards: row?.betterAfterwards === true
    }))
    .filter(row => row.event);

  if (stresses.length === 0) {
    return {
      ok: true,
      status: 'FRAGILITY_UNKNOWN',
      system: name,
      observedClass: 'UNKNOWN_NOT_STRESSED',
      predictedClass: predicted || null,
      law: 'A_SYSTEM_NOBODY_SHOOK_HAS_AN_UNKNOWN_CLASS__ROBUST_WRITTEN_ON_IT_IS_A_PREDICTION',
      businessEffectAuthority: 'NONE'
    };
  }

  const observed = stresses.some(row => row.betterAfterwards) ? 'GAINS_FROM_VARIATION'
    : stresses.some(row => row.changedShape) ? 'ADAPTIVE'
      : stresses.some(row => row.degraded && row.recovered) ? 'RESILIENT'
        : stresses.some(row => row.degraded && !row.recovered) ? 'FRAGILE'
          : 'ROBUST';

  return {
    ok: true,
    status: 'FRAGILITY_OBSERVED',
    system: name,
    observedClass: observed,
    predictedClass: predicted || null,
    // Kept apart so the prediction can be scored later rather than absorbed now.
    predictionHeld: predicted ? (predicted === observed ? 'PREDICTION_MATCHED' : 'PREDICTION_MISSED') : 'NO_PREDICTION_MADE',
    stressCount: stresses.length,
    evidenceBoundary: 'CLASSIFIED_FROM_THE_STRESSES_OBSERVED__NOT_FROM_STRESSES_NOT_YET_SEEN',
    businessEffectAuthority: 'NONE'
  };
}
