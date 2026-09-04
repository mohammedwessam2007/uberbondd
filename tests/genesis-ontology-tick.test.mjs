import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('scientist and evolution receipts reach ONTOGENESIS as candidate vocabulary only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-ontogenesis-'));
  const scientist = path.join(dir, 'scientist.json');
  const evolution = path.join(dir, 'evolution.json');
  const output = path.join(dir, 'ontology.json');
  fs.writeFileSync(scientist, JSON.stringify({ laboratories: [{
    signalId: 'signal-x',
    primitive: 'machine-native buyer proof protocol',
    protocol: { protocol: { falsifiers: ['agent buyer ignores human-style social proof'] } },
    causal: { genome: { edges: [{ from: 'proof-structure', to: 'agent-acceptance', evidenceClass: 'HYPOTHESIS' }] } }
  }] }, null, 2));
  fs.writeFileSync(evolution, JSON.stringify({ cycles: [{
    ok: true,
    signalId: 'signal-x',
    antiUberBond: { challenges: [{ assumption: 'human buyers dominate', counterTheory: 'machine buyers form a distinct demand mechanism' }] },
    redQueen: { disagreement: true }
  }] }, null, 2));
  const run = spawnSync(process.execPath, ['scripts/genesis-ontology-tick.mjs', '--scientist', scientist, '--evolution', evolution, '--output', output], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.ok(receipt.summary.candidateConcepts > 0);
  assert.ok(receipt.summary.generatedQuestions > 0);
  assert.equal(receipt.summary.promotionProposals > 0, true);
  assert.ok(receipt.cycle.candidates.every(concept => concept.status === 'CANDIDATE'));
  assert.equal(receipt.cycle.evolution.promotionAuthority, 'NONE');
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.match(receipt.truthBoundary, /NO_CONCEPT_IS_EXTERNAL_FACT/);
});
