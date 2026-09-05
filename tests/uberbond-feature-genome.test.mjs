import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyFeaturePath,
  deriveModuleEdgesFromText,
  buildUberBondFeatureGenome,
  validateUberBondFeatureGenome
} from '../src/uberbond-feature-genome.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-feature-genome-'));
  const put = (p, content) => {
    const full = path.join(root, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  put('package.json', JSON.stringify({ scripts: { frontier: 'node scripts/frontier.mjs' } }));
  put('src/gamechanger-unit.mjs', "import { x } from './truth-unit.mjs';\nexport const y=x;\n");
  put('src/truth-unit.mjs', 'export const x=1;\n');
  put('scripts/frontier.mjs', "import '../src/gamechanger-unit.mjs';\n");
  put('config/system-readiness-input.json', JSON.stringify({ capabilities: [{ id: 'truth-evidence', status: 'IMPLEMENTED', level: 3, evidence: ['src/truth-unit.mjs'], tests: [] }] }));
  put('config/reachability-classification.json', JSON.stringify({ gates: { TEST_GATE: { description: 'fixture', releasedBy: 'fixture' } }, modules: { 'src/truth-unit.mjs': { category: 'AWAITING_ACTIVATION', gate: 'TEST_GATE', reason: 'fixture' } } }));
  put('artifacts/uberbond-total-brain.json', JSON.stringify({ capabilities: ['Gamechanger', 'Truth Evidence'] }));
  put('artifacts/perpetual-frontier-genesis.json', JSON.stringify({ status: 'CHAT_SPEC_GOAL_WITH_EXECUTABLE_ZERO_EFFECT_FOUNDATION', ideaCount: 275, frontierMechanisms: ['Unknown Unknowns'], coreLoop: ['WORLD', 'GENESIS'], firstExecutableLayer: { capabilities: ['frontier shockwaves'] } }));
  put('config/uberbond-cognitive-lineage.json', JSON.stringify({ schemaVersion: 'uberbond.cognitive-lineage.v1', lineages: [{ id: 'fixture', names: ['Fixture donor'], livingOrgans: ['genesis'] }] }));
  return root;
}

test('feature classifier maps concrete feature names to cognitive families', () => {
  const frontier = classifyFeaturePath('src/gamechanger-mesh.mjs');
  assert.equal(frontier.primaryFamily, 'frontier-intelligence');
  assert.ok(frontier.organs.includes('gamechanger'));
  const payment = classifyFeaturePath('src/payment-reconciliation.mjs');
  assert.ok(payment.organs.includes('payment-reconciliation'));
});

test('compute sovereignty and compute budgets remain first-class rather than generic runtime', () => {
  for (const feature of ['src/compute-sovereignty.mjs', 'src/ai-compute-budget.mjs', 'scripts/compute-sovereignty-doctor.mjs']) {
    const classified = classifyFeaturePath(feature);
    assert.ok(classified.families.includes('compute-sovereignty'), JSON.stringify({ feature, classified }));
    assert.notEqual(classified.primaryFamily, 'general-runtime');
    assert.ok(classified.organs.includes('open-model-universe') || classified.organs.includes('avengers'));
  }
});

test('module dependency derivation preserves real relative import edges only', () => {
  const files = new Set(['src/a.mjs', 'src/b.mjs']);
  const edges = deriveModuleEdgesFromText('src/a.mjs', "import './b.mjs'; import 'node:fs';", files);
  assert.deepEqual(edges, [{ from: 'src/a.mjs', to: 'src/b.mjs', specifier: './b.mjs' }]);
});

test('feature genome inventories repository, canon, dependencies and frontier ideas without inventing authority', () => {
  const root = fixture();
  try {
    const genome = buildUberBondFeatureGenome({ root, sourceRevision: 'a'.repeat(40) });
    assert.equal(genome.ok, true, JSON.stringify(genome));
    assert.equal(genome.genesisIdeaCount, 275);
    assert.equal(genome.readinessCapabilityCount, 1);
    assert.equal(genome.activationGateCount, 1);
    assert.equal(genome.donorLineageCount, 1);
    assert.ok(genome.artifactNodes.some(item => item.path === 'src/gamechanger-unit.mjs'));
    assert.ok(genome.dependencyEdges.some(edge => edge.from === 'src/gamechanger-unit.mjs' && edge.to === 'src/truth-unit.mjs'));
    assert.equal(genome.businessEffectAuthority, 'NONE');
    const integrity = validateUberBondFeatureGenome(genome);
    assert.equal(integrity.ok, true, JSON.stringify(integrity));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
