import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyCoverageStateEvidenceIntegrity } from '../src/coverage-state-evidence-integrity.mjs';

const row = (overrides = {}) => ({
  canonicalId: 'north-star:wallbreaker',
  class: 'ORGAN',
  currentState: 'VERIFIED_CURRENT',
  currentEvidence: {
    sourceModules: ['src/wallbreaker.mjs'],
    testModules: ['tests/wallbreaker.test.mjs'],
    reachability: 'PRODUCTION',
    matchStrength: 'EXACT_SLUG',
    matchScope: 'WHOLE_NAME',
    matchedPhrase: 'Wallbreaker'
  },
  ...overrides
});

const coverage = rows => ({ rows });

test('a genuinely evidence-backed current row survives the independent tribunal', () => {
  const result = verifyCoverageStateEvidenceIntegrity(coverage([row()]));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.rowsChecked, 1);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('VERIFIED_CURRENT cannot be minted with no source or test evidence', () => {
  const forged = row({ currentEvidence: {
    sourceModules: [], testModules: [], reachability: null,
    matchStrength: 'NO_MATCH', matchScope: 'NONE', matchedPhrase: null
  }});
  const result = verifyCoverageStateEvidenceIntegrity(coverage([forged]));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('verified-current-requires-source-evidence'));
  assert.ok(result.reasonCodes.includes('verified-current-requires-test-evidence'));
  assert.ok(result.reasonCodes.includes('verified-current-requires-live-reachability'));
});

test('VERIFIED_CURRENT requires whole-name strong evidence and live reachability', () => {
  const forged = row({ currentEvidence: {
    sourceModules: ['src/wallbreaker.mjs'],
    testModules: ['tests/wallbreaker.test.mjs'],
    reachability: 'CLASSIFIED_OR_UNREACHABLE',
    matchStrength: 'ALL_TOKENS',
    matchScope: 'SUB_PHRASE',
    matchedPhrase: 'Wallbreaker'
  }});
  const result = verifyCoverageStateEvidenceIntegrity(coverage([forged]));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('verified-current-requires-live-reachability'));
  assert.ok(result.reasonCodes.includes('verified-current-requires-whole-name-evidence'));
  assert.ok(result.reasonCodes.includes('verified-current-requires-strong-match'));
});

test('caller-supplied currentness cannot override an owner boundary', () => {
  const result = verifyCoverageStateEvidenceIntegrity(coverage([row({ class: 'BOUNDARY' })]));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('owner-boundary-state-overridden'));
});

test('category and alias rows cannot masquerade as implemented organs', () => {
  for (const [klass, reason] of [
    ['ONTOLOGY', 'structural-state-overridden'],
    ['HIERARCHY', 'structural-state-overridden'],
    ['ALIAS', 'alias-state-overridden']
  ]) {
    const result = verifyCoverageStateEvidenceIntegrity(coverage([row({ class: klass })]));
    assert.equal(result.ok, false, klass);
    assert.ok(result.reasonCodes.includes(reason), klass);
  }
});

test('PARTIAL_CURRENT still requires a real source lead', () => {
  const forged = row({
    currentState: 'PARTIAL_CURRENT',
    currentEvidence: { sourceModules: [], testModules: [], reachability: null, matchStrength: 'NO_MATCH', matchScope: 'NONE' }
  });
  const result = verifyCoverageStateEvidenceIntegrity(coverage([forged]));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('partial-current-requires-source-evidence'));
});

test('parent-organ coverage is restricted to field classes', () => {
  const forged = row({ currentState: 'COVERED_BY_PARENT_ORGAN', class: 'ORGAN' });
  const result = verifyCoverageStateEvidenceIntegrity(coverage([forged]));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('parent-organ-coverage-requires-field-class'));
});

test('C11 current-truth tribunal actually invokes the independent verifier', () => {
  const source = readFileSync('src/current-truth-regeneration.mjs', 'utf8');
  assert.match(source, /import \{ verifyCoverageStateEvidenceIntegrity \} from '\.\/coverage-state-evidence-integrity\.mjs'/);
  assert.match(source, /const stateEvidenceIntegrity=verifyCoverageStateEvidenceIntegrity\(coverage\)/);
  assert.match(source, /if\(!stateEvidenceIntegrity\.ok\)reasons\.push\(\.\.\.stateEvidenceIntegrity\.reasonCodes\)/);
  assert.match(source, /coverageStateTruth:'CURRENT_IMPLEMENTATION_STATES_INDEPENDENTLY_BOUND_TO_ROW_EVIDENCE'/);
});
