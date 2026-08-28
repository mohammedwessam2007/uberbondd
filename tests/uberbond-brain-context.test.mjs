import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberBondHandoff, compileUberBondProjectContext, validateUberBondBootstrap } from '../src/uberbond-brain-context.mjs';

const bootstrap = {
  schemaVersion: 'uberbond-bootstrap-1.0.0', project: 'UberBond', generatedAt: '2026-08-28T18:31:39.000Z',
  objective: 'Maximize risk-adjusted cleared contribution profit per founder minute without inventing evidence or bypassing consequence controls.',
  truthHierarchy: ['OPERATOR', 'CURRENT_REPOSITORY_CANON', 'EXTERNAL_PROVIDER_OR_CUSTOMER_EVIDENCE', 'LATEST_NON_CONTRADICTED_EVIDENCE', 'PRIOR_CONCLUSIONS', 'SYNTHETIC_OUTPUT'],
  canonPointers: ['AGENTS.md', 'UBERBOND_CANON.md', 'docs/HISTORICAL_PROJECT_LINEAGE.md', 'docs/DISTRIBUTION_OS_CANON.md', 'docs/CURRENT_HANDOFF.json'],
  goals: ['founder-light autonomous revenue engine', 'world-class distribution', 'evidence-bound payment delivery renewal learning'],
  architectureSpine: ['CONSTITUTION', 'IDENTITY', 'RIGHTS', 'CONSENT', 'DELEGATION', 'EXECUTION', 'PROOF_DAG', 'VALUE', 'LEARNING', 'REVOCATION'],
  capabilityFamilies: ['opportunity discovery', 'distribution', 'delivery', 'payment', 'commercial learning'],
  productFamilies: ['Partner Revenue Assurance', 'AI Reliability and Acceptance', 'Evidence and Reconciliation', 'White-Label Fulfilment', 'GCC Bilingual Operations', 'Recovery and Vertical Operations'],
  protectedPaths: ['lite/'],
  externalProofGates: ['real provider credentials and authorized spend', 'real customer demand', 'cleared payment', 'customer acceptance', 'renewal', 'sustained unattended operation'],
  startupProtocol: ['read AGENTS.md', 'read UBERBOND_CANON.md', 'read UBERBOND_BOOTSTRAP.json', 'read historical lineage', 'read durable handoff', 'inspect latest main before acting', 'dedupe before building'],
  continuity: { handoffPath: 'docs/CURRENT_HANDOFF.json', startupInstruction: 'Load repository canon before using chat memory.', updateInstruction: 'Update durable handoff after every material mission.' }
};
const paths = ['AGENTS.md','UBERBOND_CANON.md','UBERBOND_BOOTSTRAP.json','docs/HISTORICAL_PROJECT_LINEAGE.md','docs/DISTRIBUTION_OS_CANON.md','docs/CURRENT_HANDOFF.json'];

test('bootstrap validates and stays zero-effect', () => {
  const result = validateUberBondBootstrap(bootstrap);
  assert.equal(result.ok, true);
});

test('project context is deterministic across compile times', () => {
  const a = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821db8768330912ad4794dd298f6ba67ee4c', availablePaths:paths, now:'2026-08-28T20:00:00Z' });
  const b = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821db8768330912ad4794dd298f6ba67ee4c', availablePaths:paths, now:'2026-08-28T20:05:00Z' });
  assert.equal(a.ok, true); assert.equal(a.context.contextDigest, b.context.contextDigest);
  assert.notEqual(a.context.compiledAt, b.context.compiledAt);
});

test('missing canon path fails closed', () => {
  const result = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821d', availablePaths:['UBERBOND_CANON.md'] });
  assert.equal(result.ok, false); assert.ok(result.reasonCodes.includes('required-canon-path-missing'));
});

test('secret-like keys and values are prohibited from durable brain state', () => {
  const a = validateUberBondBootstrap({ ...bootstrap, apiToken:'abc' });
  assert.equal(a.ok, false); assert.ok(a.reasonCodes.includes('secret-like-bootstrap-content-prohibited'));
  const b = validateUberBondBootstrap({ ...bootstrap, goals:[...bootstrap.goals, 'Bearer abcdefghijklmnopqrstuvwxyz'] });
  assert.equal(b.ok, false);
});

test('oversized goals and pointers fail closed instead of truncating mission state', () => {
  assert.equal(validateUberBondBootstrap({ ...bootstrap, goals:Array.from({length:129},(_,i)=>`g${i}`) }).ok, false);
  assert.equal(validateUberBondBootstrap({ ...bootstrap, canonPointers:Array.from({length:129},(_,i)=>`x/${i}`) }).ok, false);
});

test('context preserves external proof gates and never upgrades authority', () => {
  const result = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821db8768330912ad4794dd298f6ba67ee4c', availablePaths:paths });
  assert.equal(result.context.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.ok(result.context.externalTruthLaw.includes('CANNOT_SYNTHESIZE'));
  assert.deepEqual(result.context.externalProofGates, bootstrap.externalProofGates);
});

test('historical product-family lineage survives the executable context digest', () => {
  const result = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821d', availablePaths:paths });
  assert.equal(result.ok, true);
  assert.deepEqual(result.context.productFamilies, bootstrap.productFamilies);
  assert.ok(result.context.canonPointers.includes('docs/HISTORICAL_PROJECT_LINEAGE.md'));
});

test('truth hierarchy survives compile exactly and keeps operator above synthetic output', () => {
  const result = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821d', availablePaths:paths });
  assert.deepEqual(result.context.truthHierarchy, bootstrap.truthHierarchy);
  assert.ok(result.context.truthHierarchy.indexOf('OPERATOR') < result.context.truthHierarchy.indexOf('SYNTHETIC_OUTPUT'));
});

test('durable handoff binds active mission to project context digest', () => {
  const context = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821d', availablePaths:paths }).context;
  const result = compileUberBondHandoff({ projectContext:context, activeMission:'Build cross-chat brain and elite distribution control plane.', completed:['canon'], blockers:['real-world proof'], nextActions:['verify','merge'] });
  assert.equal(result.ok, true); assert.equal(result.handoff.contextDigest, context.contextDigest); assert.match(result.handoff.handoffDigest,/^[a-f0-9]{64}$/);
  assert.equal(result.handoff.businessEffectAuthority, 'NONE');
});

test('handoff refuses malformed context and unbounded arrays', () => {
  assert.equal(compileUberBondHandoff({ projectContext:{}, activeMission:'x' }).ok, false);
  const context = compileUberBondProjectContext({ bootstrap, sourceCommit:'ea1d821d', availablePaths:paths }).context;
  assert.equal(compileUberBondHandoff({ projectContext:context, activeMission:'x', completed:Array.from({length:101},(_,i)=>`x${i}`) }).ok, false);
});
