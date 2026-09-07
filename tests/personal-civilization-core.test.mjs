import test from 'node:test';
import assert from 'node:assert/strict';
import {
  founderAuthorized,
  privateDestinationAllowed,
  normalizePrivateRecord,
  appendPrivateRecord,
  derivedClosure,
  deletePrivateRecords,
  exportPrivateState,
  deriveLivingModel,
  PRIVATE_RECORD_KINDS
} from '../src/personal-civilization-core.mjs';

// The two invariants this module exists for are asymmetric in cost. A refused
// write that should have been allowed is an inconvenience the owner notices
// immediately. A private record written into the repository, or a derived model
// that outlives the life event it was built from, is silent and permanent.
// So the tests below spend their weight on the second kind.

const OWNER = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-07T00:00:00.000Z' };
const OUTSIDE = '/home/mohamed/.uberbond-private/life.jsonl';

const thought = (body, extra = {}) => ({
  kind: 'THOUGHT', body, occurredAt: '2026-09-07T08:00:00.000Z', ...extra
});

const append = (store, input) =>
  appendPrivateRecord({ store, input, authorization: OWNER, destination: OUTSIDE });

// ---- Invariant 1: private data cannot reach a repository path --------------

test('a repository path is refused as a destination for private life data', () => {
  // Every one of these is a path something in this repo legitimately writes to,
  // which is exactly why the refusal has to be on the destination rather than on
  // the caller's intent -- the caller with the bug believes it is writing
  // somewhere safe.
  const repoPaths = [
    '/home/user/uberbondd/artifacts/life.json',
    '/home/user/uberbondd/docs/life.md',
    '/home/user/uberbondd/src/life.mjs',
    '/home/user/uberbondd/tests/fixtures/life.json',
    '/home/user/uberbondd/config/life.json',
    '/home/user/uberbondd/scripts/life.mjs',
    '/home/user/uberbondd/.git/life',
    '/anywhere/at/all/artifacts/nested/deep/life.json'
  ];
  for (const path of repoPaths) {
    const verdict = privateDestinationAllowed(path);
    assert.equal(verdict.allowed, false, `${path} must be refused`);
    assert.deepEqual(verdict.reasonCodes, ['private-data-may-not-enter-repository-path']);
  }
});

test('appending private life data to a repository path is refused, not logged', () => {
  const result = appendPrivateRecord({
    store: [], input: thought('a private thing'), authorization: OWNER,
    destination: '/home/user/uberbondd/artifacts/thought-ocean.jsonl'
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'PRIVATE_DESTINATION_REFUSED');
  // The refusal must not carry the body onward into whatever logs the result.
  assert.equal(JSON.stringify(result).includes('a private thing'), false,
    'a refusal that quotes the private body has leaked the thing it refused to write');
});

test('a record explicitly classed public may go where private data may not', () => {
  // The rule is about the data class, not about paths in general. Without this
  // the module would be unable to write its own non-private receipts, and the
  // pressure to add a bypass would land on the invariant instead.
  const result = appendPrivateRecord({
    store: [],
    input: thought('a published note', { privacyClass: 'PUBLIC_REPOSITORY_SAFE' }),
    authorization: OWNER,
    destination: '/home/user/uberbondd/artifacts/notes.json'
  });
  assert.equal(result.ok, true);
  assert.equal(result.record.privacyClass, 'PUBLIC_REPOSITORY_SAFE');
});

test('an unclassified record defaults to private, not to public', () => {
  const { record } = normalizePrivateRecord(thought('unlabelled'));
  assert.equal(record.privacyClass, 'PRIVATE_LIFE_DATA',
    'defaulting to public would make every forgotten field a leak');
});

test('a relative destination is refused, because it resolves against an unknown cwd', () => {
  // `artifacts/life.json` is a repository path when the process happens to be
  // in the repository. Refusing to guess is the only safe answer.
  assert.equal(privateDestinationAllowed('artifacts/life.json').allowed, false);
  assert.equal(privateDestinationAllowed('../life.json').allowed, false);
  assert.equal(privateDestinationAllowed('life.json').reasonCodes[0], 'private-destination-must-be-absolute');
});

// ---- Invariant 2: deletion reaches everything derived ----------------------

test('deleting a life event deletes the model built from it', () => {
  let store = [];
  const event = append(store, { kind: 'LIFE_EVENT', body: 'left the job', occurredAt: '2026-01-04T00:00:00.000Z' });
  store = event.store;

  const model = deriveLivingModel({
    store,
    claims: [{ body: 'prefers autonomy over security', derivedFrom: [event.record.id], certainty: 0.4 }],
    authorization: OWNER
  });
  store = model.store;
  assert.equal(model.derivedCount, 1);

  const deleted = deletePrivateRecords({ store, ids: [event.record.id], authorization: OWNER });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.store.length, 0,
    'a derived claim that survives its source is a copy of the deleted data under another name');
  assert.deepEqual(deleted.derivedAlsoDeleted, [model.derived[0].id]);
  assert.equal(deleted.guarantee, 'NO_RECORD_DERIVED_FROM_A_DELETED_RECORD_REMAINS');
});

