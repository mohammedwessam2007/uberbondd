// The loop that is supposed to make the chooser better, and how to tell whether
// it did.
//
// The canon's claim is specific and easy to misread: UberBond does not merely
// increase the number of choices available, it increases the resolution of the
// chooser. Those are different quantities and only one of them is easy to
// measure, which is exactly why the easy one gets measured.
//
// A system that hands someone forty options they do not understand any better
// than the four they had has amplified nothing. It has added noise and it will
// score well, because option count went up and option count is a number. So a
// cycle here only counts as amplification when understanding or capability
// actually moved; more options with a flat chooser is reported as noise.
//
// The second rule is about where the loop runs. Will, intelligence and
// understanding are all internal; capability and experience are not. A cycle
// that never touched reality is a simulation of a cycle, and letting it close
// would make the whole loop self-certifying -- the system reasoning its way to
// the conclusion that its reasoning improved someone.
export const FREE_WILL_AMPLIFICATION_VERSION = 'uberbond.free-will-amplification.v1';

/** The canonical loop, in order. A cycle must pass through all of it. */
export const LOOP_STAGES = Object.freeze([
  'WILL', 'INTELLIGENCE', 'UNDERSTANDING', 'CAPABILITY', 'EXPERIENCE', 'TRANSFORMATION'
]);

/** The stages that require contact with reality rather than with the model. */
export const REALITY_STAGES = Object.freeze(['CAPABILITY', 'EXPERIENCE']);

/** What actually moved. Only the first two are the chooser getting sharper. */
export const RESOLUTION_DIMENSIONS = Object.freeze(['UNDERSTANDING', 'CAPABILITY', 'OPTION_COUNT']);

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const delta = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

/**
 * Scores one turn of the loop.
 *
 * The three deltas are required, including the ones that might be zero. An
 * unreported understanding delta would default to something, and every default
 * available here is a claim: zero says the chooser did not improve, and
 * anything else says it did.
 */
export function scoreCycle({ subject = null, stagesCompleted = [], realityContact = null, deltas = {} } = {}) {
  const name = text(subject, 480);
  if (!name) return fail('CYCLE_INVALID', ['subject-required']);

  const completed = [...new Set((Array.isArray(stagesCompleted) ? stagesCompleted : [])
    .map(item => text(item, 40)).filter(item => item && LOOP_STAGES.includes(item)))];
  const missing = LOOP_STAGES.filter(stage => !completed.includes(stage));

  const measured = {};
  for (const dimension of RESOLUTION_DIMENSIONS) {
    const value = delta(deltas?.[dimension]);
    if (value === null) {
      return fail('CYCLE_INVALID', ['every-resolution-delta-required'], {
        subject: name,
        missing: dimension,
        note: 'An unreported delta defaults to a claim: zero says the chooser did not improve, anything else says it did.'
      });
    }
    measured[dimension] = value;
  }

  if (missing.length > 0) {
    return {
      ok: true,
      status: 'CYCLE_INCOMPLETE',
      subject: name,
      stagesCompleted: completed.sort(),
      missingStages: missing,
      deltas: measured,
      amplified: false,
      law: 'A_CYCLE_THAT_DID_NOT_CLOSE_IS_NOT_A_CYCLE',
      businessEffectAuthority: 'NONE'
    };
  }

  // The reality stages were claimed. Whether reality was actually touched is a
  // separate assertion, because claiming a stage is free.
  const contact = text(realityContact, 480);
  if (!contact) {
    return {
      ok: true,
      status: 'CYCLE_UNGROUNDED',
      subject: name,
      stagesCompleted: completed.sort(),
      deltas: measured,
      amplified: false,
      requiredStages: REALITY_STAGES,
      law: 'A_CYCLE_THAT_NEVER_TOUCHED_REALITY_IS_A_SIMULATION_OF_A_CYCLE__AND_WOULD_BE_SELF_CERTIFYING',
      businessEffectAuthority: 'NONE'
    };
  }

  const resolutionMoved = measured.UNDERSTANDING > 0 || measured.CAPABILITY > 0;
  const onlyOptions = !resolutionMoved && measured.OPTION_COUNT > 0;

  return {
    ok: true,
    status: resolutionMoved ? 'AMPLIFIED' : onlyOptions ? 'NOISE_NOT_AMPLIFICATION' : 'NO_CHANGE',
    subject: name,
    stagesCompleted: completed.sort(),
    realityContact: contact,
    deltas: measured,
    amplified: resolutionMoved,
    // Named because option count is the number that will be reached for.
    law: 'AMPLIFICATION_IS_A_SHARPER_CHOOSER__NOT_A_LONGER_MENU',
    note: onlyOptions
      ? 'Options rose and the chooser did not. That is more to choose between with no better basis for choosing, which is noise.'
      : null,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether repeated cycles are compounding or just spinning.
 *
 * A run of ungrounded or noise cycles is the shape that matters: a loop that
 * keeps turning while the chooser stays flat looks like activity and is the
 * exact thing the canon warns against, since UberBond would be consuming the
 * life it was meant to widen.
 */
export function amplificationTrend(cycles = []) {
  const rows = (Array.isArray(cycles) ? cycles : []).filter(row => row?.status && row?.deltas);
  if (rows.length === 0) return fail('TREND_INVALID', ['scored-cycles-required']);

  const amplifying = rows.filter(row => row.amplified === true);
  const noise = rows.filter(row => row.status === 'NOISE_NOT_AMPLIFICATION');
  const ungrounded = rows.filter(row => row.status === 'CYCLE_UNGROUNDED' || row.status === 'CYCLE_INCOMPLETE');

  const optionGain = rows.reduce((sum, row) => sum + (delta(row.deltas.OPTION_COUNT) || 0), 0);
  const resolutionGain = rows.reduce((sum, row) =>
    sum + (delta(row.deltas.UNDERSTANDING) || 0) + (delta(row.deltas.CAPABILITY) || 0), 0);

  const spinning = rows.length >= 3 && amplifying.length === 0;
  const menuGrowing = optionGain > 0 && resolutionGain <= 0;

  return {
    ok: true,
    status: spinning ? 'LOOP_SPINNING_WITHOUT_AMPLIFICATION' : 'AMPLIFICATION_TREND_COMPILED',
    cycles: rows.length,
    amplifying: amplifying.length,
    noise: noise.length,
    ungroundedOrIncomplete: ungrounded.length,
    totalOptionGain: optionGain,
    totalResolutionGain: resolutionGain,
    spinning,
    menuGrowingWithoutChooser: menuGrowing,
    law: 'A_LOOP_THAT_TURNS_WHILE_THE_CHOOSER_STAYS_FLAT_IS_CONSUMING_THE_LIFE_IT_WAS_MEANT_TO_WIDEN',
    businessEffectAuthority: 'NONE'
  };
}
