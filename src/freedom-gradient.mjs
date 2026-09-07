// Effective freedom, which is not the number of options.
//
// A thousand options nobody can perceive, afford, reverse or endorse is not a
// thousand freedoms. It is a catalogue. The canon puts it plainly: one deeply
// understood and reachable option can represent more effective freedom than a
// thousand nominal choices -- and the reason to build this as a funnel rather
// than a score is that the interesting fact is always *where* options are lost,
// not how many survived.
//
// Seven gates, and an option is free only through all of them:
//
//   perceived      you know it exists
//   understood     you know what it would mean
//   reachable      a path exists from here
//   resourced      the path is affordable in money, time, health, standing
//   reversible     or knowingly not, which is different from unknowingly not
//   uncoerced      nobody is making you
//   self-endorsed  you, now, actually want it
//
// Coercion is checked as a disqualifier rather than a weight. A coerced choice
// that is perceived, understood, reachable, resourced and reversible is still
// not freedom, and averaging it against the other six would let five good
// properties outvote the one that decides the question.
//
// The Agency Geometry half is the same measurement over time: the shape of the
// funnel changing is the signal, and a funnel that narrows at the resource gate
// is a different life problem from one that narrows at perception.
export const FREEDOM_GRADIENT_VERSION = 'uberbond.freedom-gradient.v1';

/** The gates, in the order an option meets them. */
export const FREEDOM_GATES = Object.freeze([
  'PERCEIVED', 'UNDERSTOOD', 'REACHABLE', 'RESOURCED', 'REVERSIBLE', 'UNCOERCED', 'SELF_ENDORSED'
]);

/** Gates whose failure disqualifies outright rather than counting against a total. */
export const DISQUALIFYING_GATES = Object.freeze(['UNCOERCED', 'SELF_ENDORSED']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Runs one option through the gates.
 *
 * Every gate must be answered. An unanswered gate is not a pass -- treating
 * silence as consent is exactly how a coerced or unendorsed option would slip
 * through, and it is also how the count inflates: unanswered gates are the
 * cheapest way to manufacture freedom.
 */
export function gateOption(input = {}) {
  const name = text(input?.name, 240);
  if (!name) return fail('OPTION_INVALID', ['option-name-required']);

  const gates = input?.gates && typeof input.gates === 'object' ? input.gates : {};
  const unanswered = FREEDOM_GATES.filter(gate => typeof gates[gate] !== 'boolean');
  if (unanswered.length > 0) {
    return fail('OPTION_INVALID', ['every-gate-must-be-answered'], {
      option: name,
      unanswered,
      note: 'An unanswered gate is not a pass. Silence is the cheapest way to manufacture freedom.'
    });
  }

  const failed = FREEDOM_GATES.filter(gate => gates[gate] === false);
  const disqualified = failed.filter(gate => DISQUALIFYING_GATES.includes(gate));

  return {
    ok: true,
    status: failed.length === 0 ? 'OPTION_EFFECTIVELY_FREE' : 'OPTION_CONSTRAINED',
    option: {
      name,
      gates: Object.fromEntries(FREEDOM_GATES.map(gate => [gate, gates[gate] === true])),
      effectivelyFree: failed.length === 0,
      failedAt: failed,
      disqualified
    },
    // Named so nobody reads a five-of-seven option as mostly free.
    disqualifierLaw: 'COERCION_AND_NON_ENDORSEMENT_DISQUALIFY__FIVE_PASSING_GATES_DO_NOT_OUTVOTE_THEM',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The gradient across a set of options: where freedom is actually lost.
 *
 * The nominal count and the effective count are returned together, because
 * separated they are two numbers and together they are the finding.
 */
export function freedomGradient(options = []) {
  const rows = (Array.isArray(options) ? options : []).filter(row => row?.name && row?.gates);

  const lostAt = Object.fromEntries(FREEDOM_GATES.map(gate => [gate, 0]));
  const free = [];
  for (const row of rows) {
    if (row.effectivelyFree) { free.push(row.name); continue; }
    // Attributed to the first gate that failed. An option lost at perception
    // was never really tested against the later gates.
    const first = FREEDOM_GATES.find(gate => row.gates[gate] === false);
    if (first) lostAt[first] += 1;
  }

  const narrowest = Object.entries(lostAt)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || FREEDOM_GATES.indexOf(a[0]) - FREEDOM_GATES.indexOf(b[0]))[0] || null;

  return {
    ok: true,
    status: 'FREEDOM_GRADIENT_COMPILED',
    nominalOptions: rows.length,
    effectivelyFree: free.length,
    effectivelyFreeOptions: free.sort(),
    lostAt,
    narrowestGate: narrowest ? { gate: narrowest[0], optionsLost: narrowest[1] } : null,
    // The two numbers are returned as a pair on purpose.
    law: 'ONE_UNDERSTOOD_REACHABLE_ENDORSED_OPTION_IS_MORE_EFFECTIVE_FREEDOM_THAN_A_THOUSAND_NOMINAL_ONES',
    reading: 'THE_FINDING_IS_WHICH_GATE_NARROWS__NOT_HOW_MANY_SURVIVED',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Agency geometry: the same funnel measured twice, and what moved.
 *
 * A rising nominal count with a falling effective count is the shape worth
 * catching -- more things becoming available while fewer become genuinely
 * possible -- and it is invisible to anything that tracks only one of them.
 */
export function agencyGeometry({ before = null, after = null } = {}) {
  if (!before?.ok || !after?.ok) {
    return fail('AGENCY_GEOMETRY_INVALID', ['two-compiled-gradients-required']);
  }

  const nominalDelta = after.nominalOptions - before.nominalOptions;
  const effectiveDelta = after.effectivelyFree - before.effectivelyFree;
  const byGate = Object.fromEntries(FREEDOM_GATES.map(gate => [gate, (after.lostAt[gate] || 0) - (before.lostAt[gate] || 0)]));

  const divergent = nominalDelta > 0 && effectiveDelta < 0;

  return {
    ok: true,
    status: divergent ? 'AGENCY_DIVERGENCE' : 'AGENCY_GEOMETRY_COMPILED',
    nominalDelta,
    effectiveDelta,
    lostAtDelta: byGate,
    divergent,
    reading: divergent
      ? 'MORE_OPTIONS_APPEARED_WHILE_FEWER_BECAME_GENUINELY_POSSIBLE'
      : effectiveDelta > 0 ? 'EFFECTIVE_FREEDOM_ROSE'
        : effectiveDelta < 0 ? 'EFFECTIVE_FREEDOM_FELL'
          : 'EFFECTIVE_FREEDOM_UNCHANGED',
    law: 'A_RISING_OPTION_COUNT_IS_NOT_EVIDENCE_OF_RISING_FREEDOM',
    businessEffectAuthority: 'NONE'
  };
}
