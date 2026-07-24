import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import {
  validateManifest, normalizeRecord, prepareImportBatch, importBatch,
  importCsvPack, importJsonPack, importJsonlPack, importMarkdownTablePack, precheckZipPack, ImporterError
} from '../../revenue-os/src/importer.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-importer-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function goodRow(overrides = {}) {
  return {
    organizationDomain: 'agency-one.example.com', channel: 'published_contact_form',
    sourceUrl: 'https://agency-one.example.com/contact', capturedAt: new Date().toISOString(),
    confidence: 0.85, verified: 'true', ...overrides
  };
}

// --- manifest validation ---

test('validateManifest rejects a missing declared file and a checksum mismatch', () => {
  const manifest = { files: [{ name: 'a.csv', sha256: 'deadbeef' }, { name: 'b.csv', sha256: 'x' }] };
  const result = validateManifest(manifest, [{ name: 'a.csv', content: 'not matching content' }]);
  assert.equal(result.valid, false);
  assert.ok(result.problems.some(p => p.code === 'manifest-checksum-mismatch'));
  assert.ok(result.problems.some(p => p.code === 'manifest-file-missing'));
});

test('validateManifest throws on a malformed manifest object rather than silently passing', () => {
  assert.throws(() => validateManifest({}, []), ImporterError);
  assert.throws(() => validateManifest(null, []), ImporterError);
});

// --- record normalization / quarantine reasons ---

test('normalizeRecord accepts a well-formed record', () => {
  const result = normalizeRecord(goodRow(), { packType: 'qualified_agency', packVersion: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.record.organizationDomain, 'agency-one.example.com');
  assert.ok(result.record.evidenceHash.length === 64);
});

test('normalizeRecord quarantines every distinct malformed-input category with a specific reason', () => {
  assert.ok(normalizeRecord(goodRow({ organizationDomain: 'not a domain' }), { packType: 'qualified_agency' }).reasons.includes('invalid-or-missing-domain'));
  assert.ok(normalizeRecord(goodRow({ channel: 'carrier_pigeon' }), { packType: 'qualified_agency' }).reasons.includes('unsupported-channel'));
  assert.ok(normalizeRecord(goodRow({ sourceUrl: '' }), { packType: 'qualified_agency' }).reasons.includes('missing-source-url'));
  assert.ok(normalizeRecord(goodRow({ capturedAt: 'not-a-date' }), { packType: 'qualified_agency' }).reasons.includes('missing-or-invalid-timestamp'));
  assert.ok(normalizeRecord(goodRow({ capturedAt: '2000-01-01T00:00:00.000Z' }), { packType: 'qualified_agency' }).reasons.includes('stale-evidence'));
  assert.ok(normalizeRecord(goodRow({ confidence: 1.5 }), { packType: 'qualified_agency' }).reasons.includes('invalid-confidence'));
  assert.ok(normalizeRecord(goodRow({ verified: 'false' }), { packType: 'qualified_agency' }).reasons.includes('inferred-contact-without-basis'));
  assert.ok(normalizeRecord(goodRow({ notes: 'bad�encoding' }), { packType: 'qualified_agency' }).reasons.includes('corrupted-encoding'));
  assert.ok(normalizeRecord(goodRow(), { packType: 'not-a-real-pack-type' }).reasons.includes('unknown-pack-type'));
});

// 24/7 Continuous Revenue Core, section 2 (preflight safety repair): a future-dated capturedAt
// previously passed silently, because (Date.now() - Date.parse(capturedAt)) goes negative for a
// future timestamp, which is always <= MAX_EVIDENCE_AGE_DAYS -- the staleness check alone never
// caught it. Fixed by an explicit clock-skew-bounded future check, reproduced here as a regression.
test('normalizeRecord rejects future-dated evidence rather than silently accepting it (regression)', () => {
  const farFuture = new Date(Date.now() + 30 * 86400000).toISOString();
  const result = normalizeRecord(goodRow({ capturedAt: farFuture }), { packType: 'qualified_agency' });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('future-dated-evidence'));
  assert.ok(!result.reasons.includes('stale-evidence'), 'a future date is not stale evidence, it is a distinct failure mode');
});

