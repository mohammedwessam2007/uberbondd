import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOrganismFoundationsDoctor } from '../scripts/organism-foundations-doctor.mjs';

const ZERO = {
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
};

test('organism foundation doctor makes all eight overnight organs operator-reachable without authority', () => {
  const result = compileOrganismFoundationsDoctor();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ORGANISM_FOUNDATIONS_OPERATOR_REACHABLE');
  assert.equal(result.foundationCount, 8);
  assert.deepEqual(result.foundations.map(item => item.id), [
    'world-capability-harvester',
    'command-center-client-policy',
    'command-center-ui-evolution',
    'compute-sovereignty-capacity',
    'lifetime-context-memory',
    'organism-metabolism',
    'pre-customer-revenue-readiness',
    'wessam-continuity'
  ]);
  assert.equal(result.foundations.find(item => item.id === 'command-center-ui-evolution').promotionAuthority, 'REVIEW_PR_ONLY');
  assert.equal(result.foundations.find(item => item.id === 'wessam-continuity').selfGrantAuthority, false);
  assert.equal(result.consequenceAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger, ZERO);
});
