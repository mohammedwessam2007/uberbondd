import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { inspectCapabilityGenome } from '../src/capability-genome-doctor.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

test('doctor fails closed when two records share one canonical capability identity', () => {
  const sourceRegistry = read('artifacts/capability-genome/source-registry.json');
  const atomTaxonomy = read('artifacts/capability-genome/capability-atoms.json');
  const normalizedRecordState = read('artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json');
  const records = structuredClone(normalizedRecordState.capabilities);
  assert.ok(records.length > 0, 'fixture requires at least one normalized capability');

  const duplicate = structuredClone(records[0]);
  duplicate.id = `${duplicate.id}.identity-collision`;
  duplicate.source.url = `${duplicate.source.url}#identity-collision`;
  records.push(duplicate);

  const manifest = {
    ...structuredClone(normalizedRecordState),
    capabilityRecordsNormalized: records.length,
    capabilities: records
  };

  const result = inspectCapabilityGenome({
    sourceRegistry,
    atomTaxonomy,
    capabilityRecords: records,
    normalizedRecordState: manifest,
    now: new Date('2026-09-02T03:35:00.000Z')
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPABILITY_GENOME_UNHEALTHY');
  assert.ok(result.reasonCodes.includes('unique-canonical-capability-identity-required'));
});

test('doctor fails closed when the same capability id is duplicated', () => {
  const sourceRegistry = read('artifacts/capability-genome/source-registry.json');
  const atomTaxonomy = read('artifacts/capability-genome/capability-atoms.json');
  const normalizedRecordState = read('artifacts/capability-genome/pilot/normalized-capability-records-2026-09-01.json');
  const records = structuredClone(normalizedRecordState.capabilities);
  assert.ok(records.length > 0, 'fixture requires at least one normalized capability');

  records.push(structuredClone(records[0]));
  const manifest = {
    ...structuredClone(normalizedRecordState),
    capabilityRecordsNormalized: records.length,
    capabilities: records
  };

  const result = inspectCapabilityGenome({
    sourceRegistry,
    atomTaxonomy,
    capabilityRecords: records,
    normalizedRecordState: manifest,
    now: new Date('2026-09-02T03:35:00.000Z')
  });

  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('unique-capability-id-required'));
  assert.ok(result.reasonCodes.includes('unique-canonical-capability-identity-required'));
});
