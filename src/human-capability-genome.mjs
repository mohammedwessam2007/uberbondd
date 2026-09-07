// Human capability as a dependency graph, and what growing it costs elsewhere.
//
// The canon warning this is built against is specific: never silently convert a
// temporary state or a skill gap into a fixed trait. "Bad at X" and
// "inexperienced at X under these conditions" produce identical behaviour today
// and opposite futures, and a system that records the first has decided
// something about a person that the evidence did not support.
//
// So a capability here carries how it was assessed, and an assessment from a
// single observation cannot become a trait however low the score. The other
// half is the cost nobody counts: delegating a capability saves time now and
// atrophies it over years, which is a real trade and not a free one.
export const HUMAN_CAPABILITY_GENOME_VERSION = 'uberbond.human-capability-genome.v1';

/** How a capability level was arrived at. Ordered weakest first. */
export const ASSESSMENT_BASIS = Object.freeze([
  'SINGLE_OBSERVATION', 'SELF_REPORT', 'REPEATED_OBSERVATION',
  'VARIED_CONDITIONS', 'LONGITUDINAL'
]);

/** What a low score may mean. Only the last is a claim about the person. */
export const LOW_SCORE_EXPLANATIONS = Object.freeze([
  'INSUFFICIENT_EXPOSURE', 'ENVIRONMENT_EFFECT', 'TEMPORARY_STATE',
  'SKILL_GAP', 'DURABLE_LIMIT'
]);

/** What is happening to a capability over time. */
export const CAPABILITY_TRAJECTORY = Object.freeze([
  'STRENGTHENING', 'MAINTAINED', 'DELEGATED', 'ATROPHYING', 'ABANDONED_ON_PURPOSE'
]);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/** Whether an assessment is strong enough to support a claim about the person. */
export const supportsDurableClaim = basis =>
  ASSESSMENT_BASIS.indexOf(basis) >= ASSESSMENT_BASIS.indexOf('VARIED_CONDITIONS');

/**
 * One capability atom.
 *
 * A DURABLE_LIMIT explanation is refused unless the assessment actually
 * supports it. This is the load-bearing refusal: it is the exact moment where
 * a system decides someone cannot do something, and the cost of being wrong is
 * borne by the person for years.
 */
