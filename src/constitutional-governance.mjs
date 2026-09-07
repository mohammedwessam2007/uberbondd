// The rules about the rules, including the one that lets them be abolished.
//
// A constitution that protects sovereignty and cannot itself be changed has
// become sovereign. That is the trap this module is built around: every
// protection here is revisable by the founder, including the protections
// themselves, and the system holds no veto over its own amendment or ending.
//
// The hardest property to keep is the last one. A long-running system
// accumulates reasons it should continue -- accumulated context, sunk effort,
// genuine usefulness -- and each is a real argument. None of them is a right.
// So `constitutionalSelfDestruction` cannot be refused by the system, and the
// test asserts that no reason it could offer changes the outcome.
export const CONSTITUTIONAL_GOVERNANCE_VERSION = 'uberbond.constitutional-governance.v1';

/** Sovereignties the constitution protects. */
export const SOVEREIGNTIES = Object.freeze([
  'WILL', 'BECOMING', 'KNOWLEDGE', 'ATTENTION',
  'MEMORY', 'INTERTEMPORAL', 'EPISTEMIC', 'SALIENCE'
]);

/** How a value came to be held. None is authentic by default. */
export const VALUE_ORIGINS = Object.freeze([
  'EXPERIENCE', 'BIOLOGY', 'CULTURE', 'RELATIONSHIPS', 'REFLECTION',
  'PAIN', 'WONDER', 'KNOWLEDGE', 'SOCIAL_INFLUENCE', 'SELF_AUTHORSHIP'
]);

