// The front door of the private loop: a thought entering the system without
// becoming a goal.
//
// The private core already holds, derives, exports and deletes life records.
// What it has no opinion about is the moment a raw human utterance arrives --
// and that moment is where the Will Kernel is won or lost. A capture layer that
// is merely a thin writer will, by omission, do three things the sovereignty
// laws forbid:
//
// 1. Turn a thought into a goal. "I keep thinking about moving abroad" is a
//    Will Event. The failure is not that a system refuses to act on it; the
//    failure is that it quietly appears on a plan as a task nobody chose. So
//    captures land with no promotion, and promotion is a separate act that
//    requires the founder to state the commitment in their own words. A
//    promotion that copies the thought forward is exactly the silent conversion
//    it claims to prevent.
// 2. Lose the consent the founder attached while speaking. The core normalizer
//    keeps the fields it knows and drops the rest, which means a do-not-model
//    flag passed as an ordinary field would vanish and the record would be
//    modelled anyway -- silently, and looking correct. Consent is therefore
//    normalized here and carried in an envelope the core preserves untouched.
// 3. Require the thought to make sense first. A capture that demands a category
//    or a justification is a capture that refuses uncertainty, and uncertainty
//    is the most honest thing a person says. "I do not know what I want" is
//    valid input, not a malformed request.
//
// Nothing here reimplements storage, deletion, export or the living model. Those
// are the core's, and this composes them.
import {
  founderAuthorized,
  privateDestinationAllowed,
  appendPrivateRecord,
  deriveLivingModel
} from './personal-civilization-core.mjs';

export const PERSONAL_CIVILIZATION_CAPTURE_VERSION = 'uberbond.personal-civilization-capture.v1';

/**
 * The forms a Will Event arrives in.
 *
 * UNCERTAINTY and CONTRADICTION are first-class rather than error states: the
 * Will Kernel begins from what was actually thought, and a person who does not
 * know what they want has said something true about themselves. UNCLASSIFIED
 * exists so a founder who declines to sort the thought is not blocked by the
 * taxonomy.
 */
export const WILL_EVENT_TYPES = Object.freeze([
  'DESIRE', 'CURIOSITY', 'INTUITION', 'FASCINATION', 'AVERSION', 'UNCERTAINTY',
  'FEAR', 'IMAGINATION', 'CONTRADICTION', 'VETO', 'COMMITMENT_STATED',
  'REVISION', 'RAW_THOUGHT', 'UNCLASSIFIED'
]);

/**
 * Consent and opacity flags the founder may attach at the moment of speaking.
 *
 * Attaching them later is too late -- by then the record has already been
 * available to whatever reads the store.
 */
export const CAPTURE_CONSENT_FLAGS = Object.freeze([
  'DO_NOT_MODEL',        // excluded from every derived model
  'DO_NOT_INFER_FROM',   // may be read, may not support an inference
  'DO_NOT_PREDICT_FROM', // may be read, may not feed a forecast
  'DO_NOT_PERSIST',      // heard, never written to the durable store
  'RIGHT_NOT_TO_KNOW'    // findings from this record are withheld from the founder
]);

const CONSENT_FIELD_BY_FLAG = Object.freeze({
  DO_NOT_MODEL: 'doNotModel',
  DO_NOT_INFER_FROM: 'doNotInferFrom',
  DO_NOT_PREDICT_FROM: 'doNotPredictFrom',
  DO_NOT_PERSIST: 'doNotPersist',
  RIGHT_NOT_TO_KNOW: 'rightNotToKnow'
});

/** Purposes a stored record may or may not be eligible for. */
export const CAPTURE_PURPOSES = Object.freeze(['MODEL', 'INFERENCE', 'PREDICTION']);

const CONSENT_FIELD_BLOCKING = Object.freeze({
  MODEL: 'doNotModel',
  INFERENCE: 'doNotInferFrom',
  PREDICTION: 'doNotPredictFrom'
});

/** What a founder may deliberately promote a capture into. Never automatic. */
export const PROMOTION_TARGETS = Object.freeze(['GOAL', 'TASK', 'COMMITMENT']);

const text = (value, max = 20000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};

const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

// Failures never carry the utterance. A refusal that quotes the thought has
// already copied it into whatever logs the refusal.
const fail = (status, reasonCodes, extra = {}) => ({
  ok: false, status, reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  businessEffectAuthority: 'NONE', ...extra
});

const NO_CONSENT = Object.freeze({
  doNotModel: false, doNotInferFrom: false, doNotPredictFrom: false,
  doNotPersist: false, rightNotToKnow: false
});

