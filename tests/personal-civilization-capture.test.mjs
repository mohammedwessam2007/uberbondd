import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WILL_EVENT_TYPES,
  CAPTURE_CONSENT_FLAGS,
  PROMOTION_TARGETS,
  normalizeCaptureConsent,
  captureDestinationAllowed,
  captureWillEvent,
  capturedWillEvents,
  capturedCommitments,
  promoteCapture,
  recordsEligibleFor,
  recordsWithheldFrom,
  deriveLivingModelFromCaptures,
  partitionFindingsForFounder
} from '../src/personal-civilization-capture.mjs';

// Everything below uses obviously synthetic placeholder utterances. Nothing in
// this file is, or resembles, a real private thought.
//
// The failures worth testing here are the silent ones. A capture that is
// wrongly refused is visible the second the founder tries again. A capture that
// was marked do-not-model and got modelled anyway, or a thought that turned up
// on a plan as a task, produces output that looks entirely correct -- so the
// weight sits there.

const OWNER = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-07T00:00:00.000Z' };
const OUTSIDE = '/home/placeholder/.uberbond-private/capture.jsonl';
const CLOCK = new Date('2026-09-07T09:00:00.000Z');

const capture = (store, utterance, extra = {}) => captureWillEvent({
  store, utterance, authorization: OWNER, destination: OUTSIDE, now: CLOCK, ...extra
});

// ---- Load-bearing: do-not-model is absent from the derived model -----------

test('LOAD-BEARING: a record flagged do-not-model is absent from the derived living model', () => {
  let store = [];
  const open = capture(store, 'placeholder utterance A, freely modellable');
  store = open.store;
  const sealed = capture(store, 'placeholder utterance B, marked do-not-model', {
    consent: ['DO_NOT_MODEL']
  });
  store = sealed.store;

  const model = deriveLivingModelFromCaptures({
    store,
    claims: [
      { body: 'claim drawn from the open record', derivedFrom: [open.record.id] },
      { body: 'claim drawn from the sealed record', derivedFrom: [sealed.record.id] }
    ],
    authorization: OWNER,
    now: CLOCK
  });

  assert.equal(model.ok, true);
  // Exactly one claim survived, and it is the one that never touched the sealed record.
  assert.equal(model.derivedCount, 1);
  assert.deepEqual(model.derived[0].derivedFrom, [open.record.id]);

  // The refusal names consent, not a missing row. A record excluded for consent
  // and a record that does not exist are different facts about the founder.
  const consentRefusal = model.refused.find(entry => entry.reasonCodes?.includes('claim-cites-record-withheld-from-modelling'));
  assert.ok(consentRefusal, 'a claim citing a do-not-model record must be refused by name');
  assert.deepEqual(consentRefusal.blockedSourceIds, [sealed.record.id]);
  assert.deepEqual(model.withheldFromModelling, [sealed.record.id]);

  // Nothing derived references the sealed record, by id or by content, anywhere
  // in the model output. This is the assertion that fails if the exclusion is
  // removed at any of its layers.
  const derivedJson = JSON.stringify(model.derived);
  assert.equal(derivedJson.includes(sealed.record.id), false,
    'a do-not-model record reached the derived model by id');
  assert.equal(derivedJson.includes('marked do-not-model'), false,
    'a do-not-model record reached the derived model by content');

  // The record was withheld, not deleted. Consent is not destruction.
  assert.ok(model.store.some(row => row.id === sealed.record.id),
    'excluding a record from the model must not remove it from the store');
  assert.match(model.consentBoundary, /ABSENT FROM EVERY DERIVED MODEL/);
});

test('do-not-model excludes a record from eligibility rather than from existence', () => {
  let store = [];
  store = capture(store, 'placeholder open thought').store;
  const sealed = capture(store, 'placeholder sealed thought', { consent: { doNotModel: true } });
  store = sealed.store;

  assert.equal(store.length, 2);
  assert.equal(recordsEligibleFor(store, 'MODEL').length, 1);
  assert.deepEqual(recordsWithheldFrom(store, 'MODEL'), [sealed.record.id]);
});

