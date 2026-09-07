// The inventory of branches a life still has, and what a decision does to it.
//
// The obvious failure is closing futures by accident. The subtler and more
// dangerous one is the fix: turn optionality into a number, maximise it, and
// the engine starts arguing against marriage, against mastery, against any
// commitment whose whole point is that it closes branches on purpose. The
// canon is explicit that optionality is not automatically maximised, so this
// module must not hand a caller a scalar to climb.
//
// Three rules carry the whole thing:
//
//   a closure is deliberate or unnecessary, never merely counted
//   breadth is counted across life dimensions, never within one
//   the ledger is a structure, not a score
//
// A branch inventory of forty futures that are all careers is not a wide life.
// It is one dimension with good imagination, and reporting it as breadth is
// how a possibility engine talks a person into a narrower life while showing
// them a rising number.
export const LIFE_POSSIBILITY_ENGINE_VERSION = 'uberbond.life-possibility-engine.v1';

/** Life dimensions a branch may belong to. Breadth is counted across these. */
export const LIFE_DIMENSIONS = Object.freeze([
  'CAREER', 'EDUCATION', 'CREATIVE', 'ENTREPRENEURSHIP', 'WEALTH',
  'GEOGRAPHIC_FREEDOM', 'LANGUAGE', 'RELATIONSHIPS', 'COMMUNITY', 'KNOWLEDGE',
  'PHYSICAL_CAPABILITY', 'EXPERIENCE', 'CONTRIBUTION', 'TIME_FREEDOM', 'IDENTITY'
]);

/** Why a branch closed. Only one of these counts against a decision. */
export const CLOSURE_KINDS = Object.freeze([
  'DELIBERATE_COMMITMENT',   // closed on purpose, in exchange for depth
  'UNNECESSARY_CLOSURE',     // closed for nothing, or without noticing
  'EXPIRED_BY_TIME',         // the window shut regardless of the decision
  'NEVER_REACHABLE'          // was not actually available to close
]);