/**
 * Reads the consent the founder attached, or refuses the capture.
 *
 * An unrecognised flag is a refusal rather than a shrug. The founder who writes
 * `DO_NOT_TRAIN` believes they have restricted something; ignoring the word they
 * used would leave them protected only in their own mind.
 */
export function normalizeCaptureConsent(consent) {
  if (consent === null || consent === undefined) return { ok: true, consent: NO_CONSENT };

  const flags = {};
  const unrecognised = [];

  if (Array.isArray(consent)) {
    for (const entry of consent) {
      const name = text(entry, 60);
      if (name && CONSENT_FIELD_BY_FLAG[name]) flags[CONSENT_FIELD_BY_FLAG[name]] = true;
      else unrecognised.push(String(entry));
    }
  } else if (typeof consent === 'object') {
    const known = new Set(Object.values(CONSENT_FIELD_BY_FLAG));
    for (const [key, value] of Object.entries(consent)) {
      if (known.has(key)) flags[key] = Boolean(value);
      else if (CONSENT_FIELD_BY_FLAG[key]) flags[CONSENT_FIELD_BY_FLAG[key]] = Boolean(value);
      else unrecognised.push(key);
    }
  } else {
    return { ok: false, reasonCodes: ['consent-must-be-an-object-or-flag-list'] };
  }

  if (unrecognised.length) {
    return { ok: false, reasonCodes: ['unrecognised-consent-flag'], unrecognisedFlags: unrecognised };
  }
  return { ok: true, consent: Object.freeze({ ...NO_CONSENT, ...flags }) };
}

/**
 * Where a private capture may be written.
 *
 * The core already refuses repository paths; this adds the destination class it
 * was never asked about. A URL is not a path, so it slips past a filesystem
 * check while being the more consequential mistake: a repository leak is
 * recoverable in principle, a POST to someone else's server is not. Every
 * scheme is refused rather than an allowlist of bad ones, because the next
 * transport nobody thought of should fail closed.
 */
export function captureDestinationAllowed(destination) {
  const target = text(destination, 4096);
  if (!target) return { allowed: false, reasonCodes: ['capture-destination-required'] };

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target) || /^\\\\/.test(target) || target.startsWith('//')) {
    return { allowed: false, reasonCodes: ['private-life-data-may-not-reach-a-networked-destination'] };
  }
  return privateDestinationAllowed(target);
}

/**
 * Captures one Will Event.
 *
 * The founder supplies an utterance and, if they feel like it, nothing else. No
 * category is required, no interpretation, no reason for having the thought --
 * requiring any of those would make the system a gate the founder has to argue
 * past to think out loud, which is the non-totalization law failing quietly.
 *
 * What comes back is a record with `promotion: 'NONE'`. That is the whole point
 * of this function: the thought is now held, and it is not a goal.
 */
