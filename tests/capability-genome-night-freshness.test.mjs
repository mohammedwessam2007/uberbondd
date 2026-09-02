import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inspectCapabilityGenome } from '../src/capability-genome-doctor.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

function fixtures() {
  const sourceRegistry = read('artifacts/capability-genome/source-registry.json');
  const atomTaxonomy = read('artifacts/capability-genome/capability-atoms.json');
  const corpusState = read('artifacts/capability-genome/pilot/world-repository-candidates-2026-08-31.json');
  const bodyCorpusState = read('artifacts/capability-genome/pilot/world-skill-bodies-2026-08-31.json');
  const normalizedRecordState = read('artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json');
  return { sourceRegistry, atomTaxonomy, corpusState, bodyCorpusState, normalizedRecordState };
}

const now = new Date('2026-09-02T04:30:00.000Z');

test('doctor fails closed on stale repository candidate corpus evidence', () => {
  const f = fixtures();
  f.corpusState = { ...f.corpusState, observedAt: '2026-06-01T00:00:00.000Z' };
  const result = inspectCapabilityGenome({
    ...f,
    capabilityRecords: f.normalizedRecordState.capabilities,
    now
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('repository-corpus-stale-or-future-dated'));
});

test('doctor fails closed on stale skill-body corpus evidence', () => {
  const f = fixtures();
  f.bodyCorpusState = { ...f.bodyCorpusState, observedAt: '2026-06-01T00:00:00.000Z' };
  const result = inspectCapabilityGenome({
    ...f,
    capabilityRecords: f.normalizedRecordState.capabilities,
    now
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('body-corpus-stale-or-future-dated'));
});

test('doctor fails closed on future-dated normalized capability evidence', () => {
  const f = fixtures();
  f.normalizedRecordState = { ...f.normalizedRecordState, observedAt: '2026-09-03T00:00:00.000Z' };
  const result = inspectCapabilityGenome({
    ...f,
    capabilityRecords: f.normalizedRecordState.capabilities,
    now
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('normalized-record-corpus-stale-or-future-dated'));
});