test('deletion follows derivation transitively, not one level down', () => {
  // A model derived from a model derived from an event. One level of cascade
  // looks correct in every simple test and leaves the owner's data behind the
  // moment the graph gets a second hop -- which is the normal case for a system
  // that keeps refining its own conclusions.
  const store = [
    { id: 'a', kind: 'LIFE_EVENT', derivedFrom: [] },
    { id: 'b', kind: 'DERIVED_MODEL', derivedFrom: ['a'] },
    { id: 'c', kind: 'DERIVED_MODEL', derivedFrom: ['b'] },
    { id: 'd', kind: 'DERIVED_MODEL', derivedFrom: ['c'] },
    { id: 'unrelated', kind: 'THOUGHT', derivedFrom: [] }
  ];
  const closure = derivedClosure(store, ['a']);
  assert.deepEqual([...closure].sort(), ['a', 'b', 'c', 'd']);

  const deleted = deletePrivateRecords({ store, ids: ['a'], authorization: OWNER });
  assert.deepEqual(deleted.store.map(row => row.id), ['unrelated'],
    'only records with no path back to the deleted event may remain');
});

test('deletion is order-independent, because a store is not guaranteed sorted', () => {
  // The same graph as above, listed newest-first. A single pass over the store
  // happens to propagate the whole chain when parents precede children, so an
  // ordered fixture cannot tell a real closure apart from one pass. A store is
  // an array someone loaded from somewhere; nothing guarantees that order.
  const store = [
    { id: 'd', kind: 'DERIVED_MODEL', derivedFrom: ['c'] },
    { id: 'c', kind: 'DERIVED_MODEL', derivedFrom: ['b'] },
    { id: 'b', kind: 'DERIVED_MODEL', derivedFrom: ['a'] },
    { id: 'a', kind: 'LIFE_EVENT', derivedFrom: [] },
    { id: 'unrelated', kind: 'THOUGHT', derivedFrom: [] }
  ];
  assert.deepEqual([...derivedClosure(store, ['a'])].sort(), ['a', 'b', 'c', 'd']);
  const deleted = deletePrivateRecords({ store, ids: ['a'], authorization: OWNER });
  assert.deepEqual(deleted.store.map(row => row.id), ['unrelated']);
});

test('a record derived from several sources dies with any one of them', () => {
  // The conservative direction. A claim built from three events is partly each
  // of them; keeping it after one is deleted retains a piece of what was
  // removed. Requiring all three to be deleted first would be the leak.
  const store = [
    { id: 'e1', derivedFrom: [] },
    { id: 'e2', derivedFrom: [] },
    { id: 'model', derivedFrom: ['e1', 'e2'] }
  ];
  const deleted = deletePrivateRecords({ store, ids: ['e2'], authorization: OWNER });
  assert.deepEqual(deleted.store.map(row => row.id), ['e1']);
});

test('deletion reports ids it did not find rather than claiming success over them', () => {
  const store = [{ id: 'present', derivedFrom: [] }];
  const deleted = deletePrivateRecords({ store, ids: ['present', 'never-existed'], authorization: OWNER });
  assert.deepEqual(deleted.unknownIds, ['never-existed']);
  assert.deepEqual(deleted.deletedIds, ['present']);
});

test('a deletion receipt names ids and never the deleted content', () => {
  let store = [];
  const secret = append(store, thought('the specific private sentence'));
  store = secret.store;
  const deleted = deletePrivateRecords({ store, ids: [secret.record.id], authorization: OWNER });
  assert.equal(JSON.stringify(deleted).includes('the specific private sentence'), false,
    'a receipt that quotes the body preserves exactly what the deletion destroyed');
});

test('a derivation cycle terminates instead of hanging the deletion', () => {
  // Two records citing each other should not be constructible, but a store is
  // data and data arrives corrupted. A right-to-delete that hangs is a
  // right-to-delete that does not exist.
  const store = [
    { id: 'x', derivedFrom: ['y'] },
    { id: 'y', derivedFrom: ['x'] }
  ];
  assert.deepEqual([...derivedClosure(store, ['x'])].sort(), ['x', 'y']);
});

// ---- Founder authority -----------------------------------------------------

