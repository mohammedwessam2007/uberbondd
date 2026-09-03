import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('hourly GENESIS metabolism tick consumes upstream receipts and persists a zero-effect artifact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-genesis-metabolism-'));
  const gamechanger = path.join(dir, 'gamechanger.json');
  const evolution = path.join(dir, 'evolution.json');
  const scientist = path.join(dir, 'scientist.json');
  const ontology = path.join(dir, 'ontology.json');
  const output = path.join(dir, 'metabolism.json');

  fs.writeFileSync(gamechanger, JSON.stringify({
    frontierSignals: [
      { id: 'signal-a', source: 'independent-a', domains: ['AI_MODELS'], confidence: 80, scores: { consequence: 20 } },
      { id: 'signal-b', source: 'independent-b', domains: ['PAYMENTS'], confidence: 55, scores: { consequence: 30 } }
    ],
    providers: [{ id: 'p1', capabilities: ['research'] }, { id: 'p2', capabilities: ['research'] }],
    removedProvider: 'p1',
    providerDependencies: [{ id: 'research-worker', dependencies: ['p1'] }],
    providerShocks: [{ provider: 'p1' }]
  }));
  fs.writeFileSync(evolution, JSON.stringify({
    cycles: [{ portfolio: { options: [{ hypothesis: { buyer: 'agency', mechanismSketch: 'evidence reconciliation', laborCost: 15 } }] } }]
  }));
  fs.writeFileSync(scientist, JSON.stringify({
    laboratories: [{ signalId: 'signal-a', status: 'SCIENTIST_LAB_READY' }],
    observations: [{ supports: 'signal-a', weight: 2 }]
  }));
  fs.writeFileSync(ontology, JSON.stringify({
    cycle: { candidates: [{ name: 'proof latency', uncertainty: 60, consequence: 30 }] }
  }));

  const run = spawnSync(process.execPath, [
    'scripts/genesis-metabolism-tick.mjs',
    '--gamechanger', gamechanger,
    '--evolution', evolution,
    '--scientist', scientist,
    '--ontology', ontology,
    '--output', output
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const receipt = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(receipt.schemaVersion, 'uberbond.genesis-metabolism.tick.v1');
  assert.equal(receipt.status, 'GENESIS_METABOLISM_READY');
  assert.equal(receipt.inputCounts.frontierSignals, 2);
  assert.equal(receipt.inputCounts.evolutionCycles, 1);
  assert.equal(receipt.inputCounts.scientistLabs, 1);
  assert.equal(receipt.inputCounts.ontologyCandidates, 1);
  assert.equal(receipt.organs.venture.status, 'COMPANY_PHENOTYPE_COMPILED');
  assert.equal(receipt.organs.shocks.status, 'INFRASTRUCTURE_SHOCK_UNIVERSE_READY');
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.deepEqual(receipt.externalEffectLedger, {
    messages: 0,
    moneyMovements: 0,
    purchases: 0,
    deployments: 0,
    customerStateMutations: 0,
    providerCalls: 0
  });
});
