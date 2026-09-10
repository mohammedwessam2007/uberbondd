export const SOVEREIGN_SALIENCE_ROUTER_VERSION = 'uberbond.sovereign-salience-router-1.1.0';

export const INTERVENTION_MODES = Object.freeze([
  'INTERRUPT_NOW', 'PREPARE_SILENTLY', 'DEFER', 'PRESERVE_MYSTERY', 'SAY_NOTHING'
]);

export const FOUNDER_SALIENCE_RULES = Object.freeze([
  'RIGHT_NOT_TO_KNOW', 'NO_SPOILERS', 'DIRECT_EXPERIENCE_FIRST',
  'DO_NOT_SURFACE', 'EMERGENCY_ONLY', 'NORMAL'
]);

const zeroEffects = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  ...extra
});

const fail = (reasonCodes, extra = {}) => zeroEffects({
  ok: false,
  status: 'SALIENCE_ROUTE_INVALID',
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const unit = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};

/**
 * Zero-effect attention routing. This function decides only how already-admitted
 * information may reach founder attention. It cannot establish relevance,
 * change reality, grant authority, persist private-life context, or execute an
 * external action.
 */
export function routeSalience({
  item,
  urgency,
  importance,
  confidence,
  attentionCost,
  delayReversibility,
  founderRule = 'NORMAL',
  founderBusy = false,
  directExperienceValue = 0,
  consequenceIfMissed = 0
} = {}) {
  const label = text(item);
  const scores = {
    urgency: unit(urgency), importance: unit(importance), confidence: unit(confidence),
    attentionCost: unit(attentionCost), delayReversibility: unit(delayReversibility),
    directExperienceValue: unit(directExperienceValue), consequenceIfMissed: unit(consequenceIfMissed)
  };
  const rule = text(founderRule, 60);
  const reasons = [];
  if (!label) reasons.push('item-required');
  if (Object.values(scores).some(value => value === null)) reasons.push('all-scores-must-be-0-to-1');
  if (typeof founderBusy !== 'boolean') reasons.push('founder-busy-boolean-required');
  if (!FOUNDER_SALIENCE_RULES.includes(rule)) reasons.push('known-founder-rule-required');
  if (reasons.length) return fail(reasons);

  const { urgency: u, importance: i, confidence: c, attentionCost: cost,
    delayReversibility: reversible, directExperienceValue: experience,
    consequenceIfMissed: missed } = scores;

  if (rule === 'RIGHT_NOT_TO_KNOW' || rule === 'DO_NOT_SURFACE') {
    return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'SAY_NOTHING',
      rationale: ['FOUNDER_DECLARED_NON_SURFACING'], mayPreparePrivately: false,
      authorityBoundary: 'ATTENTION_ROUTING_IS_NOT_ACTION_AUTHORITY' });
  }

  if (rule === 'NO_SPOILERS' || rule === 'DIRECT_EXPERIENCE_FIRST') {
    return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'PRESERVE_MYSTERY',
      rationale: [rule, 'DIRECT_EXPERIENCE_OUTRANKS_INFORMATION_DENSITY'],
      mayPreparePrivately: rule === 'DIRECT_EXPERIENCE_FIRST',
      authorityBoundary: 'PRESERVING_MYSTERY_IS_AN_ATTENTION_DECISION_NOT_AN_EXTERNAL_ACTION' });
  }

  const emergencyShape = missed >= 0.9 && u >= 0.85 && c >= 0.75;
  if (rule === 'EMERGENCY_ONLY' && !emergencyShape) {
    return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'SAY_NOTHING',
      rationale: ['FOUNDER_RULE_EMERGENCY_ONLY_NOT_MET'], mayPreparePrivately: false,
      authorityBoundary: 'ATTENTION_ROUTING_IS_NOT_ACTION_AUTHORITY' });
  }

  const interruptValue = u * 0.3 + i * 0.2 + missed * 0.3 + c * 0.2;
  const interruptCost = cost * (founderBusy ? 1.35 : 1);
  if (emergencyShape || (interruptValue >= 0.72 && interruptValue - interruptCost >= 0.25 && reversible <= 0.35)) {
    return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'INTERRUPT_NOW',
      rationale: emergencyShape ? ['HIGH_CONSEQUENCE_CLOSING_WINDOW_WITH_SUFFICIENT_CONFIDENCE'] : ['INTERRUPTION_VALUE_EXCEEDS_ATTENTION_COST', 'DELAY_IS_HARD_TO_REVERSE'],
      interruptValue: Number(interruptValue.toFixed(4)), interruptCost: Number(interruptCost.toFixed(4)),
      mayPreparePrivately: true,
      authorityBoundary: 'AN_INTERRUPT_MAY_INFORM_THE_FOUNDER_BUT_CANNOT_CHOOSE_OR_ACT_WITHOUT_SEPARATE_AUTHORITY' });
  }

  // Mystery preservation must be evaluated before generic silent preparation.
  // Otherwise a highly reversible/high-cost item can be prepared despite a
  // strong direct-experience value, contradicting the router's own contract.
  if (experience >= 0.75 && missed < 0.6) {
    return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'PRESERVE_MYSTERY',
      rationale: ['HIGH_DIRECT_EXPERIENCE_VALUE', 'LOW_ENOUGH_COST_OF_NOT_SURFACING'], mayPreparePrivately: false,
      authorityBoundary: 'HEURISTIC_MYSTERY_PRESERVATION_CAN_ALWAYS_BE_OVERRIDDEN_BY_PRESENT_FOUNDER_CHOICE' });
  }

  const preparationValue = i * 0.35 + c * 0.25 + missed * 0.2 + u * 0.2;
  if (preparationValue >= 0.45 && (founderBusy || cost >= 0.45 || reversible >= 0.35)) {
    return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'PREPARE_SILENTLY',
      rationale: ['USEFUL_TO_HAVE_READY', 'CURRENT_INTERRUPTION_NOT_JUSTIFIED'],
      preparationValue: Number(preparationValue.toFixed(4)), mayPreparePrivately: true,
      authorityBoundary: 'PREPARATION_MAY_NOT_CROSS_EXTERNAL_EFFECT_OR_PRIVATE_DATA_BOUNDARIES' });
  }

  if (reversible >= 0.65 || u <= 0.35) {
    return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'DEFER',
      rationale: ['DELAY_REMAINS_REVERSIBLE_OR_WINDOW_NOT_URGENT'], mayPreparePrivately: preparationValue >= 0.3,
      authorityBoundary: 'DEFER_MEANS_DO_NOT_INTERRUPT_NOW_NOT_DISCARD_FOREVER' });
  }

  return zeroEffects({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'SAY_NOTHING',
    rationale: ['EXPECTED_ATTENTION_VALUE_TOO_LOW'], mayPreparePrivately: false,
    authorityBoundary: 'SILENCE_IS_AN_EXPLICIT_ROUTING_RESULT_NOT_EVIDENCE_THAT_NOTHING_EXISTS' });
}