test('normalizeRecord still accepts a timestamp within the small clock-skew allowance', () => {
  const barelyFuture = new Date(Date.now() + 60000).toISOString(); // 1 minute
  const result = normalizeRecord(goodRow({ capturedAt: barelyFuture }), { packType: 'qualified_agency' });
  assert.equal(result.ok, true);
});

test('an inferred (unverified) contact with an explicit basis is accepted, not quarantined', () => {
  const result = normalizeRecord(goodRow({ verified: 'false', inferredBasis: 'role-based email pattern match' }), { packType: 'qualified_agency' });
  assert.equal(result.ok, true);
  assert.equal(result.record.verified, false);
});

// --- duplicate detection within one pack ---

test('prepareImportBatch dedupes within one pack (first-seen wins, duplicate quarantined)', () => {
  const { accepted, quarantined } = prepareImportBatch([goodRow(), goodRow()], { packType: 'qualified_agency' });
  assert.equal(accepted.length, 1);
  assert.equal(quarantined.length, 1);
  assert.deepEqual(quarantined[0].reasons, ['duplicate-domain-and-channel-in-pack']);
});

// --- import is idempotent against the store ---

test('importBatch is idempotent: re-importing the same pack skips already-existing opportunities', async () => {
  const store = await harness();
  const prepared = prepareImportBatch([goodRow()], { packType: 'qualified_agency' });
  const first = await importBatch(store, prepared);
  assert.equal(first.imported, 1);
  const second = await importBatch(store, prepared);
  assert.equal(second.imported, 0);
  assert.equal(second.skippedExisting, 1);
  assert.equal((await store.list('opportunities')).length, 1);
});

test('importBatch creates a real evidence item alongside every imported opportunity', async () => {
  const store = await harness();
  const prepared = prepareImportBatch([goodRow()], { packType: 'qualified_agency' });
  await importBatch(store, prepared);
  const evidence = await store.list('evidenceItems');
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].verified, true);
});

// --- CSV / JSON / JSONL / Markdown format entry points ---

test('importCsvPack parses and validates a real CSV pack end to end', () => {
  const csv = 'organizationDomain,channel,sourceUrl,capturedAt,confidence,verified\n' +
    `agency-two.example.com,published_email,https://agency-two.example.com,${new Date().toISOString()},0.7,true\n`;
  const { accepted } = importCsvPack(csv, { packType: 'buyer_intent' });
  assert.equal(accepted.length, 1);
});

test('importJsonPack accepts a bare array or a {records:[...]} object, and throws on malformed JSON', () => {
  const good = JSON.stringify([goodRow()]);
  assert.equal(importJsonPack(good, { packType: 'qualified_agency' }).accepted.length, 1);
  const wrapped = JSON.stringify({ records: [goodRow()] });
  assert.equal(importJsonPack(wrapped, { packType: 'qualified_agency' }).accepted.length, 1);
  assert.throws(() => importJsonPack('{not valid json', { packType: 'qualified_agency' }), ImporterError);
});

test('importJsonlPack isolates a malformed line as a quarantine entry rather than failing the whole pack', () => {
  const jsonl = `${JSON.stringify(goodRow())}\nnot valid json\n${JSON.stringify(goodRow({ organizationDomain: 'agency-three.example.com' }))}\n`;
  const { accepted, quarantined } = importJsonlPack(jsonl, { packType: 'qualified_agency' });
  assert.equal(accepted.length, 2);
  assert.ok(quarantined.some(q => q.reasons.includes('jsonl-parse-error')));
});

test('importMarkdownTablePack parses a hand-written pipe table', () => {
  const md = `| organizationDomain | channel | sourceUrl | capturedAt | confidence | verified |\n` +
    `|---|---|---|---|---|---|\n` +
    `| agency-four.example.com | published_email | https://agency-four.example.com | ${new Date().toISOString()} | 0.6 | true |\n`;
  const { accepted } = importMarkdownTablePack(md, { packType: 'proof_demo' });
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].organizationDomain, 'agency-four.example.com');
});

// --- archive pre-check (ZIP packs) ---

test('precheckZipPack rejects a traversal-shaped entry before any content is trusted', () => {
  const result = precheckZipPack([{ name: '../../etc/passwd', uncompressedSize: 10, compressedSize: 10 }]);
  assert.equal(result.safe, false);
});
