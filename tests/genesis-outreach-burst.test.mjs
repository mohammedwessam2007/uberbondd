import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileGenesisBurstRegistry } from '../src/genesis-burst-registry.mjs';
import { loadFounderMoonshotLiteralCorpus } from '../src/founder-moonshot-literal-corpus.mjs';
import { buildBurst, runWallbreaker, OUTREACH_BURST_PATH, OUTREACH_WALLBREAKER_PATH, OUTREACH_BURST_ID } from '../scripts/genesis-outreach-burst.mjs';

const read = p => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));

test('every indexed GENESIS burst, including the outreach burst, recompiles through the registry', () => {
  const index = read('artifacts/genesis/GENESIS_BURST_INDEX.json');
  const bursts = index.bursts.map(b => ({ burstId: b.burstId, artifactRef: b.artifactRef, payload: read(b.artifactRef) }));
  const registry = compileGenesisBurstRegistry({ bursts });
  assert.equal(registry.status, 'GENESIS_BURST_REGISTRY_READY', JSON.stringify(registry.reasonCodes));
  assert.ok(registry.bursts.some(b => b.burstId === OUTREACH_BURST_ID && b.materializedCandidateCount === 12));
});

test('the committed outreach burst is exactly what the generator script produces', () => {
  const { compiled, artifact } = buildBurst();
  assert.equal(compiled.status, 'GENESIS_IDEA_BURST_READY');
  assert.deepEqual(read(OUTREACH_BURST_PATH), JSON.parse(JSON.stringify(artifact)));
  assert.deepEqual(read(OUTREACH_WALLBREAKER_PATH), JSON.parse(JSON.stringify(runWallbreaker())));
});

test('every outreach candidate descends from real founder moonshots in the immutable 890 corpus', async () => {
  const corpus = await loadFounderMoonshotLiteralCorpus();
  const ids = new Set(corpus.entries.map(e => e.stableId));
  const burst = read(OUTREACH_BURST_PATH);
  for (const candidate of burst.candidates) {
    assert.ok(candidate.moonshotAffinity.length >= 2, candidate.id);
    for (const id of candidate.moonshotAffinity) assert.ok(ids.has(id), `${candidate.id} -> ${id}`);
  }
  const titles = Object.fromEntries(corpus.entries.map(e => [e.stableId, e.literalTitle]));
  assert.equal(titles['founder-moonshot-0161'], 'THE CONSENT PROTOCOL');
  assert.equal(titles['founder-moonshot-0306'], 'THE PROOF-OF-VALUE PRIMITIVE');
});

test('realized candidates point at modules that exist; the rest stay hypotheses', () => {
  const burst = read(OUTREACH_BURST_PATH);
  for (const candidate of burst.candidates) {
    if (candidate.realization.module) assert.ok(fs.existsSync(new URL(`../${candidate.realization.module}`, import.meta.url)), candidate.realization.module);
    if (candidate.realization.state === 'HYPOTHESIS') assert.equal(candidate.realization.module, undefined);
  }
  assert.equal(burst.businessEffectAuthority, 'NONE');
});

test('the Wallbreaker tournament refuses spend, authority and the falsified cold-email-only assumption', () => {
  const wall = read(OUTREACH_WALLBREAKER_PATH);
  assert.equal(wall.businessEffectAuthority, 'NONE');
  const rejected = Object.fromEntries(wall.rejected.map(r => [r.candidate.id, r.reasonCodes]));
  assert.ok(rejected['cold-email-canary'].includes('spend-ceiling-violation'));
  assert.ok(rejected['cold-email-canary'].includes('relies-on-falsified-assumption'));
  assert.ok(rejected['postal-bridge'].includes('spend-ceiling-violation'));
  assert.ok(rejected['public-xray-deploy'].includes('authority-boundary-violation'));
  assert.ok(wall.selected.eligible);
  assert.ok(Object.values(wall.externalEffectLedger).every(v => v === 0));
});