test('an unknown purpose is denied every record rather than granted them', () => {
  const store = [{ id: 'a', capture: { consent: { doNotModel: false } } }];
  assert.deepEqual(recordsEligibleFor(store, 'TRAINING'), []);
  assert.deepEqual(recordsEligibleFor(store, null), []);
  assert.deepEqual(recordsWithheldFrom(store, 'TRAINING'), ['a']);
});

test('do-not-infer-from and do-not-predict-from bind their own purposes', () => {
  let store = [];
  const noInfer = capture(store, 'placeholder no-inference thought', { consent: ['DO_NOT_INFER_FROM'] });
  store = noInfer.store;
  const noPredict = capture(store, 'placeholder no-prediction thought', { consent: ['DO_NOT_PREDICT_FROM'] });
  store = noPredict.store;

  assert.deepEqual(recordsWithheldFrom(store, 'INFERENCE'), [noInfer.record.id]);
  assert.deepEqual(recordsWithheldFrom(store, 'PREDICTION'), [noPredict.record.id]);
  // Neither was marked do-not-model, so neither is withheld from modelling.
  assert.deepEqual(recordsWithheldFrom(store, 'MODEL'), []);
});

// ---- Load-bearing: private data may not reach a public or networked place ---

test('LOAD-BEARING: private life data routed to a public or networked destination is refused', () => {
  const networked = [
    'https://api.placeholder.example/ingest',
    'http://placeholder.example/ingest',
    'ws://placeholder.example/socket',
    's3://placeholder-bucket/life.jsonl',
    'gs://placeholder-bucket/life.jsonl',
    'postgres://placeholder.example/db',
    'file:///home/placeholder/life.jsonl',
    '\\\\placeholder-server\\share\\life.jsonl',
    '//placeholder-server/share/life.jsonl'
  ];
  for (const destination of networked) {
    const verdict = captureDestinationAllowed(destination);
    assert.equal(verdict.allowed, false, `${destination} must be refused`);
    assert.deepEqual(verdict.reasonCodes, ['private-life-data-may-not-reach-a-networked-destination'],
      `${destination} must be refused as networked, not as a malformed path`);
  }

  // And the refusal must hold through the capture entry point, without echoing
  // the utterance into whatever logs the result.
  const result = captureWillEvent({
    store: [], utterance: 'placeholder thought that must not be transmitted',
    authorization: OWNER, destination: 'https://api.placeholder.example/ingest', now: CLOCK
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPTURE_DESTINATION_REFUSED');
  assert.deepEqual(result.reasonCodes, ['private-life-data-may-not-reach-a-networked-destination']);
  assert.equal(result.store, undefined, 'a refused capture must not hand back a store');
  assert.equal(JSON.stringify(result).includes('must not be transmitted'), false,
    'a refusal that quotes the utterance has already copied what it refused to send');
});

test('the core repository-path refusal is composed, not re-decided', () => {
  // Weakening the core check must surface here too; this layer adds to it and
  // never substitutes for it.
  const verdict = captureDestinationAllowed('/home/placeholder/uberbondd/artifacts/life.json');
  assert.equal(verdict.allowed, false);
  assert.deepEqual(verdict.reasonCodes, ['private-data-may-not-enter-repository-path']);

  const result = capture([], 'placeholder thought', { destination: '/home/placeholder/uberbondd/src/life.mjs' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPTURE_DESTINATION_REFUSED');
  assert.deepEqual(result.reasonCodes, ['private-data-may-not-enter-repository-path']);
});

test('a relative or missing destination is refused rather than guessed', () => {
  assert.deepEqual(captureDestinationAllowed(null).reasonCodes, ['capture-destination-required']);
  assert.deepEqual(captureDestinationAllowed('life.jsonl').reasonCodes, ['private-destination-must-be-absolute']);
});

// ---- A captured Will Event is not a goal -----------------------------------

test('a captured will event does not appear as a goal, task or commitment', () => {
  const result = capture([], 'placeholder recurring thought about a possible direction', {
    willEventType: 'DESIRE'
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CAPTURE_RECORDED');
  assert.equal(result.record.capture.promotion, 'NONE');
  assert.match(result.promotionBoundary, /NOT A GOAL, KPI, TASK, OPTIMIZATION TARGET OR COMMITMENT/);

  // The reading a planner would do returns nothing until a person chose.
  assert.deepEqual(capturedCommitments(result.store), []);
  assert.equal(capturedWillEvents(result.store).length, 1);
});

test('promotion requires an explicit target and the founder stating it themselves', () => {
  const captured = capture([], 'placeholder thought about learning a language', { willEventType: 'CURIOSITY' });

  // No target: nothing to promote into, so nothing happens.
  const noTarget = promoteCapture({
    store: captured.store, captureId: captured.record.id, commitmentBody: 'placeholder commitment',
    authorization: OWNER, destination: OUTSIDE, now: CLOCK
  });
  assert.equal(noTarget.ok, false);
  assert.deepEqual(noTarget.reasonCodes, ['explicit-promotion-target-required']);

  // Target but no stated commitment: the system will not write the sentence for
  // the founder, because that sentence is the commitment.
  const noBody = promoteCapture({
    store: captured.store, captureId: captured.record.id, target: 'COMMITMENT',
    authorization: OWNER, destination: OUTSIDE, now: CLOCK
  });
  assert.equal(noBody.ok, false);
  assert.deepEqual(noBody.reasonCodes, ['founder-stated-commitment-body-required']);

  // Nothing that failed left a commitment behind.
  assert.deepEqual(capturedCommitments(captured.store), []);
});

test('an explicit promotion produces a commitment the founder wrote, beside the untouched thought', () => {
  const captured = capture([], 'placeholder thought about learning a language', { willEventType: 'CURIOSITY' });
  const promoted = promoteCapture({
    store: captured.store, captureId: captured.record.id, target: 'COMMITMENT',
    commitmentBody: 'placeholder commitment stated in the founder\'s own words',
    authorization: OWNER, destination: OUTSIDE, now: CLOCK
  });

  assert.equal(promoted.ok, true);
  assert.equal(promoted.status, 'CAPTURE_PROMOTED');
  assert.equal(promoted.record.capture.promotion, 'COMMITMENT');
  assert.equal(promoted.record.capture.promotedFrom, captured.record.id);
  assert.equal(promoted.record.body, 'placeholder commitment stated in the founder\'s own words');
  assert.notEqual(promoted.record.body, captured.record.body,
    'a promotion that copies the thought forward is the silent conversion this prevents');

  // The commitment derives from the thought, so deleting the thought reaches it.
  assert.deepEqual(promoted.record.derivedFrom, [captured.record.id]);

  assert.equal(capturedCommitments(promoted.store).length, 1);
  const source = promoted.store.find(row => row.id === captured.record.id);
  assert.equal(source.capture.promotion, 'NONE', 'promotion must not retroactively convert the thought');
  assert.ok(PROMOTION_TARGETS.includes('COMMITMENT'));
});

test('promotion of a capture that is not in the store is refused', () => {
  const result = promoteCapture({
    store: [], captureId: 'pcr_absent', target: 'GOAL', commitmentBody: 'placeholder',
    authorization: OWNER, destination: OUTSIDE, now: CLOCK
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['capture-not-found']);
});

// ---- do-not-persist never reaches the durable store ------------------------

test('a do-not-persist capture never reaches the durable store', () => {
  let store = [];
  store = capture(store, 'placeholder thought the founder is content to keep').store;
  const before = [...store];

  const ephemeral = captureWillEvent({
    store, utterance: 'placeholder thought marked do-not-persist',
    consent: ['DO_NOT_PERSIST'], authorization: OWNER, now: CLOCK
  });

  assert.equal(ephemeral.ok, true, 'a do-not-persist capture is heard, not refused');
  assert.equal(ephemeral.status, 'CAPTURE_HELD_NOT_PERSISTED');
  assert.equal(ephemeral.persisted, false);
  assert.deepEqual(ephemeral.store, before, 'the store must be byte-identical to before the capture');
  assert.equal(ephemeral.record, undefined);
  assert.equal(JSON.stringify(ephemeral).includes('marked do-not-persist'), false,
    'a not-persisted receipt carrying the utterance is a durable copy of it');
  assert.match(ephemeral.guarantee, /REACHES_NO_DURABLE_STORE/);
});

test('a do-not-persist capture handed a destination is refused rather than written', () => {
  // Nothing is stored, so nothing should be routed. A caller passing a
  // destination anyway has misunderstood the flag, and guessing on their behalf
  // is how the record ends up somewhere.
  const result = captureWillEvent({
    store: [], utterance: 'placeholder ephemeral thought', consent: ['DO_NOT_PERSIST'],
    authorization: OWNER, destination: OUTSIDE, now: CLOCK
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['do-not-persist-capture-may-not-be-routed-anywhere']);
});

// ---- Uncertainty is valid input --------------------------------------------

test('"I do not know what I want" is accepted as a capture, not rejected as malformed', () => {
  const result = capture([], 'I do not know what I want', { willEventType: 'UNCERTAINTY' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CAPTURE_RECORDED');
  assert.equal(result.record.body, 'I do not know what I want');
  assert.equal(result.record.capture.willEventType, 'UNCERTAINTY');
  assert.equal(result.record.capture.promotion, 'NONE',
    'an admission of uncertainty least of all becomes a goal');
  assert.ok(WILL_EVENT_TYPES.includes('UNCERTAINTY'));
  assert.ok(WILL_EVENT_TYPES.includes('CONTRADICTION'));
  assert.ok(WILL_EVENT_TYPES.includes('VETO'));
});

test('a contradiction is captured as itself rather than resolved on the way in', () => {
  let store = [];
  const first = capture(store, 'placeholder position X', { willEventType: 'DESIRE' });
  store = first.store;
  const second = capture(store, 'placeholder position not-X', { willEventType: 'CONTRADICTION' });
  assert.equal(second.ok, true);
  assert.equal(second.store.length, 2, 'both sides of a contradiction are held');
});

// ---- Non-totalization: no classification, no justification required --------

test('an unclassified and unexplained capture is still accepted', () => {
  // The minimum a founder should have to do to think out loud: say the thing.
  const result = captureWillEvent({
    store: [], utterance: 'placeholder half-formed thought', authorization: OWNER,
    destination: OUTSIDE, now: CLOCK
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.capture.willEventType, 'UNCLASSIFIED');
  assert.equal(result.record.interpretation, null, 'no explanation was demanded or invented');
  assert.equal(result.record.certainty, null);
  assert.deepEqual(result.consent, {
    doNotModel: false, doNotInferFrom: false, doNotPredictFrom: false,
    doNotPersist: false, rightNotToKnow: false
  });
});

test('an unrecognised will-event type is refused rather than filed as a stray thought', () => {
  const result = capture([], 'placeholder thought', { willEventType: 'DIAGNOSIS' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['valid-will-event-type-required']);
  assert.equal(WILL_EVENT_TYPES.includes('DIAGNOSIS'), false);
});

test('an empty utterance is refused, because there is nothing to hold', () => {
  for (const utterance of [null, '', '   ']) {
    const result = capture([], utterance);
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasonCodes, ['utterance-required']);
  }
});

// ---- Founder authority ------------------------------------------------------

test('capture without founder authorization is refused with a reason', () => {
  const forgeries = [
    undefined,
    { subject: 'AGENT', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-07T00:00:00.000Z' },
    { subject: 'FOUNDER', grant: 'READ_ONLY', issuedAt: '2026-09-07T00:00:00.000Z' },
    { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE' }
  ];
  for (const authorization of forgeries) {
    const result = captureWillEvent({
      store: [], utterance: 'placeholder thought', authorization, destination: OUTSIDE, now: CLOCK
    });
    assert.equal(result.ok, false, `${JSON.stringify(authorization)} must not authorize a capture`);
    assert.equal(result.status, 'CAPTURE_FOUNDER_AUTHORITY_REQUIRED');
    assert.deepEqual(result.reasonCodes, ['founder-authorization-required']);
    assert.equal(result.store, undefined);
  }
});

test('every capture-layer operation refuses without founder authorization', () => {
  const store = [{ id: 'a', derivedFrom: [], capture: { consent: {}, promotion: 'NONE' } }];
  const calls = [
    () => captureWillEvent({ store, utterance: 'placeholder', destination: OUTSIDE }),
    () => promoteCapture({ store, captureId: 'a', target: 'GOAL', commitmentBody: 'placeholder', destination: OUTSIDE }),
    () => deriveLivingModelFromCaptures({ store, claims: [{ body: 'c', derivedFrom: ['a'] }] })
  ];
  for (const call of calls) {
    const result = call();
    assert.equal(result.ok, false);
    assert.equal(result.status, 'CAPTURE_FOUNDER_AUTHORITY_REQUIRED');
  }
});

// ---- Consent normalization --------------------------------------------------

test('an unrecognised consent flag is refused rather than silently ignored', () => {
  // The founder who writes a flag believes they restricted something. Dropping
  // the word they used leaves them protected only in their own mind.
  const result = capture([], 'placeholder thought', { consent: ['DO_NOT_TRAIN'] });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPTURE_CONSENT_INVALID');
  assert.deepEqual(result.reasonCodes, ['unrecognised-consent-flag']);
  assert.deepEqual(result.unrecognisedFlags, ['DO_NOT_TRAIN']);

  const objectForm = capture([], 'placeholder thought', { consent: { doNotShare: true } });
  assert.equal(objectForm.ok, false);
  assert.deepEqual(objectForm.reasonCodes, ['unrecognised-consent-flag']);
});

test('consent is accepted as a flag list or as an object, with the same meaning', () => {
  const fromList = normalizeCaptureConsent(['DO_NOT_MODEL', 'RIGHT_NOT_TO_KNOW']);
  const fromObject = normalizeCaptureConsent({ doNotModel: true, rightNotToKnow: true });
  assert.equal(fromList.ok, true);
  assert.deepEqual(fromList.consent, fromObject.consent);
  assert.equal(fromList.consent.doNotModel, true);
  assert.equal(fromList.consent.doNotInferFrom, false);
  for (const flag of CAPTURE_CONSENT_FLAGS) {
    assert.equal(normalizeCaptureConsent([flag]).ok, true, `${flag} must be a recognised flag`);
  }
});

test('consent survives normalization instead of being dropped as an unknown field', () => {
  // The core normalizer keeps the fields it knows. Consent passed as an ordinary
  // record field would vanish here and the record would be modelled anyway.
  const result = capture([], 'placeholder guarded thought', { consent: ['DO_NOT_MODEL', 'DO_NOT_PREDICT_FROM'] });
  const stored = result.store.find(row => row.id === result.record.id);
  assert.equal(stored.capture.consent.doNotModel, true);
  assert.equal(stored.capture.consent.doNotPredictFrom, true);
  assert.equal(stored.capture.consent.doNotInferFrom, false);
});

// ---- Right not to know -------------------------------------------------------

test('findings drawn from a right-not-to-know record are withheld, bodies and all', () => {
  let store = [];
  const ordinary = capture(store, 'placeholder ordinary thought');
  store = ordinary.store;
  const silent = capture(store, 'placeholder thought about a topic the founder asked not to hear about', {
    consent: ['RIGHT_NOT_TO_KNOW']
  });
  store = silent.store;

  const partition = partitionFindingsForFounder({
    store,
    findings: [
      { body: 'placeholder deliverable finding', derivedFrom: [ordinary.record.id] },
      { body: 'placeholder withheld finding the founder asked not to receive', derivedFrom: [silent.record.id] }
    ]
  });

  assert.equal(partition.deliverableCount, 1);
  assert.equal(partition.withheldCount, 1);
  assert.equal(partition.deliverable[0].body, 'placeholder deliverable finding');
  assert.deepEqual(partition.withheld[0].blockedSourceIds, [silent.record.id]);
  assert.deepEqual(partition.withheld[0].reasonCodes, ['founder-asked-not-to-receive-findings-from-this-record']);
  assert.equal(JSON.stringify(partition).includes('withheld finding the founder asked not to receive'), false,
    'returning the withheld body delivers exactly what was withheld');
});

// ---- Composition with the core ------------------------------------------------

test('the same utterance captured twice does not become two records', () => {
  const first = capture([], 'placeholder repeated thought', { occurredAt: '2026-09-07T08:00:00.000Z' });
  const second = capture(first.store, 'placeholder repeated thought', { occurredAt: '2026-09-07T08:00:00.000Z' });
  assert.equal(second.status, 'CAPTURE_ALREADY_PRESENT');
  assert.equal(second.duplicate, true);
  assert.equal(second.store.length, 1);
});

test('a capture is private life data by default and carries no business authority', () => {
  const result = capture([], 'placeholder thought');
  assert.equal(result.record.privacyClass, 'PRIVATE_LIFE_DATA');
  assert.equal(result.record.kind, 'THOUGHT');
  assert.equal(result.businessEffectAuthority, 'NONE');
});
