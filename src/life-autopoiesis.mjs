// Where the parts of a life feed each other, and what a finite one costs.
//
// The ordinary framing is balance: domains competing for a fixed pool of hours,
// and a good life is a good allocation. That framing loses the thing that
// actually compounds, which is not any single domain but the loops between them
// -- health into energy into learning into capability into opportunity into
// freedom into a better environment into health.
//
// The second half of this module is the constraint the first half runs inside.
// Time is finite and elapsed time does not come back, so a system that
// optimizes a life can consume the life it was optimizing. Scarcity here is not
// a resource model; it is the reason a "we can do that later" is sometimes
// false.
export const LIFE_AUTOPOIESIS_VERSION = 'uberbond.life-autopoiesis.v1';

/** Resources whose marginal value changes across a life. */
export const SCARCE_RESOURCES = Object.freeze([
  'TIME', 'ATTENTION', 'HEALTH', 'BIOLOGICAL_ENERGY', 'YOUTH',
  'RARE_RELATIONSHIPS', 'OPPORTUNITY_WINDOWS', 'MONEY', 'CAPABILITY'
]);

/** Why a window closes. Only the last reopens. */
export const WINDOW_CAUSES = Object.freeze([
  'AGE', 'FAMILY_CIRCUMSTANCE', 'GEOGRAPHY', 'HISTORICAL_MOMENT',
  'RELATIONSHIP', 'HEALTH', 'TECHNOLOGY', 'RECURRING'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Finds reinforcing loops among life domains.
 *
 * A loop is a cycle in the feeds-graph. Reported as the cycle rather than as a
 * score, because the useful output is which specific chain compounds -- a
 * number would say a life is 0.7 autopoietic, which nobody can act on.
 */
export function findReinforcingLoops(edges = []) {
  const rows = (Array.isArray(edges) ? edges : [])
    .map(row => ({ from: text(row?.from, 120), to: text(row?.to, 120) }))
    .filter(row => row.from && row.to);

  const out = new Map();
  for (const row of rows) out.set(row.from, [...(out.get(row.from) || []), row.to]);

  const loops = [];
  const seen = new Set();
  const walk = (start, node, path) => {
    for (const next of (out.get(node) || [])) {
      if (next === start) {
        // Canonical rotation, so one cycle is not reported once per entry point.
        const cycle = [...path, node];
        const lowest = cycle.indexOf([...cycle].sort()[0]);
        const key = [...cycle.slice(lowest), ...cycle.slice(0, lowest)].join('->');
        if (!seen.has(key)) { seen.add(key); loops.push(key.split('->')); }
        continue;
      }
      if (path.includes(next) || path.length > 8) continue;
      walk(start, next, [...path, node]);
    }
  };
  for (const node of out.keys()) walk(node, node, []);

  return {
    ok: true,
    status: loops.length ? 'REINFORCING_LOOPS_FOUND' : 'NO_LOOPS_FOUND',
    loops,
    domains: [...new Set(rows.flatMap(row => [row.from, row.to]))].sort(),
    question: 'Not how to balance these, but how each valuable part can strengthen the others.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a window is genuinely closing or merely feels urgent.
 *
 * Importance and urgency come apart constantly, and the expensive error is
 * treating a recurring opportunity as scarce. RECURRING is in the vocabulary so
 * that answer is sayable.
 */
export function windowOfLife({ opportunity = null, cause = null, closesAround = null } = {}) {
  const what = text(opportunity, 500);
  if (!what) return fail('WINDOW_INVALID', ['opportunity-required']);
  if (!WINDOW_CAUSES.includes(cause)) return fail('WINDOW_INVALID', ['valid-window-cause-required']);

  const recurring = cause === 'RECURRING';
  return {
    ok: true,
    status: recurring ? 'NOT_A_CLOSING_WINDOW' : 'WINDOW_CLOSES',
    opportunity: what,
    cause,
    closesAround: text(closesAround, 120) || null,
    // The distinction the function exists for.
    urgencyIsRealScarcity: !recurring,
    note: recurring
      ? 'This comes round again. It may be important; it is not scarce, and treating it as scarce spends a window that was not closing.'
      : 'This does not come round again in the same form.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What a resource is worth now, given that it is not worth that forever.
 *
 * Youth and rare relationships have no replacement cost, so a trade that
 * spends them is not the same shape as one that spends money -- and a system
 * that priced them in one currency would recommend the trade every time.
 */
export function scarcityPhysics({ resource = null, spentOn = null, replaceable = null } = {}) {
  if (!SCARCE_RESOURCES.includes(resource)) return fail('SCARCITY_INVALID', ['valid-scarce-resource-required']);
  const use = text(spentOn, 500);

  const irreplaceable = replaceable === false
    || ['TIME', 'YOUTH', 'OPPORTUNITY_WINDOWS'].includes(resource);

  return {
    ok: true,
    status: irreplaceable ? 'SPENT_IRREPLACEABLY' : 'SPENT_RECOVERABLY',
    resource,
    spentOn: use,
    replaceable: !irreplaceable,
    law: irreplaceable
      ? 'ELAPSED TIME DOES NOT COME BACK. THIS TRADE IS NOT THE SAME SHAPE AS ONE THAT SPENDS MONEY.'
      : 'THIS RESOURCE CAN BE REBUILT, WHICH IS NOT THE SAME AS IT BEING FREE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether preparing for a life is consuming the life.
 *
 * The failure a lifetime optimizer is most likely to cause, and the one it is
 * least likely to notice, because every individual deferral is defensible.
 */
export function mortalHorizon({ yearsSpentPreparing = 0, yearsLived = 0, deferredExperiences = [] } = {}) {
  const preparing = Number(yearsSpentPreparing) || 0;
  const lived = Number(yearsLived) || 0;
  const deferred = (Array.isArray(deferredExperiences) ? deferredExperiences : [])
    .map(item => text(item, 240)).filter(Boolean);

  const ratio = lived > 0 ? preparing / lived : null;
  return {
    ok: true,
    status: ratio !== null && ratio > 0.5 ? 'PREPARATION_IS_CONSUMING_THE_LIFE' : 'HORIZON_RECORDED',
    yearsSpentPreparing: preparing,
    yearsLived: lived,
    preparationRatio: ratio === null ? null : Number(ratio.toFixed(4)),
    deferredExperiences: deferred,
    question: 'Is the preparation still for a life that is being lived, or has it become the life?',
    boundary: 'THIS IS A QUESTION FOR THE FOUNDER. NO RATIO DECIDES HOW SOMEONE SHOULD SPEND THEIR YEARS.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Optimization that would destroy what it optimizes.
 *
 * Sometimes the correct output is that further improvement costs more than it
 * returns -- not in resources, but in the thing itself. A perfectly scheduled
 * friendship is a worse friendship.
 */
export function preserveMystery({ subject = null, furtherOptimizationWouldRemove = [] } = {}) {
  const what = text(subject, 500);
  if (!what) return fail('MYSTERY_INVALID', ['subject-required']);

  const wouldLose = (Array.isArray(furtherOptimizationWouldRemove) ? furtherOptimizationWouldRemove : [])
    .map(item => text(item, 240)).filter(Boolean);

  return {
    ok: true,
    status: wouldLose.length ? 'LEAVE_THIS_ALONE' : 'OPTIMIZATION_HAS_NO_IDENTIFIED_COST_HERE',
    subject: what,
    wouldLose,
    note: wouldLose.length
      ? 'Further optimization here removes part of what makes it valuable. A sufficiently capable system knows when to stop.'
      : 'No cost to further optimization was identified, which is not the same as there being none.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Collisions that raise the chance of a valuable accident.
 *
 * Surface area, not networking. The output is deliberately the conditions
 * rather than an expected value, because a serendipity engine that predicted
 * its own returns would be choosing the discovery in advance.
 */
export function serendipitySurface({ contexts = [] } = {}) {
  const rows = (Array.isArray(contexts) ? contexts : [])
    .map(row => ({ context: text(row?.context, 240), field: text(row?.field, 120) }))
    .filter(row => row.context && row.field);

  const fields = new Set(rows.map(row => row.field));
  return {
    ok: true,
    status: fields.size > 1 ? 'HETEROGENEOUS_SURFACE' : 'HOMOGENEOUS_SURFACE',
    contexts: rows.length,
    distinctFields: fields.size,
    // Homogeneity is the finding: twenty contexts in one field is one context
    // twenty times, and valuable accidents happen at edges.
    note: fields.size > 1
      ? 'Contexts span different fields, which is where unplanned collisions happen.'
      : 'Every context sits in one field. That is one context repeated, and edges are where accidents happen.',
    boundary: 'THIS CREATES CONDITIONS. PREDICTING THE DISCOVERY WOULD BE CHOOSING IT IN ADVANCE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a life is over-exploring or over-exploiting.
 *
 * No global setting is assumed: different domains sit at different points, and
 * a single dial for a whole life would be the scalar this canon forbids.
 */
export function exploreExploit(domains = []) {
  const rows = (Array.isArray(domains) ? domains : [])
    .map(row => ({
      domain: text(row?.domain, 120),
      mode: ['EXPLORING', 'EXPLOITING', 'MIXED'].includes(row?.mode) ? row.mode : null,
      yearsInMode: Number.isFinite(Number(row?.yearsInMode)) ? Number(row.yearsInMode) : null
    }))
    .filter(row => row.domain && row.mode);

  const stuck = rows.filter(row => row.yearsInMode !== null && row.yearsInMode > 5 && row.mode !== 'MIXED');
  return {
    ok: true,
    status: stuck.length ? 'DOMAINS_IN_ONE_MODE_FOR_YEARS' : 'MODES_RECORDED',
    domains: rows,
    stuck: stuck.map(row => ({ domain: row.domain, mode: row.mode, years: row.yearsInMode })),
    // Per domain, never one dial for a life.
    boundary: 'DIFFERENT DOMAINS SIT AT DIFFERENT POINTS. A SINGLE SETTING FOR A WHOLE LIFE WOULD BE THE SCALAR THIS CANON FORBIDS.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Which experiences still mattered years later.
 *
 * Surfaced from the founder's own evidence rather than from a theory of
 * meaning. The system has no view on what should have mattered.
 */
export function meaningArchaeology(experiences = []) {
  const rows = (Array.isArray(experiences) ? experiences : [])
    .map(row => ({
      experience: text(row?.experience, 500),
      matteredAtTime: Number.isFinite(Number(row?.matteredAtTime)) ? Number(row.matteredAtTime) : null,
      mattersNow: Number.isFinite(Number(row?.mattersNow)) ? Number(row.mattersNow) : null,
      yearsSince: Number.isFinite(Number(row?.yearsSince)) ? Number(row.yearsSince) : null
    }))
    .filter(row => row.experience && row.matteredAtTime !== null && row.mattersNow !== null);

  const durable = rows.filter(row => row.mattersNow >= row.matteredAtTime);
  const faded = rows.filter(row => row.mattersNow < row.matteredAtTime * 0.5);
  // The most interesting group: it did not feel like much and it lasted.
  const grew = rows.filter(row => row.mattersNow > row.matteredAtTime);

  return {
    ok: true,
    status: 'MEANING_SURFACED',
    durable: durable.map(row => row.experience),
    faded: faded.map(row => row.experience),
    grewInMeaning: grew.map(row => row.experience),
    boundary: 'SURFACED FROM HIS OWN EVIDENCE. THE SYSTEM HAS NO VIEW ON WHAT SHOULD HAVE MATTERED.',
    businessEffectAuthority: 'NONE'
  };
}