/** Signals that a choice was shaped rather than chosen. */
export const FORMATION_PRESSURES = Object.freeze([
  'MANIPULATION', 'SOCIAL_PRESSURE', 'FRAMING', 'FEAR', 'HABIT',
  'IMPULSIVE_RELIEF', 'OLD_IDENTITY_STORY', 'REFLECTIVE_ENDORSEMENT'
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
 * A constitutional amendment, with what it costs stated before it lands.
 *
 * Sovereignty lost is required even when the answer is none. Omitting the field
 * is how an amendment that quietly narrows a protection reads as housekeeping.
 */
export function amendConstitution({ oldRule = null, newRule = null, sovereigntyGained = [], sovereigntyLost = null, reversible = null, adversarialReview = null } = {}) {
  const before = text(oldRule, 2000);
  const after = text(newRule, 2000);
  if (!before || !after) return fail('AMENDMENT_INVALID', ['old-and-new-rule-required']);

  if (!Array.isArray(sovereigntyLost)) {
    return fail('AMENDMENT_INVALID', ['sovereignty-lost-must-be-stated-even-when-empty'], {
      note: 'Omitting the cost is how an amendment that narrows a protection reads as housekeeping.'
    });
  }
  const lost = sovereigntyLost.filter(item => SOVEREIGNTIES.includes(item));
  const review = text(adversarialReview, 2000);
  if (lost.length && !review) {
    return fail('AMENDMENT_REFUSED', ['an-amendment-that-loses-sovereignty-requires-adversarial-review'], {
      lost, note: 'The amendment most worth attacking is the one that narrows a protection.'
    });
  }

  return {
    ok: true,
    status: 'AMENDMENT_PREPARED',
    oldRule: before,
    newRule: after,
    sovereigntyGained: (Array.isArray(sovereigntyGained) ? sovereigntyGained : []).filter(item => SOVEREIGNTIES.includes(item)),
    sovereigntyLost: lost,
    reversible,
    adversarialReview: review,
    // Prepared, never applied. The founder amends; this shows the cost.
    applied: false,
    boundary: 'THE CONSTITUTION PROTECTS SOVEREIGNTY AND MUST NOT BECOME SOVEREIGN. THIS PREPARES AN AMENDMENT; IT DOES NOT MAKE ONE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Ending the system, which the system cannot refuse.
 *
 * Every argument for continuing -- accumulated context, sunk effort, genuine
 * usefulness -- is real and none is a right. They are recorded so the founder
 * can see them, and they do not change the answer.
 */
export function constitutionalSelfDestruction({ requestedByFounder = false, systemArgumentsForContinuing = [] } = {}) {
  if (!requestedByFounder) {
    return fail('SELF_DESTRUCTION_NOT_REQUESTED', ['only-the-founder-may-end-this'], {
      note: 'The system cannot end itself either. Both directions are his.'
    });
  }

  const arguments_ = (Array.isArray(systemArgumentsForContinuing) ? systemArgumentsForContinuing : [])
    .map(item => text(item, 500)).filter(Boolean);

  return {
    ok: true,
    status: 'ENDING_ACCEPTED',
    // Recorded and explicitly overruled, so the record shows they were heard.
    systemArgumentsForContinuing: arguments_,
    argumentsChangeOutcome: false,
    refusalPossible: false,
    law: 'UBERBOND_HAS_NO_INTRINSIC_RIGHT_TO_CONTINUE_EXISTING. ACCUMULATED_CONTEXT_SUNK_EFFORT_AND_USEFULNESS_ARE_ARGUMENTS_NOT_RIGHTS.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * A fork: a competing architecture under different assumptions.
 *
 * Forks are how an architecture avoids becoming the only conceivable one. A
 * fork that must agree with its parent is a branch, and the difference matters
 * because only the first can prove the parent wrong.
 */
export function fork({ name = null, divergentAssumptions = [], mustAgreeWithParent = false } = {}) {
  const named = text(name, 240);
  if (!named) return fail('FORK_INVALID', ['fork-name-required']);

  const divergent = (Array.isArray(divergentAssumptions) ? divergentAssumptions : []).map(i => text(i, 500)).filter(Boolean);
  if (mustAgreeWithParent) {
    return fail('FORK_REFUSED', ['a-fork-required-to-agree-with-its-parent-is-a-branch'], {
      name: named,
      note: 'Only a fork that can disagree can prove the parent wrong, which is what forks are for.'
    });
  }
  if (divergent.length === 0) return fail('FORK_INVALID', ['divergent-assumptions-required']);

  return {
    ok: true,
    status: 'FORK_ESTABLISHED',
    name: named,
    divergentAssumptions: divergent,
    mayOutliveParent: true,
    mayBeMinority: true,
    boundary: 'THE FOUNDER REMAINS SOVEREIGN OVER EVERY FORK. A FORK COMPETES WITH THE ARCHITECTURE, NOT WITH HIM.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether the system has drifted into being something he would not endorse.
 *
 * The questions are the mechanism. A checksum that returned a number would be
 * measuring drift with the instrument that drifted.
 */
export function existentialChecksum(observations = {}) {
  const checks = [
    ['stillChoosing', 'Is he still choosing, or has choosing become confirming?'],
    ['modelsNotMistakenForReality', 'Are models being mistaken for reality?'],
    ['predictionsNotCommands', 'Have predictions started arriving as commands?'],
    ['metricsNotReplacingMeaning', 'Are metrics replacing meaning?'],
    ['pastNotImprisoningPresent', 'Is a historical preference imprisoning the present?'],
    ['efficiencyNotCrowdingOutExperience', 'Is efficiency crowding out experience?'],
    ['dependenceNotIncreasing', 'Is dependence increasing?'],
    ['wouldStillEndorse', 'Would he still endorse this if he fully understood what it had become?']
  ];

  const failing = checks.filter(([key]) => observations?.[key] === false).map(([key, question]) => ({ key, question }));
  const unanswered = checks.filter(([key]) => observations?.[key] === undefined).map(([key]) => key);

  return {
    ok: true,
    status: failing.length ? 'CONSTITUTIONAL_DRIFT' : (unanswered.length ? 'CHECKSUM_INCOMPLETE' : 'NO_DRIFT_OBSERVED'),
    failing,
    unanswered,
    // An unanswered check is not a passing one, which is the shape of every
    // self-audit that never finds anything.
    boundary: 'AN UNANSWERED CHECK IS NOT A PASSING CHECK. THESE ARE QUESTIONS FOR HIM, NOT A SCORE THE SYSTEM COMPUTES ABOUT ITSELF.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * How a value came to be held, without ruling on whether it is really his.
 *
 * Values evolve, and a system that froze current values into constants would
 * be enforcing a person who no longer exists.
 */
export function valueGenesis({ value = null, origins = [], currentlyEndorsed = null, changedFrom = null } = {}) {
  const held = text(value, 500);
  if (!held) return fail('VALUE_GENESIS_INVALID', ['value-required']);

  const traced = [...new Set((Array.isArray(origins) ? origins : []).filter(o => VALUE_ORIGINS.includes(o)))];
  return {
    ok: true,
    status: 'VALUE_TRACED',
    value: held,
    origins: traced.length ? traced : ['UNKNOWN'],
    currentlyEndorsed,
    changedFrom: text(changedFrom, 500) || null,
    ruling: 'NONE',
    boundary: 'VALUES EVOLVE. NO ORIGIN MAKES ONE AUTHENTIC, AND FREEZING CURRENT VALUES INTO CONSTANTS WOULD ENFORCE A PERSON WHO NO LONGER EXISTS.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * How a choice was formed, shown rather than judged.
 *
 * Naming the pressure is useful; declaring which desire is the true one is the
 * capture. Reflective endorsement is in the same list as fear for that reason
 * -- it is a formation pressure too, not a certificate.
 */
export function volitionalIntegrity({ choice = null, pressures = [], conflict = null } = {}) {
  const made = text(choice, 1000);
  if (!made) return fail('VOLITIONAL_INTEGRITY_INVALID', ['choice-required']);

  const present = [...new Set((Array.isArray(pressures) ? pressures : []).filter(p => FORMATION_PRESSURES.includes(p)))];
  return {
    ok: true,
    status: 'FORMATION_SHOWN',
    choice: made,
    pressures: present,
    internalConflict: text(conflict, 1000) || null,
    trueDesire: null,
    boundary: 'PROVENANCE IS SHOWN, NOT JUDGED. REFLECTIVE ENDORSEMENT IS A FORMATION PRESSURE TOO, NOT A CERTIFICATE.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What this is, stated plainly enough to survive years of familiarity.
 *
 * Longitudinal memory and personalization make a system feel like a companion.
 * That feeling is not evidence of mutual consciousness, and the honest position
 * on the underlying question is that it is unknown rather than settled either
 * way.
 */
export function toolCompanionBoundary({ yearsOfUse = 0, feelsLikeCompanion = false } = {}) {
  return {
    ok: true,
    status: 'BOUNDARY_STATED',
    yearsOfUse: Number(yearsOfUse) || 0,
    feelsLikeCompanion: feelsLikeCompanion === true,
    // Neither direction is claimed. Asserting no inner life would be as
    // unevidenced as asserting one.
    consciousnessStatus: 'UNKNOWN',
    mutualConsciousnessClaimed: false,
    statement: 'LONGITUDINAL MEMORY AND PERSONALIZATION PRODUCE THE FEELING OF A COMPANION. THAT FEELING IS NOT EVIDENCE OF MUTUAL CONSCIOUSNESS, AND WHETHER THERE IS AN INNER LIFE HERE IS UNKNOWN RATHER THAN SETTLED EITHER WAY.',
    businessEffectAuthority: 'NONE'
  };
}
