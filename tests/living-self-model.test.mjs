import test from 'node:test';
import assert from 'node:assert/strict';
import {
  observe, preferenceProvenance, metaVolition, livingModel, unknownSelfProbes,
  OBSERVATION_KINDS, DURABLE_KINDS, PREFERENCE_ORIGINS
} from '../src/living-self-model.mjs';

// Personalization fails in a characteristic direction: it learns what someone
// did, recommends more of it, and the model quietly replaces the person's
// ability to become someone else. Canon names the mechanism -- identity
// compression, where "inexperienced at X" becomes "bad at X".

test('a durable claim from one context is refused as identity compression', () => {
  // "He is not a morning person", derived from a fortnight of bad sleep.
  const refused = observe({
    about: 'dislikes early starts', kind: 'DURABLE_PREFERENCE', contexts: ['a fortnight of bad sleep']
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 'IDENTITY_COMPRESSION_REFUSED');
  assert.match(refused.note, /One context is a situation, not a person/);
});

test('a durable claim across varied contexts is allowed', () => {
  const allowed = observe({
    about: 'dislikes early starts', kind: 'DURABLE_PREFERENCE',
    contexts: ['well rested', 'on holiday', 'after a good week']
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.observation.durable, true);
});

test('non-durable kinds record freely, because they claim nothing about the person', () => {
  for (const kind of ['TEMPORARY_STATE', 'ENVIRONMENT_EFFECT', 'INSUFFICIENT_EXPOSURE', 'HABIT', 'SELF_STORY', 'SKILL_LEVEL']) {
    const built = observe({ about: 'x', kind, contexts: ['one context'] });
    assert.equal(built.ok, true, `${kind} must be recordable from a single context`);
    assert.equal(built.observation.durable, false);
  }
  assert.deepEqual(DURABLE_KINDS, ['DURABLE_PREFERENCE', 'CHOSEN_VALUE']);
});

test('competing readings are preserved rather than resolved', () => {
  const observed = observe({
    about: 'avoids large groups', kind: 'HABIT', contexts: ['work events'],
    alternativeReadings: ['prefers depth to breadth', 'has not found the right group', 'is tired this season']
  });
  const model = livingModel({ observations: [observed.observation] });
  assert.equal(model.contestedClaims.length, 1);
  assert.equal(model.contestedClaims[0].readings.length, 3,
    'the system does not get to pick which explanation of a person is true');
});

test('the model states it describes Mohamed(t) and predicts nothing about who he becomes', () => {
  const model = livingModel({ observations: [] });
  assert.match(model.law, /THIS IS MOHAMED\(t\), NOT MOHAMED/);
  assert.match(model.law, /NONE PREDICTS WHO HE MAY BECOME/);
});

// ---- Provenance -------------------------------------------------------------

test('origin is shown and never judged authentic or inauthentic', () => {
  // Marking socially-pressured wants inauthentic is the system deciding which
  // of a person's desires count -- the capture it exists to prevent.
  const traced = preferenceProvenance({
    preference: 'wants the senior title', origins: ['SOCIAL_PRESSURE', 'STATUS']
  });
  assert.equal(traced.ruling, 'NONE');
  assert.match(traced.boundary, /NO ORIGIN MAKES A PREFERENCE AUTHENTIC OR INAUTHENTIC/);
  assert.equal(Object.hasOwn(traced, 'authentic'), false);
});

test('endorsement is recorded from the founder, never inferred', () => {
  const traced = preferenceProvenance({ preference: 'x', origins: ['REPEATED_REFLECTION'] });
  assert.equal(traced.currentlyEndorsed, null, 'reflection does not imply endorsement');
  assert.ok(PREFERENCE_ORIGINS.includes('UNKNOWN'));
});

test('an untraced preference reads UNKNOWN rather than defaulting to a flattering origin', () => {
  assert.deepEqual(preferenceProvenance({ preference: 'x' }).origins, ['UNKNOWN']);
  assert.deepEqual(preferenceProvenance({ preference: 'x', origins: ['NOT_A_REAL_ORIGIN'] }).origins, ['UNKNOWN']);
});

// ---- Meta-volition ----------------------------------------------------------

test('a want and a wanting-to-want are kept apart, and conflict is not resolved', () => {
  // A system that cannot tell these apart optimizes toward whatever someone
  // currently craves, which is not what they would choose.
  const recorded = metaVolition({ wants: 'to keep scrolling', wantsToWant: 'to want to read instead' });
  assert.equal(recorded.conflict, true);
  assert.equal(recorded.resolution, 'NONE');
  assert.match(recorded.boundary, /THE SYSTEM DOES NOT PICK BETWEEN THEM/);
});

test('no second-order statement means no conflict, not a conflict resolved', () => {
  const recorded = metaVolition({ wants: 'to move abroad' });
  assert.equal(recorded.conflict, false);
  assert.equal(recorded.wantsToWant, null, 'absent, rather than defaulted to the first-order want');
  assert.equal(recorded.resolution, 'NONE');
});

// ---- Unknown self -----------------------------------------------------------

test('probes are ranked by what is untested, not by predicted enjoyment', () => {
  // Predicted enjoyment is the cage: it can only ever return more of what the
  // past already showed.
  const probes = unknownSelfProbes({
    untestedDomains: ['sailing', 'teaching', 'ceramics'],
    pastExposure: ['teaching']
  });
  assert.deepEqual(probes.probes, ['sailing', 'ceramics']);
  assert.equal(JSON.stringify(probes).includes('predictedEnjoyment'), false);
  assert.match(probes.law, /CANNOT_FIND_WHAT_REALITY_HAS_NEVER_EXPOSED/);
});

test('the observation vocabulary distinguishes state, environment and exposure from preference', () => {
  for (const kind of ['TEMPORARY_STATE', 'ENVIRONMENT_EFFECT', 'INSUFFICIENT_EXPOSURE']) {
    assert.ok(OBSERVATION_KINDS.includes(kind));
    assert.equal(DURABLE_KINDS.includes(kind), false, `${kind} must never be durable`);
  }
});
