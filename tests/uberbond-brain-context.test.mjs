import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileUberBondHandoff, compileUberBondProjectContext, validateUberBondBootstrap, validateUberBondMemoryIndex } from '../src/uberbond-brain-context.mjs';

const memory = JSON.parse(fs.readFileSync(new URL('../artifacts/uberbond-memory-index.json', import.meta.url), 'utf8'));
const bootstrap = {
  schemaVersion: 'uberbond-bootstrap-1.1.0', project: 'UberBond', generatedAt: '2026-08-28T19:14:00.000Z',
  objective: 'Maximize risk-adjusted cleared contribution profit per founder minute without inventing evidence or bypassing consequence controls.',
  truthHierarchy: ['OPERATOR', 'CURRENT_REPOSITORY_CANON', 'EXTERNAL_PROVIDER_OR_CUSTOMER_EVIDENCE', 'LATEST_NON_CONTRADICTED_EVIDENCE', 'PRIOR_CONCLUSIONS', 'SYNTHETIC_OUTPUT'],
  canonPointers: ['AGENTS.md', 'UBERBOND_CANON.md', 'UBERBOND_BOOTSTRAP.json', 'docs/UBERBOND_MASTER_MEMORY.md', 'artifacts/uberbond-memory-index.json', 'docs/HISTORICAL_PROJECT_LINEAGE.md', 'docs/DISTRIBUTION_OS_CANON.md', 'docs/CURRENT_HANDOFF.json'],
  goals: ['founder-light autonomous revenue engine', 'world-class distribution', 'evidence-bound payment delivery renewal learning'],
  architectureSpine: ['CONSTITUTION', 'IDENTITY', 'RIGHTS', 'CONSENT', 'DELEGATION', 'EXECUTION', 'PROOF_DAG', 'VALUE', 'LEARNING', 'REVOCATION'],
  capabilityFamilies: ['opportunity discovery', 'distribution', 'delivery', 'payment', 'commercial learning'],
  productFamilies: memory.productFamilies,
  protectedPaths: ['lite/'],
  externalProofGates: ['real provider credentials and authorized spend', 'real customer demand', 'cleared payment', 'customer acceptance', 'renewal', 'sustained unattended operation'],
  startupProtocol: ['read AGENTS.md', 'read UBERBOND_CANON.md', 'read master memory', 'read memory index', 'read durable handoff', 'inspect latest main before acting', 'dedupe before building'],
  memoryIndexPath: 'artifacts/uberbond-memory-index.json',
  masterMemoryPath: 'docs/UBERBOND_MASTER_MEMORY.md',
  continuity: {
    handoffPath: 'docs/CURRENT_HANDOFF.json',
    startupInstruction: 'Load repository canon and master memory before using chat memory.',
    updateInstruction: 'Update durable handoff after every material mission.',
    chatImportInstruction: 'Digest material future chat exports into repository-native memory with provenance, decisions, contradictions and supersession links; never rely on a share URL alone.'
  }
};
const paths = bootstrap.canonPointers;

function context(overrides = {}) {
  return compileUberBondProjectContext({ bootstrap, memoryIndex: memory, sourceCommit: 'b894a4cfae8acddd6170095f2373f339ff65f15c', availablePaths: paths, now: '2026-08-28T20:00:00Z', ...overrides });
}

test('v1.1 bootstrap validates and stays zero-effect', () => {
  const result = validateUberBondBootstrap(bootstrap);
  assert.equal(result.ok, true);
});

test('memory index validates and yields a deterministic digest', () => {
  const a = validateUberBondMemoryIndex(memory);
  const b = validateUberBondMemoryIndex(structuredClone(memory));
  assert.equal(a.ok, true);
  assert.match(a.memoryDigest, /^[a-f0-9]{64}$/);
  assert.equal(a.memoryDigest, b.memoryDigest);
  assert.equal(a.businessEffectAuthority, 'NONE');
});

test('project context is deterministic across compile times and binds memory digest', () => {
  const a = context({ now: '2026-08-28T20:00:00Z' });
  const b = context({ now: '2026-08-28T20:05:00Z' });
  assert.equal(a.ok, true);
  assert.equal(a.context.contextDigest, b.context.contextDigest);
  assert.notEqual(a.context.compiledAt, b.context.compiledAt);
  assert.equal(a.context.memoryDigest, validateUberBondMemoryIndex(memory).memoryDigest);
});

test('v1.1 context refuses missing master-memory and machine-index paths', () => {
  const result = compileUberBondProjectContext({ bootstrap, memoryIndex: memory, sourceCommit:'b894a4c', availablePaths:['UBERBOND_CANON.md','UBERBOND_BOOTSTRAP.json','docs/DISTRIBUTION_OS_CANON.md'] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('required-canon-path-missing'));
  assert.ok(result.missingPaths.includes('docs/UBERBOND_MASTER_MEMORY.md'));
  assert.ok(result.missingPaths.includes('artifacts/uberbond-memory-index.json'));
});

test('v1.1 context refuses a missing memory object rather than silently shrinking history', () => {
  const result = compileUberBondProjectContext({ bootstrap, sourceCommit:'b894a4c', availablePaths:paths });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-memory-index-required'));
});

test('secret-like keys and values are prohibited from both bootstrap and memory', () => {
  const a = validateUberBondBootstrap({ ...bootstrap, apiToken:'abc' });
  assert.equal(a.ok, false);
  assert.ok(a.reasonCodes.includes('secret-like-bootstrap-content-prohibited'));
  const poisoned = structuredClone(memory);
  poisoned.apiToken = 'abc';
  const b = validateUberBondMemoryIndex(poisoned);
  assert.equal(b.ok, false);
  assert.ok(b.reasonCodes.includes('secret-like-memory-content-prohibited'));
});

test('duplicate initiative identity is refused rather than deduped or overwritten', () => {
  const duplicate = structuredClone(memory);
  duplicate.namedInitiatives.push({ ...duplicate.namedInitiatives[0], name: 'Different visible name' });
  const result = validateUberBondMemoryIndex(duplicate);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('bounded-unique-named-initiative-array-required'));
});