export function captureWillEvent({
  store = [], utterance = null, willEventType = null, consent = null,
  authorization = null, destination = null, occurredAt = null, now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) {
    return fail('CAPTURE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  }

  const at = iso(now);
  if (!at) return fail('CAPTURE_INVALID', ['valid-clock-required']);

  const body = text(utterance);
  if (!body) return fail('CAPTURE_INVALID', ['utterance-required']);

  // An unrecognised type is refused rather than coerced, for the same reason an
  // unrecognised consent flag is: a founder marking something a VETO and having
  // it filed as a stray thought has been overruled by a typo.
  const type = willEventType === null || willEventType === undefined
    ? 'UNCLASSIFIED'
    : text(willEventType, 40);
  if (!WILL_EVENT_TYPES.includes(type)) {
    return fail('CAPTURE_INVALID', ['valid-will-event-type-required'], { willEventType: type });
  }

  const consentCheck = normalizeCaptureConsent(consent);
  if (!consentCheck.ok) {
    return fail('CAPTURE_CONSENT_INVALID', consentCheck.reasonCodes,
      consentCheck.unrecognisedFlags ? { unrecognisedFlags: consentCheck.unrecognisedFlags } : {});
  }
  const settled = consentCheck.consent;

  // Heard and not written. Nothing is routed anywhere, and the utterance is not
  // echoed back into the result -- a "not persisted" receipt carrying the body
  // is a durable copy in whatever stores receipts.
  if (settled.doNotPersist) {
    if (destination !== null && destination !== undefined) {
      return fail('CAPTURE_DESTINATION_REFUSED', ['do-not-persist-capture-may-not-be-routed-anywhere']);
    }
    return {
      ok: true,
      status: 'CAPTURE_HELD_NOT_PERSISTED',
      persisted: false,
      willEventType: type,
      consent: settled,
      store,
      guarantee: 'A_DO_NOT_PERSIST_CAPTURE_REACHES_NO_DURABLE_STORE',
      businessEffectAuthority: 'NONE'
    };
  }

  const routing = captureDestinationAllowed(destination);
  if (!routing.allowed) return fail('CAPTURE_DESTINATION_REFUSED', routing.reasonCodes);

  const appended = appendPrivateRecord({
    store,
    input: {
      kind: 'THOUGHT',
      body,
      occurredAt: iso(occurredAt) || at,
      privacyClass: 'PRIVATE_LIFE_DATA'
    },
    authorization,
    destination
  });
  if (!appended.ok) {
    return fail(appended.status === 'PRIVATE_DESTINATION_REFUSED' ? 'CAPTURE_DESTINATION_REFUSED' : 'CAPTURE_INVALID',
      appended.reasonCodes);
  }

  // The envelope rides alongside the core's fields rather than inside them, so
  // the core's id, provenance and deletion closure keep working unchanged while
  // consent survives normalization.
  const record = Object.freeze({
    ...appended.record,
    capture: Object.freeze({
      willEventType: type,
      consent: settled,
      promotion: 'NONE',
      promotedFrom: null,
      capturedAt: at
    })
  });

  return {
    ok: true,
    status: appended.duplicate ? 'CAPTURE_ALREADY_PRESENT' : 'CAPTURE_RECORDED',
    persisted: true,
    duplicate: appended.duplicate,
    record,
    willEventType: type,
    consent: settled,
    store: appended.store.map(row => (row.id === record.id ? record : row)),
    // Stated on every capture so a consumer cannot read one as an instruction.
    promotionBoundary: 'A CAPTURED WILL EVENT IS NOT A GOAL, KPI, TASK, OPTIMIZATION TARGET OR COMMITMENT',
    businessEffectAuthority: 'NONE'
  };
}

/** Captures the founder has not promoted into anything. The normal state. */
export function capturedWillEvents(store = []) {
  return store.filter(row => row?.capture && row.capture.promotion === 'NONE');
}

/**
 * Goals, tasks and commitments -- and only those the founder explicitly made.
 *
 * A consumer looking for what the founder has committed to calls this, and it
 * returns nothing until an act of promotion happened. That is what keeps a
 * planner from reading the Thought Ocean as a backlog.
 */
export function capturedCommitments(store = []) {
  return store.filter(row => row?.capture && PROMOTION_TARGETS.includes(row.capture.promotion));
}

/**
 * Promotes a capture into a goal, task or commitment.
 *
 * `commitmentBody` is required and is not allowed to be the captured thought
 * restated by the system. The founder writes what they are committing to, in
 * their own words, or no commitment exists. Auto-deriving that sentence is the
 * precise failure this whole module is built against: it would let a thought
 * become an obligation without anyone choosing.
 *
 * The promotion is a new record deriving from the capture, so deleting the
 * thought still deletes what was built on it.
 */
export function promoteCapture({
  store = [], captureId = null, target = null, commitmentBody = null,
  authorization = null, destination = null, now = new Date()
} = {}) {
  if (!founderAuthorized(authorization)) {
    return fail('CAPTURE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  }

  const at = iso(now);
  if (!at) return fail('CAPTURE_PROMOTION_REFUSED', ['valid-clock-required']);

  const id = text(captureId, 80);
  const source = id ? store.find(row => row?.id === id) : null;
  if (!source) return fail('CAPTURE_PROMOTION_REFUSED', ['capture-not-found']);

  if (!PROMOTION_TARGETS.includes(target)) {
    return fail('CAPTURE_PROMOTION_REFUSED', ['explicit-promotion-target-required']);
  }

  const stated = text(commitmentBody, 4000);
  if (!stated) return fail('CAPTURE_PROMOTION_REFUSED', ['founder-stated-commitment-body-required']);

  const routing = captureDestinationAllowed(destination);
  if (!routing.allowed) return fail('CAPTURE_DESTINATION_REFUSED', routing.reasonCodes);

  const appended = appendPrivateRecord({
    store,
    input: {
      kind: 'LIFE_EVENT',
      body: stated,
      occurredAt: at,
      privacyClass: 'PRIVATE_LIFE_DATA',
      derivedFrom: [source.id]
    },
    authorization,
    destination
  });
  if (!appended.ok) return fail('CAPTURE_PROMOTION_REFUSED', appended.reasonCodes);

  const record = Object.freeze({
    ...appended.record,
    capture: Object.freeze({
      willEventType: 'COMMITMENT_STATED',
      consent: source.capture?.consent ?? NO_CONSENT,
      promotion: target,
      promotedFrom: source.id,
      capturedAt: at
    })
  });

  return {
    ok: true,
    status: 'CAPTURE_PROMOTED',
    promotion: target,
    record,
    store: appended.store.map(row => (row.id === record.id ? record : row)),
    promotionBoundary: 'THE FOUNDER PROMOTED THIS DELIBERATELY; THE SOURCE THOUGHT REMAINS A THOUGHT',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * The records a given purpose is allowed to touch.
 *
 * Deny-by-default on an unknown purpose. A new consumer inventing a purpose name
 * gets nothing rather than everything, which is the failure direction that can
 * be noticed.
 */
export function recordsEligibleFor(store = [], purpose = null) {
  const blocking = CONSENT_FIELD_BLOCKING[purpose];
  if (!blocking) return [];
  return store.filter(row => !(row?.capture?.consent?.[blocking]));
}

/** Ids withheld from a purpose, for a caller that needs to say what it skipped. */
export function recordsWithheldFrom(store = [], purpose = null) {
  const blocking = CONSENT_FIELD_BLOCKING[purpose];
  if (!blocking) return store.map(row => row?.id).filter(Boolean);
  return store.filter(row => Boolean(row?.capture?.consent?.[blocking])).map(row => row.id);
}

/**
 * The core's living model, derived only from records the founder allowed to be
 * modelled.
 *
 * The exclusion happens by withholding the records from the core before it
 * derives anything, rather than by filtering the model afterwards: filtering a
 * finished model means the excluded record was read, weighed, and reflected in
 * whatever survived. Withheld from the core, it cannot be cited at all, and the
 * core refuses the claim as citing something absent.
 *
 * That refusal is then renamed. "Absent" and "the founder said no" are different
 * facts, and reporting the first when the second is true tells the founder their
 * consent was a data problem.
 */
export function deriveLivingModelFromCaptures({ store = [], claims = [], authorization = null, now = new Date() } = {}) {
  if (!founderAuthorized(authorization)) {
    return fail('CAPTURE_FOUNDER_AUTHORITY_REQUIRED', ['founder-authorization-required']);
  }

  const modellable = recordsEligibleFor(store, 'MODEL');
  const withheld = new Set(recordsWithheldFrom(store, 'MODEL'));

  const model = deriveLivingModel({ store: modellable, claims, authorization, now });
  if (!model.ok) return model;

  const refused = model.refused.map(entry => {
    const blocked = (entry.missing || []).filter(sourceId => withheld.has(sourceId));
    if (!blocked.length) return entry;
    return { claim: entry.claim, blockedSourceIds: blocked, reasonCodes: ['claim-cites-record-withheld-from-modelling'] };
  });

  return {
    ok: true,
    status: 'LIVING_MODEL_DERIVED_FROM_CAPTURES',
    derivedAt: model.derivedAt,
    derivedCount: model.derivedCount,
    refusedCount: model.refusedCount,
    derived: model.derived,
    refused,
    withheldFromModelling: [...withheld],
    // The excluded records stay in the store; they were kept out of the model,
    // not deleted. Rebuilding the store from the modellable subset would turn
    // a consent flag into a deletion.
    store: [...store, ...model.derived],
    truthBoundary: model.truthBoundary,
    consentBoundary: 'A RECORD MARKED DO_NOT_MODEL IS ABSENT FROM EVERY DERIVED MODEL',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Splits findings into what may be told to the founder and what may not.
 *
 * The right not to know is a real preference, not a bug in the pipeline: some
 * things cannot be unlearned, and a founder who asked not to hear conclusions
 * drawn from a record has made a decision the system does not get to overrule
 * by being helpful. Withheld findings come back as ids and reasons only --
 * returning the finding body would deliver the very thing being withheld.
 */
export function partitionFindingsForFounder({ store = [], findings = [] } = {}) {
  const silent = new Set(store.filter(row => row?.capture?.consent?.rightNotToKnow).map(row => row.id));

  const deliverable = [];
  const withheld = [];
  for (const finding of (Array.isArray(findings) ? findings : [])) {
    const sources = (Array.isArray(finding?.derivedFrom) ? finding.derivedFrom : []).map(value => text(value, 80)).filter(Boolean);
    const blocked = sources.filter(sourceId => silent.has(sourceId));
    if (blocked.length) {
      withheld.push({ blockedSourceIds: blocked, reasonCodes: ['founder-asked-not-to-receive-findings-from-this-record'] });
      continue;
    }
    deliverable.push(finding);
  }

  return {
    ok: true,
    status: 'FINDINGS_PARTITIONED',
    deliverableCount: deliverable.length,
    withheldCount: withheld.length,
    deliverable,
    withheld,
    businessEffectAuthority: 'NONE'
  };
}
