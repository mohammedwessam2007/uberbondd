import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tickScript = resolve(root, 'scripts/perpetual-frontier-genesis-tick.mjs');

test('GENESIS tick activates bounded million-branch ideation and Sovereign Expansion lenses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'uberbond-million-branch-tick-'));
  const input = join(dir, 'gamechanger.json');
  const output = join(dir, 'genesis.json');
  writeFileSync(input, JSON.stringify({
    schemaVersion: 'uberbond.gamechanger-mesh.tick.v2',
    generatedAt: '2026-09-10T17:00:00Z',
    frontierSignals: [{
      id: 'neuro-interface-frontier',
      summary: 'A public neuroengineering interface makes silent intent sensing cheaper.',
      evidenceRefs: ['https://example.com/evidence'],
      claims: ['silent-intent-sensing'],
      domains: ['neuroengineering'],
      publishedAt: '2026-09-10T16:58:00Z',
      observedAt: '2026-09-10T17:00:00Z'
    }],
    intelligencePackets: [{ signalId: 'neuro-interface-frontier', reasonCodes: [] }]
  }, null, 2));

  const run = spawnSync(process.execPath, [tickScript, '--input', input, '--output', output, '--dry-run'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(receipt.schemaVersion, 'uberbond.perpetual-frontier-genesis.tick.v3');
  assert.equal(receipt.summary.ideationActivations, 1);
  assert.equal(receipt.summary.selectedIdeationGenerators, 12);
  assert.equal(receipt.summary.projectedFirstGenerationCapacity, 600);
  assert.equal(receipt.summary.expansionActivations, 1);
  assert.equal(receipt.summary.selectedExpansionLenses, 16);
  const ideation = receipt.cycles[0].ideation;
  assert.equal(ideation.ok, true);
  assert.equal(ideation.status, 'MILLION_BRANCH_IDEATION_ACTIVATION_READY');
  assert.equal(ideation.totalGeneratorCount, 1000);
  assert.equal(ideation.wholeGenomeFirstGenerationCapacity, 50000);
  assert.ok(ideation.selectedGenerators.every(item => item.domainId === 'neuroengineering-human-ai-symbiosis'));
  const expansion = receipt.cycles[0].expansion;
  assert.equal(expansion.ok, true);
  assert.equal(expansion.status, 'SOVEREIGN_EXPANSION_READY');
  assert.equal(expansion.totalLensCount, 40);
  assert.equal(expansion.selectedLensCount, 16);
  const lensIds = expansion.selectedLenses.map(item => item.id);
  for (const id of ['missing-uberbond', 'ontology-stress', 'possibility-derivative', 'bottleneck-gradient', 'reality-contact', 'self-completion-attractor']) assert.ok(lensIds.includes(id), id);
  assert.equal(expansion.businessEffectAuthority, 'NONE');
  assert.equal(expansion.externalEffectAuthority, 'NONE');
  assert.equal(ideation.businessEffectAuthority, 'NONE');
  assert.equal(ideation.externalEffectAuthority, 'NONE');
  assert.match(receipt.truthBoundary, /EXPANSION_LENSES_ARE_INTERNAL_RESEARCH/);
});
