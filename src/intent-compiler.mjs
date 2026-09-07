// From a choice to something that happened in the world, and back.
//
// Decisions die in chat windows. That is the ordinary failure, and it is not
// solved by adding an executor -- it is solved by making the path from will to
// consequence traceable in both directions, so that what actually happened can
// be compared to what was intended.
//
//   WILL -> INTENT -> CONSTRAINTS -> PLAN -> CAPABILITIES -> RESOURCES
//        -> PERMISSIONS -> ACTIONS -> OBSERVABLE EFFECTS -> RECONCILIATION
//
// Two things are refused along that path. An intent cannot compile past
// PERMISSIONS without authority -- capability is not permission, and the whole
// pipeline exists downstream of that boundary. And an action's consequences are
// recorded as predicted-versus-observed, because a ledger holding only what was
// intended is a record of hopes.
export const INTENT_COMPILER_VERSION = 'uberbond.intent-compiler.v1';

/** The compilation stages, in order. */
export const COMPILE_STAGES = Object.freeze([
  'WILL', 'INTENT', 'CONSTRAINTS', 'PLAN', 'CAPABILITIES',
  'RESOURCES', 'PERMISSIONS', 'ACTIONS', 'EFFECTS', 'RECONCILIATION'
]);

/** How reversible a state is. The last two are absorbing. */
export const REVERSIBILITY = Object.freeze([
  'REVERSIBLE', 'COSTLY_TO_REVERSE', 'PATH_DEPENDENT',
  'PRACTICALLY_IRREVERSIBLE', 'PHYSICALLY_IRREVERSIBLE'
]);