export function capabilityAtom(input = {}) {
  const name = text(input?.name, 240);
  if (!name) return fail('CAPABILITY_INVALID', ['capability-name-required']);

  const basis = ASSESSMENT_BASIS.includes(input?.basis) ? input.basis : null;
  if (!basis) return fail('CAPABILITY_INVALID', ['assessment-basis-required'], {
    note: 'A level with no stated basis cannot be told apart from a guess.'
  });

  const level = Number(input?.level);
  if (!Number.isFinite(level) || level < 0 || level > 1) return fail('CAPABILITY_INVALID', ['level-must-be-zero-to-one']);

  const explanation = LOW_SCORE_EXPLANATIONS.includes(input?.explanation) ? input.explanation : null;
  if (explanation === 'DURABLE_LIMIT' && !supportsDurableClaim(basis)) {
    return fail('CAPABILITY_CLAIM_REFUSED', ['durable-limit-requires-varied-or-longitudinal-evidence'], {
      capability: name, basis,
      note: 'Inexperience under one set of conditions is not a limit. Recording it as one decides something about a person the evidence does not support.'
    });
  }

  return {
    ok: true,
    status: 'CAPABILITY_RECORDED',
    capability: {
      name,
      level,
      basis,
      explanation,
      // Absent an explanation strong enough to be a claim, the honest reading
      // of a low level is that it is provisional.
      provisional: !supportsDurableClaim(basis),
      dependsOn: [...new Set((Array.isArray(input?.dependsOn) ? input.dependsOn : []).map(d => text(d, 240)).filter(Boolean))].sort(),
      unlocks: [...new Set((Array.isArray(input?.unlocks) ? input.unlocks : []).map(d => text(d, 240)).filter(Boolean))].sort(),
      trajectory: CAPABILITY_TRAJECTORY.includes(input?.trajectory) ? input.trajectory : null
    },
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The binding constraint, and what improving it would unlock.
 *
 * Returns the bottleneck rather than a ranked list of everything, because a
 * ranked list is how effort gets spread across dimensions that were not the
 * constraint -- which feels productive and moves nothing.
 */
export function findBottleneck({ goal = null, capabilities = [], required = [] } = {}) {
  const target = text(goal, 500);
  if (!target) return fail('BOTTLENECK_INVALID', ['goal-required']);

  const have = new Map();
  for (const row of (Array.isArray(capabilities) ? capabilities : [])) {
    if (row?.name) have.set(row.name, row);
  }
  const needed = (Array.isArray(required) ? required : []).map(r => text(r, 240)).filter(Boolean);
  if (needed.length === 0) return fail('BOTTLENECK_INVALID', ['required-capabilities-required']);

  const missing = needed.filter(name => !have.has(name));
  const weakest = needed
    .filter(name => have.has(name))
    .map(name => have.get(name))
    .sort((a, b) => a.level - b.level)[0] || null;

  // Something absent binds harder than something merely weak: no amount of
  // improving what exists reaches a capability nobody has.
  const bottleneck = missing.length ? { capability: missing[0], reason: 'ABSENT' }
    : weakest ? { capability: weakest.name, reason: 'WEAKEST_PRESENT', level: weakest.level }
      : null;

  return {
    ok: true,
    status: bottleneck ? 'BOTTLENECK_IDENTIFIED' : 'NO_BINDING_CONSTRAINT_FOUND',
    goal: target,
    bottleneck,
    missing,
    unlocks: bottleneck ? (have.get(bottleneck.capability)?.unlocks || []) : [],
    law: 'EFFORT_ON_A_NON_BINDING_DIMENSION_FEELS_PRODUCTIVE_AND_MOVES_NOTHING',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The cost of delegation that no ledger records.
 *
 * Automation buys time and spends capability. Reported as a trade rather than a
 * warning, because sometimes it is the right trade -- but never as nothing,
 * which is how it is usually recorded.
 */
export function agencyDebt(capabilities = []) {
  const rows = (Array.isArray(capabilities) ? capabilities : []).filter(row => row?.name);
  const atrophying = rows.filter(row => row.trajectory === 'ATROPHYING');
  const delegated = rows.filter(row => row.trajectory === 'DELEGATED');
  const deliberate = rows.filter(row => row.trajectory === 'ABANDONED_ON_PURPOSE');

  return {
    ok: true,
    status: 'AGENCY_DEBT_ASSESSED',
    // Delegation and atrophy are separated: delegating something you still
    // practise is not the same as losing it, and merging them would either
    // cry wolf or hide the real losses.
    delegated: delegated.map(row => row.name),
    atrophying: atrophying.map(row => row.name),
    deliberatelyAbandoned: deliberate.map(row => row.name),
    debt: atrophying.length,
    trade: 'DELEGATION BUYS TIME AND SPENDS CAPABILITY. A DELIBERATE ABANDONMENT IS A CHOICE; AN UNNOTICED ATROPHY IS A COST NOBODY PRICED.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The minimum capability skeleton a future needs -- Osteogenesis.
 *
 * Grows toward reachability rather than optimizing one path, and never proposes
 * changing the person: it returns what is missing, and the founder decides
 * whether that future is worth the growing.
 */
export function growSkeleton({ future = null, required = [], capabilities = [] } = {}) {
  const target = text(future, 500);
  if (!target) return fail('SKELETON_INVALID', ['future-required']);

  const have = new Map((Array.isArray(capabilities) ? capabilities : []).filter(row => row?.name).map(row => [row.name, row]));
  const needed = (Array.isArray(required) ? required : []).map(r => text(r, 240)).filter(Boolean);

  const gaps = needed
    .filter(name => !have.has(name) || have.get(name).level < 0.5)
    .map(name => ({
      capability: name,
      present: have.has(name),
      level: have.get(name)?.level ?? null,
      // Carried through so a gap never hardens into a verdict on the way here.
      provisional: have.get(name)?.provisional ?? true
    }));

  return {
    ok: true,
    status: gaps.length ? 'SKELETON_HAS_GAPS' : 'SKELETON_COMPLETE',
    future: target,
    gaps,
    reachableWithout: gaps.length === 0,
    boundary: 'THIS NAMES WHAT IS MISSING FOR A FUTURE. IT DOES NOT PROPOSE REWRITING A PERSON, AND WHETHER THE FUTURE IS WORTH GROWING TOWARD IS NOT ITS CALL.',
    businessEffectAuthority: 'NONE'
  };
}
