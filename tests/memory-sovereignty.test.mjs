import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retain, forgetFromUse, rediscover, disclosure, noUberBondView,
  posthumousDisposition, continuityPosture, mayInferFrom,
  MEMORY_LAYERS, INFERABLE_LAYERS, POSTHUMOUS_DISPOSITIONS
} from '../src/memory-sovereignty.mjs';

// "We have the data but we do not infer from it" is a promise no store keeps by
// accident. So opacity is enforced where inference happens, not promised in a
// policy -- and the tests are about the paths that would quietly break it.

test('an opaque record cannot sit in a layer the system infers from', () => {
  const conflict = retain({ about: 'a hard year', layer: 'ACTIVE_MODEL', doNotInfer: true });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 'OPACITY_CONFLICT');
  assert.match(conflict.note, /a promise the store cannot keep/);
});

test('opacity is decided by the layer, not by the caller wanting the correlation', () => {
  for (const layer of INFERABLE_LAYERS) {
    assert.equal(mayInferFrom({ layer }), true);
    assert.equal(mayInferFrom({ layer, doNotInfer: true }), false, 'the mark wins over the layer');
  }
  for (const layer of ['RAW_ARCHIVE', 'DORMANT', 'FORGOTTEN_FROM_USE']) {
    assert.equal(mayInferFrom({ layer }), false, `${layer} must never inform an inference`);
  }
});

test('forgetting from use keeps the record and drops its claim on the present', () => {
  // Deleting would lose the history that makes a change of mind legible;
  // keeping it active lets a person's past keep voting on their present.
  const held = retain({ about: 'what he said at twenty', layer: 'SEMANTIC' }).record;
  const forgotten = forgetFromUse({ record: held, reason: 'no longer who he is' });
  assert.equal(forgotten.record.layer, 'FORGOTTEN_FROM_USE');
  assert.equal(forgotten.record.identityRelevant, false);
  assert.equal(forgotten.stillRetained, true);
  assert.match(forgotten.law, /HISTORICAL_TRUTH_IS_NOT_A_PSYCHOLOGICAL_OBLIGATION/);
});

test('forgetting requires a reason, and rediscovery requires a trigger', () => {
  const held = retain({ about: 'x', layer: 'SEMANTIC' }).record;
  assert.equal(forgetFromUse({ record: held }).ok, false);
  const dormant = forgetFromUse({ record: held, reason: 'decayed' }).record;
  const untriggered = rediscover({ record: dormant });
  assert.equal(untriggered.ok, false);
  assert.match(untriggered.note, /which is what decay was for/);
});

test('an opaque record cannot be rediscovered back into inference', () => {
  // The obvious route around opacity: file it away, then bring it back.
  const opaque = retain({ about: 'a private matter', layer: 'RAW_ARCHIVE', doNotInfer: true }).record;
  const attempted = rediscover({ record: opaque, trigger: 'it became relevant' });
  assert.equal(attempted.ok, false);
  assert.deepEqual(attempted.reasonCodes, ['opaque-record-may-not-be-rediscovered-into-inference']);
});

test('a standing request not to know is honoured, and research continues privately', () => {
  const withheld = disclosure({ finding: 'a probability he asked not to hear', founderAsked: false });
  assert.equal(withheld.status, 'WITHHELD_BY_STANDING_REQUEST');
  assert.match(withheld.note, /does not get pushed into his awareness/);
});

test('something that cannot be unlearned is offered rather than handed over', () => {
  const offered = disclosure({ finding: 'x', irreversibleOnceLearned: true });
  assert.equal(offered.status, 'OFFER_BEFORE_TELLING');
  assert.match(offered.note, /cannot be unlearned/);
});

test('a prior captured after the recommendation is a reaction, not an independent view', () => {
  const contaminated = noUberBondView({
    question: 'should he move', founderPrior: 'I think yes', capturedBeforeRecommendation: false
  });
  assert.equal(contaminated.ok, false);
  assert.equal(contaminated.status, 'NO_UBERBOND_VIEW_CONTAMINATED');
  assert.match(contaminated.note, /a reaction to it/);
});

test('an independent prior is captured before the system speaks', () => {
  const clean = noUberBondView({
    question: 'x', founderPrior: 'my instinct is no', capturedBeforeRecommendation: true
  });
  assert.equal(clean.ok, true);
  assert.match(clean.purpose, /NOTICE LATER IF THE FRAMING MOVED HIM/);
});

test('nothing but the founder decides what becomes of an accumulated life', () => {
  const assumed = posthumousDisposition({ disposition: 'PUBLIC_RELEASE' });
  assert.equal(assumed.ok, false);
  assert.match(assumed.note, /Nobody else, and no default/);

  const stated = posthumousDisposition({ disposition: 'PRIVATE_ARCHIVE', statedByFounder: true });
  assert.equal(stated.ok, true);
  assert.equal(stated.disposition, 'PRIVATE_ARCHIVE');
});

test('the default disposition is UNDECIDED and the system never resolves it', () => {
  const unset = posthumousDisposition({});
  assert.equal(unset.disposition, 'UNDECIDED');
  assert.match(unset.law, /DOES_NOT_BECOME_SOMEONE_ELSES_DATASET_BY_DEFAULT/);
  assert.ok(POSTHUMOUS_DISPOSITIONS.includes('DESTROY'));
});

test('a record readable only through a running service is at risk', () => {
  const posture = continuityPosture({
    records: [
      { about: 'the archive', portableFormat: true, requiresRunningService: false },
      { about: 'the graph', portableFormat: true, requiresRunningService: true },
      { about: 'the notes', portableFormat: false }
    ]
  });
  assert.equal(posture.status, 'CONTINUITY_AT_RISK');
  assert.deepEqual(posture.atRisk, ['the graph', 'the notes']);
  assert.equal(MEMORY_LAYERS.includes('RAW_ARCHIVE'), true);
});