test('every private-state operation refuses without founder authorization', () => {
  const store = [{ id: 'a', derivedFrom: [] }];
  const calls = [
    () => appendPrivateRecord({ store, input: thought('x'), destination: OUTSIDE }),
    () => deletePrivateRecords({ store, ids: ['a'] }),
    () => exportPrivateState({ store, destination: OUTSIDE }),
    () => deriveLivingModel({ store, claims: [{ body: 'c', derivedFrom: ['a'] }] })
  ];
  for (const call of calls) {
    const result = call();
    assert.equal(result.ok, false);
    assert.equal(result.status, 'PRIVATE_STATE_FOUNDER_AUTHORITY_REQUIRED');
  }
});

test('a plausible-looking authorization is not an authorization', () => {
  // Each of these is what an autonomous lane would construct if it were trying
  // to look authorized rather than be authorized.
  const forgeries = [
    true,
    'FOUNDER',
    { subject: 'FOUNDER' },
    { subject: 'AGENT', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-07T00:00:00.000Z' },
    { subject: 'FOUNDER', grant: 'READ_ONLY', issuedAt: '2026-09-07T00:00:00.000Z' },
    { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: 'whenever' },
    { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE' }
  ];
  for (const forgery of forgeries) {
    assert.equal(founderAuthorized(forgery), false, `${JSON.stringify(forgery)} must not authorize`);
  }
  assert.equal(founderAuthorized(OWNER), true);
});

// ---- Provenance, append-only, export ---------------------------------------

test('a derived claim with no provenance is refused rather than stored', () => {
  // Storing it would create a record deletion can never reach correctly: it
  // came from the owner's life but names nothing, so no deletion of any event
  // would ever remove it.
  const store = [{ id: 'src', derivedFrom: [] }];
  const model = deriveLivingModel({
    store,
    claims: [
      { body: 'floating conclusion' },
      { body: 'cites a record that is not here', derivedFrom: ['ghost'] },
      { body: 'properly sourced', derivedFrom: ['src'] }
    ],
    authorization: OWNER
  });
  assert.equal(model.derivedCount, 1);
  assert.equal(model.refusedCount, 2);
  assert.deepEqual(model.refused[0].reasonCodes, ['claim-provenance-required']);
  assert.deepEqual(model.refused[1].reasonCodes, ['claim-cites-absent-records']);
});

test('a derived claim carries a truth boundary, not a verdict about a person', () => {
  const store = [{ id: 'src', derivedFrom: [] }];
  const model = deriveLivingModel({ store, claims: [{ body: 'c', derivedFrom: ['src'] }], authorization: OWNER });
  assert.match(model.truthBoundary, /NOT A TRAIT, DIAGNOSIS, OR PERMANENT FACT/);
  assert.equal(model.businessEffectAuthority, 'NONE');
});

test('the same record appended twice does not become two records', () => {
  const first = append([], thought('same thought'));
  const second = append(first.store, thought('same thought'));
  assert.equal(second.duplicate, true);
  assert.equal(second.store.length, 1);
});

test('an interpretation is stored beside the body, never merged into it', () => {
  const { record } = normalizePrivateRecord(thought('slept badly', {
    interpretation: 'possibly anxious about the launch', certainty: 0.3
  }));
  assert.equal(record.body, 'slept badly');
  assert.equal(record.interpretation, 'possibly anxious about the launch');
  assert.equal(record.certainty, 0.3);
});

test('an out-of-range certainty is dropped rather than clamped into a claim', () => {
  for (const certainty of [1.5, -0.2, 'high', NaN]) {
    assert.equal(normalizePrivateRecord(thought('x', { certainty })).record.certainty, null);
  }
});

test('an unrecognised record kind is refused', () => {
  const result = normalizePrivateRecord({ kind: 'DIAGNOSIS', body: 'x', occurredAt: '2026-09-07T00:00:00.000Z' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-record-kind-required'));
  assert.equal(PRIVATE_RECORD_KINDS.includes('DIAGNOSIS'), false);
});

test('an export states completeness against the store it was taken from', () => {
  const store = [{ id: 'a', derivedFrom: [] }, { id: 'b', derivedFrom: [] }];
  const exported = exportPrivateState({ store, authorization: OWNER, destination: OUTSIDE });
  assert.equal(exported.completeness.complete, true);
  assert.equal(exported.completeness.storeCount, 2);
  assert.equal(exported.recordCount, 2);
  assert.match(exported.digest, /^[0-9a-f]{64}$/);
});

test('an export to a repository path is refused like any other private write', () => {
  const exported = exportPrivateState({
    store: [], authorization: OWNER, destination: '/home/user/uberbondd/artifacts/export.json'
  });
  assert.equal(exported.ok, false);
  assert.equal(exported.status, 'PRIVATE_DESTINATION_REFUSED');
});