test('owner-recalled unresolved initiative cannot disappear from unresolved-name ledger', () => {
  const broken = structuredClone(memory);
  broken.unresolvedNames = [];
  const result = validateUberBondMemoryIndex(broken);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('owner-recalled-unresolved-initiative-missing-from-unresolved-names'));
});

test('Everest is preserved as unresolved instead of fabricated or silently forgotten', () => {
  const result = context();
  assert.equal(result.ok, true);
  const everest = result.context.namedInitiatives.find(item => item.id === 'everest');
  assert.equal(everest.status, 'OWNER_RECALLED_UNRESOLVED');
  assert.ok(result.context.unresolvedNames.some(item => item.name === 'Everest'));
});

test('historical generated OMNIA scale stays explicitly historical in executable context', () => {
  const result = context();
  const v7 = result.context.namedInitiatives.find(item => item.id === 'omnia-x64m-v7');
  assert.equal(v7.status, 'HISTORICAL_GENERATED');
  assert.match(v7.currentReconciliation, /not current repository, production or commercial proof/i);
});

test('portfolio breadth survives context compilation without becoming active commercial truth', () => {
  const result = context();
  assert.equal(result.ok, true);
  const snapshot = result.context.historicalCorpusSnapshots.find(item => item.asOf === '2026-08-27');
  assert.equal(snapshot.metrics.canonicalCommercialOffers, 200);
  assert.equal(snapshot.metrics.scoredCombinations, 2000);
  assert.match(snapshot.warning, /represented as customers.*or revenue/i);
});

test('memory changes alter memory and project context digests', () => {
  const changed = structuredClone(memory);
  changed.namedInitiatives.find(item => item.id === 'everest').currentReconciliation += ' Additional future source required.';
  const a = validateUberBondMemoryIndex(memory);
  const b = validateUberBondMemoryIndex(changed);
  assert.notEqual(a.memoryDigest, b.memoryDigest);
  const ca = context();
  const cb = compileUberBondProjectContext({ bootstrap, memoryIndex: changed, sourceCommit:'b894a4cfae8acddd6170095f2373f339ff65f15c', availablePaths:paths, now:'2026-08-28T20:00:00Z' });
  assert.notEqual(ca.context.contextDigest, cb.context.contextDigest);
});

test('bootstrap and memory product-family disagreement fails closed', () => {
  const altered = { ...bootstrap, productFamilies: [...bootstrap.productFamilies].reverse() };
  const result = compileUberBondProjectContext({ bootstrap: altered, memoryIndex: memory, sourceCommit:'b894a4c', availablePaths:paths });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('bootstrap-memory-product-family-mismatch'));
});

test('context preserves external proof gates and never upgrades authority', () => {
  const result = context();
  assert.equal(result.context.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.ok(result.context.externalTruthLaw.includes('CANNOT_SYNTHESIZE'));
  assert.deepEqual(result.context.externalProofGates, bootstrap.externalProofGates);
});

test('durable handoff binds active mission to both project and memory digests', () => {
  const projectContext = context().context;
  const result = compileUberBondHandoff({ projectContext, activeMission:'Build repository-native UberBond Master Memory V2.', completed:['memory index'], blockers:['external proof'], nextActions:['verify','merge'] });
  assert.equal(result.ok, true);
  assert.equal(result.handoff.contextDigest, projectContext.contextDigest);
  assert.equal(result.handoff.memoryDigest, projectContext.memoryDigest);
  assert.ok(result.handoff.unresolvedNames.some(item => item.name === 'Everest'));
  assert.match(result.handoff.handoffDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.handoff.businessEffectAuthority, 'NONE');
});

test('legacy v1.0 bootstrap remains readable for historical handoffs', () => {
  const legacy = structuredClone(bootstrap);
  legacy.schemaVersion = 'uberbond-bootstrap-1.0.0';
  delete legacy.memoryIndexPath;
  delete legacy.masterMemoryPath;
  delete legacy.continuity.chatImportInstruction;
  legacy.canonPointers = legacy.canonPointers.filter(path => !['docs/UBERBOND_MASTER_MEMORY.md','artifacts/uberbond-memory-index.json'].includes(path));
  const result = compileUberBondProjectContext({ bootstrap: legacy, sourceCommit:'ea1d821d', availablePaths:legacy.canonPointers });
  assert.equal(result.ok, true);
  assert.equal(result.context.schemaVersion, 'uberbond-project-context-1.0.0');
  assert.equal(result.context.memoryDigest, null);
});

test('oversized memory arrays fail closed instead of truncating project history', () => {
  const oversized = structuredClone(memory);
  oversized.namedInitiatives = Array.from({length:513},(_,i)=>({id:`i-${i}`,name:`Initiative ${i}`,status:'HISTORICAL_DONOR',role:'role',currentReconciliation:'history'}));
  assert.equal(validateUberBondMemoryIndex(oversized).ok, false);
});