/** Who a consequence lands on. */
export const AFFECTED_PARTIES = Object.freeze([
  'FOUNDER', 'OTHER_PEOPLE', 'RELATIONSHIPS', 'INSTITUTIONS',
  'ENVIRONMENT', 'FUTURE_PERSONS'
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
 * Compiles an intent as far as its inputs allow, and stops where they run out.
 *
 * Stopping is the useful output. "This needs a permission you do not have" is
 * actionable; a plan that silently assumed the permission is not.
 */
export function compileIntent({ will = null, constraints = [], plan = null, capabilities = [], resources = [], authority = null } = {}) {
  const wanted = text(will, 2000);
  if (!wanted) return fail('COMPILE_INVALID', ['will-required']);

  const reached = ['WILL', 'INTENT'];
  const blockers = [];

  reached.push('CONSTRAINTS');
  if (!text(plan, 4000)) {
    blockers.push('no-plan');
  } else {
    reached.push('PLAN');
    if ((Array.isArray(capabilities) ? capabilities : []).filter(Boolean).length === 0) blockers.push('no-capabilities-named');
    else reached.push('CAPABILITIES');
    if (reached.includes('CAPABILITIES')) {
      if ((Array.isArray(resources) ? resources : []).filter(Boolean).length === 0) blockers.push('no-resources-named');
      else reached.push('RESOURCES');
    }
  }

  // The boundary the whole pipeline sits downstream of. Being able to do a
  // thing has never been permission to do it, and this is where a system that
  // conflates them would act.
  const permitted = authority?.ok === true;
  if (reached.includes('RESOURCES')) {
    if (!permitted) blockers.push('no-authority');
    else reached.push('PERMISSIONS');
  }

  return {
    ok: true,
    status: reached.includes('PERMISSIONS') ? 'READY_FOR_ACTION' : 'COMPILATION_STOPPED',
    will: wanted,
    stagesReached: reached,
    stoppedAt: COMPILE_STAGES[reached.length] ?? null,
    blockers,
    constraints: (Array.isArray(constraints) ? constraints : []).map(c => text(c, 500)).filter(Boolean),
    // Never inferred from a successful compile. A plan that is ready to run is
    // still not a plan that has been authorized to.
    businessEffectAuthority: 'NONE',
    boundary: 'REACHING PERMISSIONS MEANS AN AUTHORITY WAS PRESENTED, NOT THAT THIS MODULE MAY ACT. EXECUTION IS SOMEONE ELSES CALL.'
  };
}

/**
 * Predicted consequences against observed ones.
 *
 * The unpredicted column is the one that teaches. A ledger recording only what
 * was intended is a record of hopes, and the second-order effects nobody
 * forecast are exactly where a life model is wrong.
 */
export function consequenceLedger({ action = null, predicted = [], observed = [] } = {}) {
  const what = text(action, 1000);
  if (!what) return fail('CONSEQUENCE_LEDGER_INVALID', ['action-required']);

  const forecast = (Array.isArray(predicted) ? predicted : []).map(item => text(item, 500)).filter(Boolean);
  const actual = (Array.isArray(observed) ? observed : []).map(item => text(item, 500)).filter(Boolean);

  const unpredicted = actual.filter(item => !forecast.includes(item));
  const didNotHappen = forecast.filter(item => !actual.includes(item));

  return {
    ok: true,
    status: 'CONSEQUENCES_RECONCILED',
    action: what,
    predictedAndObserved: forecast.filter(item => actual.includes(item)),
    unpredicted,
    predictedButAbsent: didNotHappen,
    // Reported rather than scored: a high hit rate on the consequences you
    // thought to list says nothing about the ones you did not.
    learning: unpredicted.length
      ? 'The unpredicted column is where the model was wrong. It is the part worth reading.'
      : 'Nothing unpredicted was recorded, which may mean the model held or that nobody looked.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Who else a decision lands on.
 *
 * Makes consequences visible without imposing a moral doctrine: the module
 * names who is affected and how reversibly, and stops there. Deciding what is
 * owed to them is not a computation.
 */
export function externalityMap({ decision = null, effects = [] } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('EXTERNALITY_MAP_INVALID', ['decision-required']);

  const rows = (Array.isArray(effects) ? effects : [])
    .map(row => ({
      party: AFFECTED_PARTIES.includes(row?.party) ? row.party : null,
      effect: text(row?.effect, 500),
      reversibility: REVERSIBILITY.includes(row?.reversibility) ? row.reversibility : null,
      consented: row?.consented === true
    }))
    .filter(row => row.party && row.effect);

  const onOthers = rows.filter(row => row.party !== 'FOUNDER');
  const withoutConsent = onOthers.filter(row => !row.consented);
  const irreversibleOnOthers = onOthers.filter(row =>
    row.reversibility === 'PRACTICALLY_IRREVERSIBLE' || row.reversibility === 'PHYSICALLY_IRREVERSIBLE');

  return {
    ok: true,
    status: 'EXTERNALITIES_MAPPED',
    decision: what,
    effects: rows,
    onOthers: onOthers.length,
    withoutRecordedConsent: withoutConsent.map(row => ({ party: row.party, effect: row.effect })),
    irreversibleOnOthers: irreversibleOnOthers.map(row => ({ party: row.party, effect: row.effect })),
    boundary: 'THIS NAMES WHO IS AFFECTED AND HOW REVERSIBLY. WHAT IS OWED TO THEM IS NOT A COMPUTATION.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Doing nothing, priced honestly.
 *
 * Waiting is an option with its own consequences, and the common error runs
 * both ways: treating delay as free, or treating it as always safe. A closing
 * window makes waiting the expensive choice.
 */
export function nonAction({ decision = null, windowClosesIn = null, informationGained = 0, optionDecay = 0 } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('NON_ACTION_INVALID', ['decision-required']);

  const gain = Number(informationGained) || 0;
  const decay = Number(optionDecay) || 0;
  const closing = text(windowClosesIn, 120);

  return {
    ok: true,
    status: gain > decay ? 'WAITING_BUYS_MORE_THAN_IT_COSTS' : 'WAITING_COSTS_MORE_THAN_IT_BUYS',
    decision: what,
    informationGained: gain,
    optionDecay: decay,
    windowClosesIn: closing,
    // Named as an option rather than an absence, because an unnamed default is
    // the one nobody examines.
    note: closing
      ? `Waiting is a choice with a deadline: the window closes in ${closing}.`
      : 'Waiting is a choice. It is priced here rather than treated as the absence of one.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * How much of the future a commitment spends.
 *
 * Distinguishes a commitment somebody made from one that accumulated. Both
 * close options; only the first was chosen, and a system that cannot tell them
 * apart will let a life narrow without anyone noticing.
 */
export function intertemporalLockIn({ commitment = null, reversibility = null, switchingCost = null, chosenDeliberately = false, futuresClosed = [] } = {}) {
  const what = text(commitment, 1000);
  if (!what) return fail('LOCK_IN_INVALID', ['commitment-required']);
  if (!REVERSIBILITY.includes(reversibility)) return fail('LOCK_IN_INVALID', ['valid-reversibility-required']);

  const closed = (Array.isArray(futuresClosed) ? futuresClosed : []).map(item => text(item, 240)).filter(Boolean);
  const absorbing = reversibility === 'PRACTICALLY_IRREVERSIBLE' || reversibility === 'PHYSICALLY_IRREVERSIBLE';

  return {
    ok: true,
    status: absorbing && !chosenDeliberately ? 'ACCIDENTAL_SELF_CAPTURE' : 'LOCK_IN_RECORDED',
    commitment: what,
    reversibility,
    switchingCost: text(switchingCost, 500) || null,
    futuresClosed: closed,
    chosenDeliberately,
    // The distinction the whole function exists for.
    distinction: chosenDeliberately
      ? 'A chosen commitment. Closing futures is what commitment does.'
      : 'Not recorded as deliberately chosen. An accumulated constraint closes futures without anyone having decided to.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether a decision protects the freedom to become someone unforeseen.
 *
 * Not optionality maximization. The question is narrower and harder: does this
 * foreclose becoming a person the present self cannot currently imagine? An
 * option nobody has thought of cannot be counted, so this asks rather than
 * scores.
 */
export function freedomToBecome({ decision = null, closesIdentityPaths = [], preservesCapacityToChange = null } = {}) {
  const what = text(decision, 1000);
  if (!what) return fail('BECOMING_INVALID', ['decision-required']);

  const closed = (Array.isArray(closesIdentityPaths) ? closesIdentityPaths : []).map(item => text(item, 240)).filter(Boolean);
  return {
    ok: true,
    status: preservesCapacityToChange === false ? 'FORECLOSES_BECOMING' : 'BECOMING_PRESERVED_OR_UNKNOWN',
    decision: what,
    closesIdentityPaths: closed,
    preservesCapacityToChange,
    question: 'Does this foreclose becoming someone the present self cannot yet imagine?',
    boundary: 'AN_IDENTITY_NOBODY_HAS_IMAGINED_CANNOT_BE_COUNTED, SO THIS ASKS RATHER THAN SCORES.',
    businessEffectAuthority: 'NONE'
  };
}