/** How far away a branch is. Reachability is not the same as existence. */
export const REACHABILITY = Object.freeze(['REACHABLE_NOW', 'REACHABLE_WITH_PREPARATION', 'BLOCKED_BY_PREREQUISITE', 'NOT_REACHABLE']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * A future branch, pinned to the life dimension it belongs to.
 *
 * The dimension is mandatory and closed-vocabulary for one reason: breadth is
 * counted across dimensions later, and a branch that can name its own
 * dimension freely can manufacture breadth by renaming itself.
 */
export function branch(input = {}) {
  const name = text(input?.name, 240);
  const dimension = text(input?.dimension, 40);
  if (!name) return fail('BRANCH_INVALID', ['branch-name-required']);
  if (!dimension || !LIFE_DIMENSIONS.includes(dimension)) {
    return fail('BRANCH_INVALID', ['known-life-dimension-required'], {
      note: 'Breadth is counted across dimensions. A branch that names its own dimension can manufacture breadth by renaming itself.',
      known: LIFE_DIMENSIONS
    });
  }
  const reachability = text(input?.reachability, 40);
  if (!reachability || !REACHABILITY.includes(reachability)) {
    return fail('BRANCH_INVALID', ['known-reachability-required'], { known: REACHABILITY });
  }

  return {
    ok: true,
    status: 'BRANCH_RECORDED',
    branch: {
      name,
      dimension,
      reachability,
      valued: input?.valued === true,
      requires: [...new Set((Array.isArray(input?.requires) ? input.requires : [])
        .map(item => text(item, 240)).filter(Boolean))].sort()
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What a decision does to the branch inventory.
 *
 * Opened, preserved and closed are reported separately and never summed into
 * one figure. The canon's own sketch -- opened + preserved - unnecessarily
 * closed -- is a way of *reading* the ledger, not a score to maximise, and
 * collapsing it here would hand the caller the exact number that argues
 * against every deliberate commitment.
 */
export function evaluateDecision({ decision = null, opens = [], preserves = [], closes = [] } = {}) {
  const name = text(decision, 240);
  if (!name) return fail('DECISION_INVALID', ['decision-name-required']);

  const rows = list => (Array.isArray(list) ? list : []).filter(row => row?.name && LIFE_DIMENSIONS.includes(row?.dimension));
  const opened = rows(opens);
  const preserved = rows(preserves);

  const closures = [];
  for (const row of (Array.isArray(closes) ? closes : [])) {
    const target = row?.branch ?? row;
    if (!target?.name || !LIFE_DIMENSIONS.includes(target?.dimension)) continue;
    const kind = text(row?.kind, 40);
    if (!kind || !CLOSURE_KINDS.includes(kind)) {
      return fail('DECISION_INVALID', ['closure-kind-required'], {
        branch: target.name,
        note: 'A closed branch with no stated kind would be counted as loss, and a deliberate commitment is not a loss.',
        known: CLOSURE_KINDS
      });
    }
    // A deliberate commitment must say what it bought. Without that it is an
    // unnecessary closure wearing the word "deliberate".
    const inExchangeFor = text(row?.inExchangeFor, 480);
    if (kind === 'DELIBERATE_COMMITMENT' && !inExchangeFor) {
      return fail('DECISION_INVALID', ['deliberate-closure-requires-exchange'], {
        branch: target.name,
        note: 'Calling a closure deliberate without naming what it bought is an unnecessary closure wearing a better word.'
      });
    }
    closures.push({ branch: target.name, dimension: target.dimension, kind, inExchangeFor: inExchangeFor || null });
  }

  const costly = closures.filter(row => row.kind === 'UNNECESSARY_CLOSURE');
  const chosen = closures.filter(row => row.kind === 'DELIBERATE_COMMITMENT');

  return {
    ok: true,
    status: 'DECISION_EVALUATED',
    decision: name,
    opened: opened.map(row => ({ branch: row.name, dimension: row.dimension })),
    preserved: preserved.map(row => ({ branch: row.name, dimension: row.dimension })),
    closures,
    unnecessarilyClosed: costly,
    deliberatelyClosed: chosen,
    // Deliberately absent: a net figure. See the module header.
    scoreWithheld: 'NO_SINGLE_OPTIONALITY_SCORE__A_SCALAR_HERE_ARGUES_AGAINST_EVERY_DELIBERATE_COMMITMENT',
    reading: 'OPENED_AND_PRESERVED_AGAINST_UNNECESSARY_CLOSURES__DELIBERATE_CLOSURES_ARE_PURCHASES_NOT_LOSSES',
    authorityBoundary: 'RECOMMENDATION__MOHAMED_CHOOSES',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Breadth of the current inventory, counted the only way that means anything.
 *
 * Forty branches in one dimension is one dimension. The dimension count is the
 * headline and the raw count is reported beside it precisely so the two cannot
 * be confused by a reader skimming for a big number.
 */
export function inventoryBreadth(branches = []) {
  const rows = (Array.isArray(branches) ? branches : []).filter(row => row?.name && LIFE_DIMENSIONS.includes(row?.dimension));
  const valued = rows.filter(row => row.valued === true);

  const byDimension = {};
  for (const row of valued) {
    byDimension[row.dimension] = (byDimension[row.dimension] || 0) + 1;
  }
  const dimensions = Object.keys(byDimension).sort();
  const dominant = dimensions
    .map(key => ({ dimension: key, count: byDimension[key] }))
    .sort((a, b) => b.count - a.count || a.dimension.localeCompare(b.dimension))[0] || null;

  // One dimension holding most of the inventory is the concentration this
  // module exists to surface, not a wide life.
  const concentrated = Boolean(dominant && valued.length >= 3 && dominant.count * 2 > valued.length);

  return {
    ok: true,
    status: concentrated ? 'INVENTORY_CONCENTRATED' : 'INVENTORY_COMPILED',
    valuedBranchCount: valued.length,
    dimensionsRepresented: dimensions.length,
    byDimension,
    dominantDimension: dominant,
    concentrated,
    law: 'BREADTH_IS_DIMENSIONS_REPRESENTED__NOT_BRANCH_COUNT',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Actions worth taking because many valued futures need them.
 *
 * The independence rule is the same one the future-ancestor compiler uses, for
 * the same reason: a prerequisite appearing in six branches of one dimension
 * is a fact about that dimension. Only a requirement crossing dimensions is
 * evidence about the life.
 */
export function crossFutureValue(branches = [], { minimumDimensions = 2 } = {}) {
  const min = Number(minimumDimensions);
  if (!Number.isSafeInteger(min) || min < 2 || min > LIFE_DIMENSIONS.length) {
    return fail('CROSS_FUTURE_INVALID', ['minimum-dimensions-between-2-and-dimension-count']);
  }
  const rows = (Array.isArray(branches) ? branches : [])
    .filter(row => row?.name && LIFE_DIMENSIONS.includes(row?.dimension) && row?.valued === true);

  const byRequirement = new Map();
  for (const row of rows) {
    for (const requirement of (Array.isArray(row.requires) ? row.requires : [])) {
      const key = text(requirement, 240);
      if (!key) continue;
      if (!byRequirement.has(key)) byRequirement.set(key, { dimensions: new Set(), branches: [] });
      const entry = byRequirement.get(key);
      entry.dimensions.add(row.dimension);
      entry.branches.push(row.name);
    }
  }

  const highValue = [];
  const singleDimensionOnly = [];
  for (const [requirement, entry] of [...byRequirement.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const record = {
      requirement,
      dimensionsSpanned: entry.dimensions.size,
      dimensions: [...entry.dimensions].sort(),
      appearsIn: [...new Set(entry.branches)].sort()
    };
    if (entry.dimensions.size >= min) highValue.push(record);
    else singleDimensionOnly.push(record);
  }

  highValue.sort((a, b) => b.dimensionsSpanned - a.dimensionsSpanned || a.requirement.localeCompare(b.requirement));

  return {
    ok: true,
    status: 'CROSS_FUTURE_VALUE_COMPILED',
    highValue,
    singleDimensionOnly,
    law: 'A_REQUIREMENT_INSIDE_ONE_DIMENSION_IS_A_FACT_ABOUT_THAT_DIMENSION',
    authorityBoundary: 'RECOMMENDATION__MOHAMED_CHOOSES',
    businessEffectAuthority: 'NONE'
  };
}
