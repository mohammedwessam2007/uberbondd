// What is remembered, what is modelled, and what is nobody's business.
//
// A lifetime system accumulates a person. That is the point and the danger:
// every fact retained is a fact that can be inferred from, and a system that
// records everything eventually knows things its subject never chose to make
// knowable.
//
// Canon separates four rights that a naive store collapses into one:
//
//   the right to know          -- ask, and be told
//   the right not to know      -- some truths are not wanted, and that is a choice
//   the right to opacity       -- record it, do not model it
//   the right to be forgotten  -- record it, then stop
//
// The one this module refuses to blur is the third. "We have the data but we
// do not infer from it" is a promise no store keeps by accident, so opacity is
// enforced at the point of inference rather than promised in a policy.
export const MEMORY_SOVEREIGNTY_VERSION = 'uberbond.memory-sovereignty.v1';

/** How a record may be held. Ordered from most to least available. */
export const MEMORY_LAYERS = Object.freeze([
  'ACTIVE_MODEL',        // informs inference now
  'SEMANTIC',            // retrievable, informs inference on request
  'RAW_ARCHIVE',         // retained, never inferred from
  'DORMANT',             // decayed out of salience, rediscoverable
  'FORGOTTEN_FROM_USE'   // retained for the record, removed from every path
]);

/** Layers from which the system may draw an inference. Deliberately short. */
export const INFERABLE_LAYERS = Object.freeze(['ACTIVE_MODEL', 'SEMANTIC']);

/** What makes information hazardous independently of whether it is true. */
export const HAZARD_CLASSES = Object.freeze([
  'PRIVACY_CONSEQUENCE', 'MANIPULATION_RISK', 'DANGEROUS_IF_DISCLOSED',
  'DANGEROUS_IF_MISUSED', 'IRREVERSIBLE_ONCE_LEARNED'
]);

