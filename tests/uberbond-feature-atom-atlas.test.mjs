import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deriveExportedFeatureSymbols, buildUberBondFeatureAtomAtlas, queryFeatureAtomAtlas } from '../src/uberbond-feature-atom-atlas.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uberbond-feature-atlas-'));
  const put = (p, content) => {
    const full = path.join(root, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  put('src/example.mjs', 'export const alpha=1; export function beta(){}; export class Gamma{}; const hidden=1; export { hidden as delta };');
  put('docs/PERPETUAL_FRONTIER_GENESIS_CANON.md', '1. Unknown-Unknown Engine\n2. Artificial Serendipity Engine\n');
  put('artifacts/perpetual-frontier-implementation-ledger.json', JSON.stringify({ entries: [
    { id: 1, name: 'Unknown-Unknown Engine', maturity: 'PARTIAL_PRIMITIVE', status: 'OBSERVED_INTERNAL_RUNTIME_RECEIPT', sources: ['src/x.mjs'], tests: ['tests/x.test.mjs'], runtimeReceipts: ['artifact:x'], missingPaths: [], note: 'fixture' },
    { id: 2, name: 'Artificial Serendipity Engine', maturity: 'IMPLEMENTED_PRIMITIVE', status: 'SOURCE_AND_TEST_PRESENT', sources: ['src/y.mjs'], tests: ['tests/y.test.mjs'], runtimeReceipts: [], missingPaths: [], note: 'fixture' }
  ] }));
  const featureGenome = {
    ok: true,
    genomeDigest: 'a'.repeat(64),
    artifactNodes: [{ path: 'src/example.mjs', kind: 'SOURCE_MODULE', primaryFamily: 'frontier-intelligence', families: ['frontier-intelligence'], organs: ['genesis'] }],
    packageScripts: [{ id: 'operator:brain', name: 'brain', command: 'node brain.mjs', classification: { organs: ['world-brain'], families: ['context-memory'] } }],
    readinessCapabilities: [{ id: 'truth-evidence', status: 'IMPLEMENTED', level: 3, evidence: [], tests: [] }],
    activationGates: [{ id: 'NO_PROVIDER', description: 'fixture', releasedBy: 'provider' }],
    totalBrainAtoms: [{ source: 'artifacts/uberbond-total-brain.json', path: 'capabilities[0]', value: 'Mechanism Lab' }],
    donorLineages: [{ id: 'old-wave', names: ['Everest'], livingOrgans: ['world-brain'] }]
  };
  return { root, featureGenome };
}

test('export symbol atlas sees public source features but not private helpers', () => {
  const symbols = deriveExportedFeatureSymbols('export const alpha=1; export function beta(){}; const hidden=1; export { hidden as delta };');
  assert.deepEqual(symbols.map(item => item.name).sort(), ['alpha', 'beta', 'delta']);
});

test('atlas makes code, operators, GENESIS ideas, readiness, gates, memory and donors addressable', () => {
  const { root, featureGenome } = fixture();
  try {
    const atlas = buildUberBondFeatureAtomAtlas({ root, featureGenome });
    assert.equal(atlas.ok, true, JSON.stringify(atlas));
    assert.equal(atlas.classCounts.exportedCodeFeatures, 4);
    assert.equal(atlas.classCounts.operatorCommands, 1);
    assert.equal(atlas.classCounts.genesisIdeas, 2);
    assert.equal(atlas.classCounts.readinessCapabilities, 1);
    assert.equal(atlas.classCounts.activationGates, 1);
    assert.equal(atlas.classCounts.totalBrainMemoryAtoms, 1);
    assert.equal(atlas.classCounts.historicalDonors, 1);
    assert.equal(atlas.genesisMaturityCounts.PARTIAL_PRIMITIVE, 1);
    assert.equal(atlas.genesisMaturityCounts.IMPLEMENTED_PRIMITIVE, 1);
    assert.equal(atlas.genesisImplementationStatusCounts.OBSERVED_INTERNAL_RUNTIME_RECEIPT, 1);
    const idea = atlas.classes.genesisIdeas.find(item => item.ordinal === 1);
    assert.equal(idea.runtimeReceipts.length, 1);
    assert.equal(atlas.businessEffectAuthority, 'NONE');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('atlas queries by text, class and organ without promoting memory into runtime truth', () => {
  const { root, featureGenome } = fixture();
  try {
    const atlas = buildUberBondFeatureAtomAtlas({ root, featureGenome });
    const query = queryFeatureAtomAtlas(atlas, { text: 'unknown-unknown', classes: ['GENESIS_IDEA'] });
    assert.equal(query.ok, true);
    assert.equal(query.matchCount, 1);
    assert.equal(query.matches[0].truthClass, 'CHAT_SPEC_GOAL_OR_INTERNAL_RESEARCH');
    const brain = queryFeatureAtomAtlas(atlas, { organs: ['world-brain'] });
    assert.ok(brain.matches.some(item => item.class === 'OPERATOR_COMMAND'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('GENESIS ledger identity drift fails closed', () => {
  const { root, featureGenome } = fixture();
  try {
    const ledgerPath = path.join(root, 'artifacts/perpetual-frontier-implementation-ledger.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    ledger.entries[0].name = 'Different Idea';
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger));
    const atlas = buildUberBondFeatureAtomAtlas({ root, featureGenome });
    assert.equal(atlas.ok, false);
    assert.ok(atlas.reasonCodes.some(code => code.includes('genesis-ledger-identity-mismatch')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
