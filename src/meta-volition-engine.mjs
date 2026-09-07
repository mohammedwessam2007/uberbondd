// Meta-Volition Engine.
//
// First-order desire answers "what do I want now?". Meta-volition asks "what
// do I want to want / keep wanting / stop wanting?". The second layer does not
// erase the first and neither grants authority to UberBond; conflict is a fact
// to surface, not a vote for whichever layer sounds more sophisticated.
export const META_VOLITION_ENGINE_VERSION = 'uberbond.meta-volition-engine.v1';

const text = (value, max = 800) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'META_VOLITION_REFUSED',
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  businessEffectAuthority: 'NONE',
  ...extra
});

export function compileMetaVolition({
  object,
  firstOrder = null,
  secondOrder = null,
  presentChoice = null,
  at = new Date().toISOString()
} = {}) {
  const target = text(object, 500);
  const first = text(firstOrder?.stance || firstOrder, 80)?.toUpperCase();
  const second = text(secondOrder?.stance || secondOrder, 80)?.toUpperCase();
  const choice = text(presentChoice?.stance || presentChoice, 80)?.toUpperCase();
  const validFirst = new Set(['WANT', 'DO_NOT_WANT', 'AMBIVALENT', 'UNKNOWN']);
  const validSecond = new Set(['ENDORSE_WANTING', 'ENDORSE_NOT_WANTING', 'WANT_TO_CHANGE', 'AMBIVALENT', 'UNKNOWN']);
  const validChoice = new Set(['CHOOSE', 'DO_NOT_CHOOSE', 'DEFER', 'UNDECIDED']);
  const parsedAt = Date.parse(at);
  const reasons = [];
  if (!target) reasons.push('meta-volition-object-required');
  if (!validFirst.has(first)) reasons.push('valid-first-order-stance-required');
  if (!validSecond.has(second)) reasons.push('valid-second-order-stance-required');
  if (choice && !validChoice.has(choice)) reasons.push('valid-present-choice-required');
  if (!Number.isFinite(parsedAt)) reasons.push('valid-meta-volition-time-required');
  if (reasons.length) return fail(reasons);

  const aligned =
    (first === 'WANT' && second === 'ENDORSE_WANTING')
    || (first === 'DO_NOT_WANT' && second === 'ENDORSE_NOT_WANTING');
  const conflict =
    (first === 'WANT' && ['ENDORSE_NOT_WANTING', 'WANT_TO_CHANGE'].includes(second))
    || (first === 'DO_NOT_WANT' && ['ENDORSE_WANTING', 'WANT_TO_CHANGE'].includes(second));

  return {
    ok: true,
    status: conflict ? 'META_VOLITION_CONFLICT_VISIBLE' : aligned ? 'META_VOLITION_ALIGNED' : 'META_VOLITION_UNRESOLVED',
    object: target,
    firstOrder: first,
    secondOrder: second,
    presentChoice: choice || 'UNDECIDED',
    alignment: aligned,
    conflict,
    at: new Date(parsedAt).toISOString(),
    choicePrecedence: choice ? 'PRESENT_CHOICE_RECORDED_SEPARATELY_AND_OUTRANKS_MODEL_INFERENCE' : 'NO_PRESENT_CHOICE_RECORDED',
    highestRung: choice ? 'CHOICE' : 'VALUE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'SECOND_ORDER_DESIRE_DOES_NOT_CANCEL_FIRST_ORDER_EXPERIENCE_AND_NEITHER_AUTHORIZES_ACTION'
  };
}

/**
 * Compare two snapshots without treating change as inconsistency or pathology.
 */
export function compareMetaVolition({ before, after } = {}) {
  if (!before?.ok || !after?.ok) return fail(['two-valid-meta-volition-snapshots-required']);
  if (before.object !== after.object) return fail(['meta-volition-object-mismatch']);
  const changed = before.firstOrder !== after.firstOrder
    || before.secondOrder !== after.secondOrder
    || before.presentChoice !== after.presentChoice;
  return {
    ok: true,
    status: changed ? 'META_VOLITION_EVOLVED' : 'META_VOLITION_STABLE_ON_OBSERVED_SNAPSHOTS',
    changed,
    changes: {
      firstOrder: before.firstOrder === after.firstOrder ? null : { from: before.firstOrder, to: after.firstOrder },
      secondOrder: before.secondOrder === after.secondOrder ? null : { from: before.secondOrder, to: after.secondOrder },
      presentChoice: before.presentChoice === after.presentChoice ? null : { from: before.presentChoice, to: after.presentChoice }
    },
    normativeJudgmentAboutChange: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}