/** What happens to the accumulated system after a life. Founder-defined only. */
export const POSTHUMOUS_DISPOSITIONS = Object.freeze([
  'DESTROY', 'PRIVATE_ARCHIVE', 'FAMILY_INHERITANCE', 'SELECTIVE_LEGACY',
  'PUBLIC_RELEASE', 'INSTITUTIONAL_CONTINUATION', 'UNDECIDED'
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
 * Whether a record may inform an inference.
 *
 * The layer decides, not the record's content and not the caller's intent. A
 * caller that has just found a very useful correlation is the least reliable
 * place to ask whether it was allowed to look.
 */
export function mayInferFrom(record) {
  if (!record || typeof record !== 'object') return false;
  if (record.doNotInfer === true) return false;
  return INFERABLE_LAYERS.includes(record.layer);
}

/**
 * Files a record into a layer, honouring an opacity request over usefulness.
 *
 * `doNotInfer` survives promotion. Without that, a record marked opaque could be
 * moved to ACTIVE_MODEL by any later process and the mark would evaporate --
 * which is how opacity promises usually die.
 */
export function retain(input = {}) {
  const about = text(input?.about, 1000);
  if (!about) return fail('RETENTION_INVALID', ['record-subject-required']);

  const layer = MEMORY_LAYERS.includes(input?.layer) ? input.layer : null;
  if (!layer) return fail('RETENTION_INVALID', ['valid-memory-layer-required']);

  const doNotInfer = input?.doNotInfer === true;
  if (doNotInfer && INFERABLE_LAYERS.includes(layer)) {
    return fail('OPACITY_CONFLICT', ['do-not-infer-record-cannot-sit-in-an-inferable-layer'], {
      about, layer,
      note: 'Holding an opaque record in an inferable layer is a promise the store cannot keep.'
    });
  }

  return {
    ok: true,
    status: 'RETAINED',
    record: {
      about,
      layer,
      doNotInfer,
      // Preserved even when the record leaves active use, because a factual
      // record and a psychological obligation are different things.
      historicalTruth: input?.historicalTruth !== false,
      identityRelevant: input?.identityRelevant === true
    },
    inferable: mayInferFrom({ layer, doNotInfer }),
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Moves a record out of active use without destroying the record.
 *
 * Strategic forgetting is decay of salience, not deletion. Deleting would lose
 * the history that makes a change of mind legible; keeping it active would let
 * a person's past keep voting on their present.
 */
export function forgetFromUse({ record = null, reason = null } = {}) {
  if (!record?.about) return fail('FORGET_INVALID', ['record-required']);
  const why = text(reason, 500);
  if (!why) return fail('FORGET_INVALID', ['reason-required']);

  return {
    ok: true,
    status: 'FORGOTTEN_FROM_USE',
    record: { ...record, layer: 'FORGOTTEN_FROM_USE', identityRelevant: false },
    reason: why,
    stillRetained: record.historicalTruth !== false,
    rediscoverable: true,
    law: 'HISTORICAL_TRUTH_IS_NOT_A_PSYCHOLOGICAL_OBLIGATION. THE RECORD SURVIVES; ITS CLAIM ON THE PRESENT DOES NOT.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Brings a dormant record back when something makes it relevant again.
 *
 * The trigger must be named. Rediscovery with no stated trigger is just the
 * system deciding to look at the past again, which is what decay was for.
 */
export function rediscover({ record = null, trigger = null } = {}) {
  if (!record?.about) return fail('REDISCOVERY_INVALID', ['record-required']);
  const because = text(trigger, 500);
  if (!because) return fail('REDISCOVERY_INVALID', ['trigger-required'], {
    note: 'Rediscovery with no stated trigger is the system deciding to look at the past again, which is what decay was for.'
  });
  if (record.doNotInfer === true) {
    return fail('REDISCOVERY_REFUSED', ['opaque-record-may-not-be-rediscovered-into-inference'], { about: record.about });
  }

  return {
    ok: true,
    status: 'REDISCOVERED',
    record: { ...record, layer: 'SEMANTIC' },
    trigger: because,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether the founder wants to know something he has not asked for.
 *
 * Truth is not automatically a gift. A system that discloses everything it
 * learns has decided that knowing is always better, which is a value judgment
 * about someone else's life.
 */
export function disclosure({ finding = null, founderAsked = null, hazards = [], irreversibleOnceLearned = false } = {}) {
  const what = text(finding, 2000);
  if (!what) return fail('DISCLOSURE_INVALID', ['finding-required']);

  const classes = (Array.isArray(hazards) ? hazards : []).filter(hazard => HAZARD_CLASSES.includes(hazard));

  if (founderAsked === false) {
    return {
      ok: true,
      status: 'WITHHELD_BY_STANDING_REQUEST',
      finding: what,
      note: 'He asked not to be told. Research may continue privately; the conclusion does not get pushed into his awareness.',
      businessEffectAuthority: 'NONE'
    };
  }
  if (founderAsked === null && (irreversibleOnceLearned || classes.includes('IRREVERSIBLE_ONCE_LEARNED'))) {
    return {
      ok: true,
      status: 'OFFER_BEFORE_TELLING',
      finding: what,
      hazards: classes,
      note: 'This cannot be unlearned. He is offered the choice rather than handed the answer.',
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    status: founderAsked === true ? 'DISCLOSE' : 'DISCLOSE_ROUTINE',
    finding: what,
    hazards: classes,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The founder's own view, captured before the system offers its synthesis.
 *
 * Anchoring is not defeated by good intentions. The only way to preserve an
 * independent prior is to record it before the recommendation exists, which is
 * why a No-UberBond view captured afterwards is refused rather than discounted.
 */
export function noUberBondView({ question = null, founderPrior = null, capturedBeforeRecommendation = false } = {}) {
  const asked = text(question, 2000);
  const prior = text(founderPrior, 2000);
  if (!asked || !prior) return fail('NO_UBERBOND_VIEW_INVALID', ['question-and-founder-prior-required']);

  if (!capturedBeforeRecommendation) {
    return fail('NO_UBERBOND_VIEW_CONTAMINATED', ['prior-must-be-captured-before-the-recommendation'], {
      question: asked,
      note: 'A prior recorded after seeing the recommendation is a reaction to it, not an independent view.'
    });
  }

  return {
    ok: true,
    status: 'INDEPENDENT_PRIOR_CAPTURED',
    question: asked,
    founderPrior: prior,
    purpose: 'PRESERVES THE ABILITY TO REASON WITHOUT THE SYSTEMS FRAMING, AND TO NOTICE LATER IF THE FRAMING MOVED HIM.',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * What happens to all of this afterwards.
 *
 * UNDECIDED is the honest default and is never resolved by the system. An
 * accumulated life becoming someone's dataset by default is the outcome this
 * exists to prevent.
 */
export function posthumousDisposition({ disposition = null, statedByFounder = false } = {}) {
  const chosen = POSTHUMOUS_DISPOSITIONS.includes(disposition) ? disposition : 'UNDECIDED';
  if (chosen !== 'UNDECIDED' && !statedByFounder) {
    return fail('POSTHUMOUS_DISPOSITION_REFUSED', ['disposition-must-be-stated-by-the-founder'], {
      note: 'Nobody else, and no default, decides what becomes of an accumulated life.'
    });
  }
  return {
    ok: true,
    status: 'POSTHUMOUS_DISPOSITION',
    disposition: chosen,
    statedByFounder,
    default: 'UNDECIDED',
    law: 'AN_ACCUMULATED_LIFE_DOES_NOT_BECOME_SOMEONE_ELSES_DATASET_BY_DEFAULT',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Whether this survives its own technology stack.
 *
 * A lifetime store outlives every provider, format and company that touches it.
 * A record readable only through a running service is a record with an expiry
 * date nobody wrote down.
 */
export function continuityPosture({ records = [] } = {}) {
  const rows = (Array.isArray(records) ? records : [])
    .map(row => ({
      about: text(row?.about, 500),
      portableFormat: row?.portableFormat === true,
      requiresRunningService: row?.requiresRunningService === true
    }))
    .filter(row => row.about);

  const atRisk = rows.filter(row => !row.portableFormat || row.requiresRunningService);
  return {
    ok: true,
    status: atRisk.length ? 'CONTINUITY_AT_RISK' : 'PORTABLE',
    records: rows.length,
    atRisk: atRisk.map(row => row.about),
    law: 'A_RECORD_READABLE_ONLY_THROUGH_A_RUNNING_SERVICE_HAS_AN_EXPIRY_DATE_NOBODY_WROTE_DOWN',
    businessEffectAuthority: 'NONE'
  };
}
