import test from 'node:test';
import assert from 'node:assert/strict';
import { compileIntentSuperposition } from '../src/omega-intent-superposition.mjs';

const zero = receipt => {
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectLedger.messages, 0);
  assert.equal(receipt.externalEffectLedger.productionMutations, 0);
};

const research = { id: 'research-current-state', effectClass: 'READ_ONLY', contract: 'Inspect exact current evidence and source.' };

test('divergent founder interpretations preserve a reversible common core without choosing a winner', () => {
  const out = compileIntentSuperposition({ interpretations: [
    {
      id: 'ship-now',
      terminalContract: 'Prepare and deploy the verified change.',
      actions: [research, { id: 'deploy', effectClass: 'CONSEQUENTIAL', contract: 'Deploy the accepted artifact.' }]
    },
    {
      id: 'prepare-only',
      terminalContract: 'Prepare the verified change but do not deploy it.',
      actions: [research, { id: 'package', effectClass: 'NONE', contract: 'Package the accepted artifact locally.' }]
    }
  ] });
  assert.equal(out.ok, true);
  assert.equal(out.requiresFounderResolution, true);
  assert.equal(out.terminalContractsDiverge, true);
  assert.equal(out.consequentialDivergence, true);
  assert.equal(out.reversibleIntersection.length, 1);
  assert.equal(out.reversibleIntersection[0].id, 'research-current-state');
  assert.equal(out.allowedBeforeResolution.length, 1);
  assert.equal(out.founderResolutionAuthority, 'WESSAM_ONLY');
  zero(out);
});

test('nonconsequential interpretations can share safe work without manufacturing semantic certainty', () => {
  const out = compileIntentSuperposition({ interpretations: [
    { id: 'a', terminalContract: 'Compare architecture A.', actions: [research] },
    { id: 'b', terminalContract: 'Compare architecture B.', actions: [research] }
  ] });
  assert.equal(out.ok, true);
  assert.equal(out.requiresFounderResolution, true);
  assert.equal(out.reversibleIntersection.length, 1);
  assert.match(out.truthBoundary, /does not infer.*exhaustive/i);
});

test('one interpretation does not invent a founder clarification gate', () => {
  const out = compileIntentSuperposition({ interpretations: [
    { id: 'single', terminalContract: 'Inspect only.', actions: [research] }
  ] });
  assert.equal(out.ok, true);
  assert.equal(out.requiresFounderResolution, false);
  assert.equal(out.status, 'OMEGA_INTENT_SUPERPOSITION_NONCONSEQUENTIAL');
});

test('consequential action is not part of pre-resolution intersection unless every interpretation matches it exactly', () => {
  const out = compileIntentSuperposition({ interpretations: [
    { id: 'a', terminalContract: 'A', actions: [research, { id: 'send', effectClass: 'CONSEQUENTIAL', contract: 'Send message A.' }] },
    { id: 'b', terminalContract: 'B', actions: [research, { id: 'send', effectClass: 'CONSEQUENTIAL', contract: 'Send message B.' }] }
  ] });
  assert.equal(out.allowedBeforeResolution.length, 1);
  assert.equal(out.reversibleIntersection.some(action => action.effectClass === 'CONSEQUENTIAL'), false);
});
