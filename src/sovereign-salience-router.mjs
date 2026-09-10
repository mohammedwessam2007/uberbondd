export const SOVEREIGN_SALIENCE_ROUTER_VERSION = 'uberbond.sovereign-salience-router-1.0.0';

export const INTERVENTION_MODES = Object.freeze([
  'INTERRUPT_NOW',
  'PREPARE_SILENTLY',
  'DEFER',
  'PRESERVE_MYSTERY',
  'SAY_NOTHING'
]);

export const FOUNDER_SALIENCE_RULES = Object.freeze([
  'RIGHT_NOT_TO_KNOW',
  'NO_SPOILERS',
  'DIRECT_EXPERIENCE_FIRST',
  'DO_NOT_SURFACE',
  'EMERGENCY_ONLY',
  'NORMAL'
]);

const fail = (status, reasonCodes, extra = {}) => ({
  ok: false,
  status,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  ...extra
});

const text = (value, max = 4000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const unit = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
};

const bool = value => typeof value === 'boolean' ? value : null;

function zero(extra = {}) {
  return {
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    ...extra
  };
}

/**
 * Select how an already-relevant item should reach attention.
 *
 * This deliberately does NOT decide whether a world signal is relevant. That is
 * Gamechanger-for-Life's job. Nor does it execute anything. It only chooses an
 * attention posture after relevance survived the existing attention budget.
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
  const label = text(item, 1000);
  const u = unit(urgency);
  const i = unit(importance);
  const c = unit(confidence);
  const cost = unit(attentionCost);
  const reversible = unit(delayReversibility);
  const experience = unit(directExperienceValue);
  const missed = unit(consequenceIfMissed);
  const busy = bool(founderBusy);
  const rule = text(founderRule, 60);
  const reasons = [];
  if (!label) reasons.push('item-required');
  if ([u, i, c, cost, reversible, experience, missed].some(value => value === null)) reasons.push('all-scores-must-be-0-to-1');
  if (busy === null) reasons.push('founder-busy-boolean-required');
  if (!FOUNDER_SALIENCE_RULES.includes(rule)) reasons.push('known-founder-rule-required');
  if (reasons.length) return fail('SALIENCE_ROUTE_INVALID', reasons);

  // Explicit founder declarations dominate optimization. Right-not-to-know and
  // do-not-surface produce silence even when the system believes an item matters.
  if (rule === 'RIGHT_NOT_TO_KNOW' || rule === 'DO_NOT_SURFACE') {
    return zero({
      ok: true,
      status: 'SALIENCE_ROUTED',
      item: label,
      mode: 'SAY_NOTHING',
      rationale: ['FOUNDER_DECLARED_NON_SURFACING'],
      mayPreparePrivately: false,
      authorityBoundary: 'ATTENTION_ROUTING_IS_NOT_ACTION_AUTHORITY'
    });
  }

  if (rule === 'NO_SPOILERS' || rule === 'DIRECT_EXPERIENCE_FIRST') {
    return zero({
      ok: true,
      status: 'SALIENCE_ROUTED',
      item: label,
      mode: 'PRESERVE_MYSTERY',
      rationale: [rule, 'DIRECT_EXPERIENCE_OUTRANKS_INFORMATION_DENSITY'],
      mayPreparePrivately: rule === 'DIRECT_EXPERIENCE_FIRST',
      authorityBoundary: 'PRESERVING_MYSTERY_IS_AN_ATTENTION_DECISION_NOT_AN_EXTERNAL_ACTION'
    });
  }

  const emergencyShape = missed >= 0.9 && u >= 0.85 && c >= 0.75;
  if (rule === 'EMERGENCY_ONLY' && !emergencyShape) {
    return zero({ ok: true, status: 'SALIENCE_ROUTED', item: label, mode: 'SAY_NOTHING', rationale: ['FOUNDER_RULE_EMERGENCY_ONLY_NOT_MET'], mayPreparePrivately: false, authorityBoundary: 'ATTENTION_ROUTING_IS_NOT_ACTION_AUTHORITY' });
  }

  // An interrupt must earn its cost. Importance alone does not create urgency,
  // and confidence alone does not make delay harmful.
  const interruptValue = u * 0.3 + i * 0.2 + missed * 0.3 + c * 0.2;
  const interruptCost = cost * (busy ? 1.35 : 1);
  if (emergencyShape || (interruptValue >= 0.72 && interruptValue - interruptCost >= 0.25 && reversible <= 0.35)) {
    return zero({
      ok: true,
      status: 'SALIENCE_ROUTED',
      item: label,
      mode: 'INTERRUPT_NOW',
      rationale: emergencyShape ? ['HIGH_CONSEQUENCE_CLOSING_WINDOW_WITH_SUFFICIENT_CONFIDENCE'] : ['INTERRUPTION_VALUE_EXCEEDS_ATTENTION_COST', 'DELAY_IS_HARD_TO_REVERSE'],
      interruptValue: Number(interruptValue.toFixed(4)),
      interruptCost: Number(interruptCost.toFixed(4)),
      mayPreparePrivately: true,
      authorityBoundary: 'AN_INTERRUPT_MAY_INFORM_MOHAMED__IT_MAY_NOT_CHOOSE_OR_ACT_FOR_HIM_WITHOUT_SEPARATE_AUTHORITY'
    });
  }

  // Valuable but interrupt-expensive information can be prepared without
  // occupying consciousness. This is the default path for proactive intelligence.
  const preparationValue = i * 0.35 + c * 0.25 + missed * 0.2 + u * 0.2;
  if (preparationValue >= 0.45 && (busy || cost >= 0.45 || reversible >= 0.35)) {
    return zero({
      ok: true,
      status: 'SALIENCE_ROUTED',
      item: label,
      mode: 'PREPARE_SILENTLY',
      rationale: ['USEFUL_TO_HAVE_READY', 'CURRENT_INTERRUPTION_NOT_JUSTIFIED'],
      preparationValue: Number(preparationValue.toFixed(4)),
      mayPreparePrivately: true,
      authorityBoundary: 'PREPARATION_MAY_NOT_CROSS_EXTERNAL_EFFECT_OR_PRIVATE_DATA_BOUNDARIES'
    });
  }

  // If direct experience has high value even without an explicit founder rule,
  // the router prefers not to collapse it unless missing the item is consequential.
  if (experience >= 0.75 && missed < 0.6) {
    return zero({
      ok: true,
      status: 'SALIENCE_ROUTED',
      item: label,
      mode: 'PRESERVE_MYSTERY',
      rationale: ['HIGH_DIRECT_EXPERIENCE_VALUE', 'LOW_ENOUGH_COST_OF_NOT_SURFACING'],
      mayPreparePrivately: false,
      authorityBoundary: 'HEURISTIC_MYSTERY_PRESERVATION_CAN_ALWAYS_BE_OVERRIDDEN_BY_PRESENT_FOUNDER_CHOICE'
    });
  }

  if (reversible >= 0.65 || u <= 0.35) {
    return zero({
      ok: true,
      status: 'SALIENCE_ROUTED',
      item: label,
      mode: 'DEFER',
      rationale: ['DELAY_REMAINS_REVERSIBLE_OR_WINDOW_NOT_URGENT'],
      mayPreparePrivately: preparationValue >= 0.3,
      authorityBoundary: 'DEFER_MEANS_DO_NOT_INTERRUPT_NOW__NOT_DISCARD_FOREVER'
    });
  }

  return zero({
    ok: true,
    status: 'SALIENCE_ROUTED',
    item: label,
    mode: 'SAY_NOTHING',
    rationale: ['EXPECTED_ATTENTION_VALUE_TOO_LOW'],
    mayPreparePrivately: false,
    authorityBoundary: 'SILENCE_IS_AN_EXPLICIT_ROUTING_RESULT_NOT_EVIDENCE_THAT_NOTHING_EXISTS'
  });
}

export function routeSalienceBatch(items = [], { maxInterrupts = 2, maxPrepared = 8 } = {}) {
  if (!Array.isArray(items) || items.length > 512) return fail('SALIENCE_BATCH_INVALID', ['bounded-items-required']);
  const interruptCap = Number(maxInterrupts);
  const preparedCap = Number(maxPrepared);
  if (!Number.isSafeInteger(interruptCap) || interruptCap < 0 || interruptCap > 10 || !Number.isSafeInteger(preparedCap) || preparedCap < 0 || preparedCap > 50) {
    return fail('SALIENCE_BATCH_INVALID', ['bounded-interrupt-and-preparation-caps-required']);
  }

  const routed = items.map(input => routeSalience(input));
  if (routed.some(result => !result.ok)) return fail('SALIENCE_BATCH_INVALID', ['one-or-more-items-invalid'], { invalidCount: routed.filter(result => !result.ok).length });

  const interrupts = routed.filter(row => row.mode === 'INTERRUPT_NOW')
    .sort((a, b) => (b.interruptValue || 0) - (a.interruptValue || 0) || a.item.localeCompare(b.item));
  const allowedInterrupts = new Set(interrupts.slice(0, interruptCap).map(row => row.item));
  let preparedCount = 0;
  const final = routed.map(row => {
    if (row.mode === 'INTERRUPT_NOW' && !allowedInterrupts.has(row.item)) {
      if (preparedCount < preparedCap) { preparedCount += 1; return { ...row, mode: 'PREPARE_SILENTLY', rationale: [...row.rationale, 'INTERRUPTION_CAP_APPLIED'] }; }
      return { ...row, mode: 'DEFER', rationale: [...row.rationale, 'INTERRUPTION_AND_PREPARATION_CAPS_APPLIED'] };
    }
    if (row.mode === 'PREPARE_SILENTLY') {
      if (preparedCount < preparedCap) { preparedCount += 1; return row; }
      return { ...row, mode: 'DEFER', rationale: [...row.rationale, 'PREPARATION_CAP_APPLIED'] };
    }
    return row;
  });

  return zero({
    ok: true,
    status: 'SALIENCE_BATCH_ROUTED',
    routed: final,
    summary: Object.fromEntries(INTERVENTION_MODES.map(mode => [mode, final.filter(row => row.mode === mode).length])),
    law: 'SENSING_AND_REASONING_MAY_SCALE_FAR_FASTER_THAN_INTERRUPTION__FOUNDER_ATTENTION_REMAINS_SCARCE',
    authorityBoundary: 'BATCH_ROUTING_CANNOT_EXECUTE_EXTERNAL_EFFECTS_OR_CONVERT_A_RECOMMENDATION_INTO_CHOICE'
  });
}