export function routeSalienceBatch(items = [], { maxInterrupts = 2, maxPrepared = 8 } = {}) {
  if (!Array.isArray(items) || items.length > 512) return fail(['bounded-items-required']);
  if (!Number.isSafeInteger(maxInterrupts) || maxInterrupts < 0 || maxInterrupts > 10 ||
      !Number.isSafeInteger(maxPrepared) || maxPrepared < 0 || maxPrepared > 50) {
    return fail(['bounded-interrupt-and-preparation-caps-required']);
  }
  const routed = items.map(routeSalience);
  if (routed.some(result => !result.ok)) return fail(['one-or-more-items-invalid'], { invalidCount: routed.filter(row => !row.ok).length });

  const interrupts = routed.filter(row => row.mode === 'INTERRUPT_NOW')
    .sort((a, b) => (b.interruptValue || 0) - (a.interruptValue || 0) || a.item.localeCompare(b.item));
  const allowedInterrupts = new Set(interrupts.slice(0, maxInterrupts).map(row => row.item));
  let preparedCount = 0;
  const final = routed.map(row => {
    if (row.mode === 'INTERRUPT_NOW' && !allowedInterrupts.has(row.item)) {
      if (preparedCount < maxPrepared) { preparedCount += 1; return { ...row, mode: 'PREPARE_SILENTLY', rationale: [...row.rationale, 'INTERRUPTION_CAP_APPLIED'] }; }
      return { ...row, mode: 'DEFER', rationale: [...row.rationale, 'INTERRUPTION_AND_PREPARATION_CAPS_APPLIED'] };
    }
    if (row.mode === 'PREPARE_SILENTLY') {
      if (preparedCount < maxPrepared) { preparedCount += 1; return row; }
      return { ...row, mode: 'DEFER', rationale: [...row.rationale, 'PREPARATION_CAP_APPLIED'] };
    }
    return row;
  });

  return zeroEffects({ ok: true, status: 'SALIENCE_BATCH_ROUTED', routed: final,
    summary: Object.fromEntries(INTERVENTION_MODES.map(mode => [mode, final.filter(row => row.mode === mode).length])),
    law: 'SENSING_AND_REASONING_MAY_SCALE_FASTER_THAN_INTERRUPTION_FOUNDER_ATTENTION_REMAINS_SCARCE',
    authorityBoundary: 'BATCH_ROUTING_CANNOT_EXECUTE_EXTERNAL_EFFECTS_OR_CONVERT_A_RECOMMENDATION_INTO_CHOICE' });
}
