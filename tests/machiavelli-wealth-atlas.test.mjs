import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const CORPUS_DIR = 'artifacts/research/founder-moonshot-literal-corpus/';
const atlas = JSON.parse(readFileSync('artifacts/machiavelli/wealth-mechanism-atlas.json', 'utf8'));
const corpus = readdirSync(CORPUS_DIR).filter(name => /^founder-moonshots-.*\.json$/.test(name))
  .flatMap(name => JSON.parse(readFileSync(CORPUS_DIR + name, 'utf8')).entries);

test('atlas covers all 890 founder ideas exactly once, by stable ID', () => {
  assert.equal(corpus.length, 890);
  const ids = atlas.records.map(record => record.id);
  assert.equal(ids.length, 890, 'one record per founder idea, no merges, no drops');
  assert.equal(new Set(ids).size, 890);
  for (let n = 1; n <= 890; n += 1) assert.ok(ids.includes(`founder-moonshot-${String(n).padStart(4, '0')}`), `missing ${n}`);
});

test('atlas titles are literal corpus titles (distinct bodies such as 0625/0683 kept apart)', () => {
  const byId = new Map(atlas.records.map(record => [record.id, record]));
  const normalise = value => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
  for (const entry of corpus) {
    const record = byId.get(`founder-moonshot-${String(entry.ordinal).padStart(4, '0')}`);
    assert.equal(normalise(record.title), normalise(entry.literalTitle), `title drift at ${entry.ordinal}`);
  }
});

test('atlas classifications use the declared vocabulary and stay honest about money', () => {
  const families = new Set(atlas.families);
  for (const record of atlas.records) {
    assert.ok(['DIRECT', 'INDIRECT', 'NONE'].includes(record.economicRelevance), record.id);
    assert.ok(record.families.length >= 1 && record.families.every(family => families.has(family)), record.id);
    if (record.families.includes('NONE')) assert.equal(record.families.length, 1, `${record.id}: NONE must stand alone`);
    if (record.economicRelevance === 'NONE') assert.notEqual(record.buildableToday, 'NOW_SOFTWARE_ONLY', `${record.id}: no economic mechanism cannot be a buildable paid product`);
  }
  assert.equal(atlas.truthBoundary.implementedClaim, false);
  assert.equal(atlas.truthBoundary.revenueClaim, false);
  assert.ok(atlas.realityCatalogue.mechanisms.length >= 20);
});
